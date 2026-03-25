mod config;
mod client;
mod model;
mod dto;
mod error;
mod locked_impl;
mod dynamic_impl;
mod verify_impl;
mod trust_registry;
mod policy_governance;
mod onboarding_registry;
mod secrets;

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use axum::{
    http::HeaderMap,
    routing::{get, post},
    Router,
    extract::{ConnectInfo, Path, State},
    Json,
};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use chrono::Utc;
use sha2::{Digest, Sha256};
use tokio::time::sleep;

use crate::client::NotarizationService;
use crate::config::NotarizationConfig;
use crate::dto::{
    EmergencyRollbackRequest, LaunchModeRequest, OnboardingActivateRequest, OnboardingRequestCreate,
    OnboardingReviewRequest, OpenDisputeRequest, PolicyActivateRequest, PolicyDraftRequest,
    PolicyRollbackRequest, ResolveDisputeRequest, RevokeCredentialRequest,
};
use crate::error::ApiError;
use crate::dynamic_impl::{create_dynamic, transfer_dynamic, update_dynamic_metadata, update_dynamic_state};
use crate::locked_impl::create_locked;
use crate::onboarding_registry::OnboardingRegistry;
use crate::policy_governance::PolicyGovernanceRegistry;
use crate::secrets::{EnvAndFileSecretProvider, SecretProvider};
use crate::trust_registry::{DisputeRecord, TrustPolicyData, RevocationRecord};
use crate::verify_impl::verify_notarization;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) service: Arc<NotarizationService>,
    governance: PolicyGovernanceRegistry,
    onboarding: OnboardingRegistry,
    secret_provider: Arc<dyn SecretProvider>,
    verify_rate_limits: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    admin_nonces: Arc<Mutex<HashSet<String>>>,
    idempotency: Arc<Mutex<HashMap<String, serde_json::Value>>>,
    verify_history: Arc<Mutex<Vec<serde_json::Value>>>,
    access_audit: Arc<Mutex<Vec<serde_json::Value>>>,
    status_counts: Arc<Mutex<HashMap<String, u64>>>,
    latency_samples_ms: Arc<Mutex<Vec<u64>>>,
    cache_hits: Arc<Mutex<u64>>,
    cache_misses: Arc<Mutex<u64>>,
    launch_mode: Arc<Mutex<String>>,
    synthetic_status: Arc<Mutex<Option<serde_json::Value>>>,
}

impl AppState {
    pub(crate) fn consume_admin_nonce(&self, nonce: &str) -> bool {
        let mut guard = self.admin_nonces.lock().expect("admin nonce lock poisoned");
        if guard.contains(nonce) {
            return false;
        }
        guard.insert(nonce.to_string());
        true
    }

    pub(crate) fn check_verify_rate_limit(&self, key: &str, max_per_minute: usize) -> bool {
        let mut bucket = self
            .verify_rate_limits
            .lock()
            .expect("verify rate limit lock poisoned");
        let now = Instant::now();
        let min_age = now.checked_sub(Duration::from_secs(60)).unwrap_or(now);
        let records = bucket.entry(key.to_string()).or_default();
        records.retain(|ts| *ts > min_age);
        if records.len() >= max_per_minute {
            return false;
        }
        records.push(now);
        true
    }

    pub(crate) fn get_idempotent(&self, key: &str) -> Option<serde_json::Value> {
        self.idempotency
            .lock()
            .expect("idempotency lock poisoned")
            .get(key)
            .cloned()
    }

    pub(crate) fn save_idempotent(&self, key: String, value: serde_json::Value) {
        self.idempotency
            .lock()
            .expect("idempotency lock poisoned")
            .insert(key, value);
    }

    pub(crate) fn record_verify_event(
        &self,
        request_id: &str,
        status: &str,
        latency_ms: u64,
        cache_hit: bool,
        checked_at: &str,
        reasons: &[String],
    ) {
        {
            let mut history = self.verify_history.lock().expect("verify history lock poisoned");
            history.push(serde_json::json!({
                "request_id": request_id,
                "status": status,
                "latency_ms": latency_ms,
                "cache_hit": cache_hit,
                "checked_at": checked_at,
                "reasons": reasons,
            }));
            prune_json_log(&mut history, self.service.config.log_retention_days, "checked_at");
        }

        {
            let mut counts = self.status_counts.lock().expect("status counts lock poisoned");
            *counts.entry(status.to_string()).or_insert(0) += 1;
        }

        self.latency_samples_ms
            .lock()
            .expect("latency samples lock poisoned")
            .push(latency_ms);

        if cache_hit {
            *self.cache_hits.lock().expect("cache hits lock poisoned") += 1;
        } else {
            *self.cache_misses.lock().expect("cache misses lock poisoned") += 1;
        }
    }

    pub(crate) fn record_access_event(
        &self,
        request_id: &str,
        actor: Option<String>,
        reason: Option<String>,
        metadata: serde_json::Value,
    ) {
        let mut audit = self.access_audit.lock().expect("access audit lock poisoned");
        audit.push(serde_json::json!({
            "request_id": request_id,
            "actor": actor,
            "reason": reason,
            "metadata": metadata,
            "timestamp": Utc::now().to_rfc3339(),
        }));
        prune_json_log(&mut audit, self.service.config.audit_retention_days, "timestamp");
    }

    pub(crate) fn metrics_snapshot(&self) -> serde_json::Value {
        let mut latencies = self
            .latency_samples_ms
            .lock()
            .expect("latency samples lock poisoned")
            .clone();
        latencies.sort_unstable();

        let p95_index = if latencies.is_empty() {
            0
        } else {
            (((latencies.len() as f64) * 0.95).ceil() as usize).saturating_sub(1)
        };
        let p95 = latencies.get(p95_index).cloned().unwrap_or(0);

        serde_json::json!({
            "slo": {
                "availability_target": "99.9%",
                "p95_verify_latency_ms_target": 500,
                "error_rate_target": "<1%"
            },
            "observed": {
                "verify_requests": self.verify_history.lock().expect("verify history lock poisoned").len(),
                "status_counts": self.status_counts.lock().expect("status counts lock poisoned").clone(),
                "p95_verify_latency_ms": p95,
                "cache_hits": *self.cache_hits.lock().expect("cache hits lock poisoned"),
                "cache_misses": *self.cache_misses.lock().expect("cache misses lock poisoned"),
            },
            "synthetic": self.synthetic_status.lock().expect("synthetic status lock poisoned").clone(),
        })
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = NotarizationConfig::from_env();
    let bind_addr = cfg.bind_addr.clone();

    // 2. Instantiate service
    let service = NotarizationService::new(cfg).await?;
    let governance = PolicyGovernanceRegistry::new(
        &service.config.policy_governance_path,
        &service.trust_registry.get_policy(),
    );
    let onboarding = OnboardingRegistry::new(&service.config.onboarding_store_path);
    let secret_provider = Arc::new(EnvAndFileSecretProvider::new(
        service.config.secrets_file_path.as_deref(),
    ));

    let state = AppState {
        service: Arc::new(service),
        governance,
        onboarding,
        secret_provider,
        verify_rate_limits: Arc::new(Mutex::new(HashMap::new())),
        admin_nonces: Arc::new(Mutex::new(HashSet::new())),
        idempotency: Arc::new(Mutex::new(HashMap::new())),
        verify_history: Arc::new(Mutex::new(Vec::new())),
        access_audit: Arc::new(Mutex::new(Vec::new())),
        status_counts: Arc::new(Mutex::new(HashMap::new())),
        latency_samples_ms: Arc::new(Mutex::new(Vec::new())),
        cache_hits: Arc::new(Mutex::new(0)),
        cache_misses: Arc::new(Mutex::new(0)),
        launch_mode: Arc::new(Mutex::new("dry_run".to_string())),
        synthetic_status: Arc::new(Mutex::new(None)),
    };

    *state
        .launch_mode
        .lock()
        .expect("launch mode lock poisoned") = state.service.config.launch_mode.clone();

    if state.service.config.synthetic_check_enabled && state.service.config.profile != "devnet" {
        let synthetic_state = state.clone();
        tokio::spawn(async move {
            loop {
                let result = run_synthetic_check(&synthetic_state).await;
                *synthetic_state
                    .synthetic_status
                    .lock()
                    .expect("synthetic status lock poisoned") = Some(result);

                sleep(Duration::from_secs(
                    synthetic_state.service.config.synthetic_check_interval_seconds,
                ))
                .await;
            }
        });
    }

    // 3. Define routes
    let app = Router::new()
        .route("/health", get(health_check))
        // Trust Policy Admin
        .route("/admin/policy", get(get_trust_policy).post(update_trust_policy))
        .route("/admin/revocations", post(revoke_credential))
        .route("/admin/disputes/open", post(open_dispute))
        .route("/admin/disputes/:id/resolve", post(resolve_dispute))
        .route("/api/v1/notarizations/:id/verify", post(verify_notarization))
        .route("/api/v1/notarizations/locked", post(create_locked))
        .route("/api/v1/notarizations/dynamic", post(create_dynamic))
        .route("/api/v2/policy/active", get(get_active_policy_v2))
        .route("/api/v2/policy/draft", post(create_policy_draft_v2))
        .route("/api/v2/policy/activate", post(activate_policy_draft_v2))
        .route("/api/v2/policy/rollback", post(rollback_policy_v2))
        .route("/api/v2/onboarding/request", post(onboarding_request_v2))
        .route("/api/v2/onboarding/review", post(onboarding_review_v2))
        .route("/api/v2/onboarding/activate", post(onboarding_activate_v2))
        .route("/api/v2/onboarding/:id", get(onboarding_get_v2))
        .route("/api/v2/onboarding/summary", get(onboarding_summary_v2))
        .route("/api/v2/compliance/report", get(compliance_report_v2))
        .route("/api/v2/metrics", get(metrics_v2))
        .route("/api/v2/release/artifact", get(release_artifact_v2))
        .route("/api/v2/launch/mode", post(set_launch_mode_v2))
        .route("/api/v2/launch/rollback", post(emergency_rollback_v2))
        .route("/api/v2/notarizations/:id/verify", post(verify_notarization))
        // Locked
        .route("/notarizations/locked", post(create_locked))
        // Dynamic
        .route("/notarizations/dynamic", post(create_dynamic))
        .route(
            "/notarizations/dynamic/:id/state",
            post(update_dynamic_state),
        )
        .route(
            "/notarizations/dynamic/:id/metadata",
            post(update_dynamic_metadata),
        )
        .route(
            "/notarizations/dynamic/:id/transfer",
            post(transfer_dynamic),
        )
        // Verify (works for both Locked & Dynamic)
        .route("/notarizations/:id/verify", post(verify_notarization))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    // 4. Start HTTP server
    let listener = TcpListener::bind(&bind_addr).await?;
    println!("Listening on {}", listener.local_addr()?);
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}

async fn get_trust_policy(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<TrustPolicyData>, ApiError> {
    authorize_admin(&state, &headers, addr.ip())?;
    Ok(Json(state.service.trust_registry.get_policy()))
}

async fn update_trust_policy(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(new_policy): Json<TrustPolicyData>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_admin(&state, &headers, addr.ip())?;
    state
        .service
        .trust_registry
        .save_policy(new_policy)
        .map_err(|err| ApiError::Internal(err.to_string()))?;
    state.service.invalidate_caches();
    Ok(Json(serde_json::json!({ "status": "ok" })))
}

async fn revoke_credential(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<RevokeCredentialRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_admin(&state, &headers, addr.ip())?;

    if req.target_id.trim().is_empty() || req.reason_code.trim().is_empty() || req.evidence_id.trim().is_empty() {
        return Err(ApiError::BadRequest("target_id, reason_code and evidence_id are required".to_string()));
    }

    let record = RevocationRecord {
        target_id: req.target_id.trim().to_string(),
        reason_code: req.reason_code.trim().to_string(),
        timestamp: Utc::now().to_rfc3339(),
        evidence_id: req.evidence_id.trim().to_string(),
        revoked_by: req.revoked_by.trim().to_string(),
        domain: req.domain.map(|domain| domain.trim().to_string()),
    };

    state
        .service
        .trust_registry
        .add_revocation(record)
        .map_err(|err| ApiError::Internal(err.to_string()))?;
    state.service.invalidate_caches();

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

async fn open_dispute(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<OpenDisputeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_admin(&state, &headers, addr.ip())?;

    if req.target_id.trim().is_empty() || req.opened_by.trim().is_empty() || req.reason.trim().is_empty() {
        return Err(ApiError::BadRequest("opened_by, target_id and reason are required".to_string()));
    }

    let policy = state.service.trust_registry.get_policy();
    let dispute = DisputeRecord {
        opened_by: req.opened_by.trim().to_string(),
        target_id: req.target_id.trim().to_string(),
        reason: req.reason.trim().to_string(),
        status: "open".to_string(),
        opened_at: Utc::now().to_rfc3339(),
        resolved_by: None,
        resolution_note: None,
        resolved_at: None,
        disposition: req.disposition.unwrap_or(policy.dispute_default_disposition),
    };

    state
        .service
        .trust_registry
        .open_dispute(dispute)
        .map_err(|err| ApiError::Internal(err.to_string()))?;
    state.service.invalidate_caches();

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

async fn resolve_dispute(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<ResolveDisputeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_admin(&state, &headers, addr.ip())?;
    if req.resolved_by.trim().is_empty() {
        return Err(ApiError::BadRequest("resolved_by is required".to_string()));
    }

    state
        .service
        .trust_registry
        .resolve_dispute(&id, req.resolved_by.trim(), req.resolution_note)
        .map_err(|err| ApiError::Internal(err.to_string()))?;
    state.service.invalidate_caches();

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

fn authorize_admin(state: &AppState, headers: &HeaderMap, ip: IpAddr) -> Result<(), ApiError> {
    let nonce = headers
        .get("x-admin-nonce")
        .and_then(|raw| raw.to_str().ok())
        .map(str::trim)
        .filter(|nonce| !nonce.is_empty())
        .ok_or_else(|| ApiError::Unauthorized("Missing x-admin-nonce header".to_string()))?;

    if !state.consume_admin_nonce(nonce) {
        return Err(ApiError::Unauthorized("Nonce already used".to_string()));
    }

    let cfg = &state.service.config;
    if cfg.admin_local_only && !ip.is_loopback() {
        return Err(ApiError::Unauthorized("Admin routes are local-only".to_string()));
    }

    if let Some(expected) = &cfg.admin_api_key {
        let provided = headers
            .get("x-api-key")
            .and_then(|raw| raw.to_str().ok())
            .ok_or_else(|| ApiError::Unauthorized("Missing x-api-key header".to_string()))?;
        if provided != expected {
            return Err(ApiError::Unauthorized("Invalid API key".to_string()));
        }
    }

    Ok(())
}

async fn get_active_policy_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "policy-admin", false)?;
    let policy = state.service.trust_registry.get_policy();
    let governance = state.governance.get();
    Ok(Json(serde_json::json!({
        "active_policy": policy,
        "governance": {
            "active_policy_version": governance.active_policy_version,
            "freeze_writes": governance.freeze_writes,
            "changelog_size": governance.changelog.len(),
        }
    })))
}

async fn create_policy_draft_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<PolicyDraftRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let key = authorize_role(&state, &headers, addr.ip(), "policy-admin", true)?;
    let idempotency_key = require_idempotency_key(&headers)?;
    if let Some(existing) = state.get_idempotent(&format!("policy_draft:{}", idempotency_key)) {
        return Ok(Json(existing));
    }

    verify_signature(
        &format!("{}:{}", req.policy_version, req.change_author),
        &req.signature,
        &key,
    )?;

    let result = state
        .governance
        .create_draft(
            &req.policy_version,
            req.policy,
            &req.change_author,
            &req.signature,
            req.change_note,
        )
        .map_err(|err| ApiError::BadRequest(err.to_string()))?;

    let response = serde_json::json!({
        "status": "ok",
        "active_policy_version": result.active_policy_version,
        "drafts": result.drafts.keys().collect::<Vec<_>>(),
    });
    state.save_idempotent(format!("policy_draft:{}", idempotency_key), response.clone());
    Ok(Json(response))
}

async fn activate_policy_draft_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<PolicyActivateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let key = authorize_role(&state, &headers, addr.ip(), "policy-admin", true)?;
    let idempotency_key = require_idempotency_key(&headers)?;
    if let Some(existing) = state.get_idempotent(&format!("policy_activate:{}", idempotency_key)) {
        return Ok(Json(existing));
    }

    verify_signature(
        &format!("{}:{}", req.policy_version, req.change_author),
        &req.signature,
        &key,
    )?;

    let (governance, policy) = state
        .governance
        .activate_draft(
            &req.policy_version,
            &req.change_author,
            &req.signature,
            req.change_note,
        )
        .map_err(|err| ApiError::BadRequest(err.to_string()))?;

    state
        .service
        .trust_registry
        .save_policy(policy)
        .map_err(|err| ApiError::Internal(err.to_string()))?;
    state.service.invalidate_caches();

    let response = serde_json::json!({
        "status": "ok",
        "active_policy_version": governance.active_policy_version,
        "compat_notice": "v1 policy endpoint remains supported; prefer /api/v2/policy/active",
    });
    state.save_idempotent(format!("policy_activate:{}", idempotency_key), response.clone());
    Ok(Json(response))
}

async fn rollback_policy_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<PolicyRollbackRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let key = authorize_role(&state, &headers, addr.ip(), "policy-admin", true)?;
    let idempotency_key = require_idempotency_key(&headers)?;
    if let Some(existing) = state.get_idempotent(&format!("policy_rollback:{}", idempotency_key)) {
        return Ok(Json(existing));
    }

    verify_signature(
        &format!("{}:{}", req.target_policy_version, req.change_author),
        &req.signature,
        &key,
    )?;

    let mut policy = state.service.trust_registry.get_policy();
    policy.version = req.target_policy_version.clone();
    let (governance, rolled_back) = state
        .governance
        .rollback_to(
            &req.target_policy_version,
            &req.change_author,
            &req.signature,
            req.change_note,
            req.freeze_policy.unwrap_or(false),
            policy,
        )
        .map_err(|err| ApiError::BadRequest(err.to_string()))?;

    state
        .service
        .trust_registry
        .save_policy(rolled_back)
        .map_err(|err| ApiError::Internal(err.to_string()))?;
    state.service.invalidate_caches();

    let response = serde_json::json!({
        "status": "ok",
        "active_policy_version": governance.active_policy_version,
        "freeze_writes": governance.freeze_writes,
    });
    state.save_idempotent(format!("policy_rollback:{}", idempotency_key), response.clone());
    Ok(Json(response))
}

async fn onboarding_request_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<OnboardingRequestCreate>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "onboarding-admin", true)?;
    let idempotency_key = require_idempotency_key(&headers)?;
    if let Some(existing) = state.get_idempotent(&format!("onboarding_request:{}", idempotency_key)) {
        return Ok(Json(existing));
    }

    let created = state
        .onboarding
        .request(
            req.organization_name,
            req.issuer_profile,
            req.domain_mapping,
            req.signer_verification,
            req.opened_by,
        )
        .map_err(|err| ApiError::BadRequest(err.to_string()))?;

    let response = serde_json::json!({"status": "ok", "record": created});
    state.save_idempotent(
        format!("onboarding_request:{}", idempotency_key),
        response.clone(),
    );
    Ok(Json(response))
}

async fn onboarding_review_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<OnboardingReviewRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "onboarding-admin", true)?;
    let idempotency_key = require_idempotency_key(&headers)?;
    if let Some(existing) = state.get_idempotent(&format!("onboarding_review:{}", idempotency_key)) {
        return Ok(Json(existing));
    }

    let reviewed = state
        .onboarding
        .review(&req.onboarding_id, req.reviewed_by, req.approve, req.review_note)
        .map_err(|err| ApiError::BadRequest(err.to_string()))?;
    let response = serde_json::json!({"status": "ok", "record": reviewed});
    state.save_idempotent(
        format!("onboarding_review:{}", idempotency_key),
        response.clone(),
    );
    Ok(Json(response))
}

async fn onboarding_activate_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<OnboardingActivateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "onboarding-admin", true)?;
    let idempotency_key = require_idempotency_key(&headers)?;
    if let Some(existing) = state.get_idempotent(&format!("onboarding_activate:{}", idempotency_key)) {
        return Ok(Json(existing));
    }

    let activated = state
        .onboarding
        .activate(&req.onboarding_id, req.activated_by)
        .map_err(|err| ApiError::BadRequest(err.to_string()))?;

    state
        .service
        .trust_registry
        .update(|policy| {
            policy.trusted_issuers.push(activated.issuer_profile.clone());
            policy.trusted_domains.push(activated.domain_mapping.clone());
        })
        .map_err(|err| ApiError::Internal(err.to_string()))?;

    state.service.invalidate_caches();
    let response = serde_json::json!({"status": "ok", "record": activated});
    state.save_idempotent(
        format!("onboarding_activate:{}", idempotency_key),
        response.clone(),
    );
    Ok(Json(response))
}

async fn onboarding_get_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "onboarding-admin", false)?;
    let record = state
        .onboarding
        .get_by_id(&id)
        .ok_or_else(|| ApiError::NotFound("onboarding record not found".to_string()))?;
    Ok(Json(serde_json::json!({"record": record})))
}

async fn onboarding_summary_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "onboarding-admin", false)?;
    Ok(Json(serde_json::json!({
        "summary": state.onboarding.summary(),
        "recent_audit_events": state.onboarding.audit_events().into_iter().rev().take(20).collect::<Vec<_>>()
    })))
}

async fn compliance_report_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "policy-admin", false)?;
    let access = state.access_audit.lock().expect("access audit lock poisoned").clone();
    let verify = state.verify_history.lock().expect("verify history lock poisoned").clone();
    Ok(Json(serde_json::json!({
        "generated_at": Utc::now().to_rfc3339(),
        "retention": {
            "audit_retention_days": state.service.config.audit_retention_days,
            "log_retention_days": state.service.config.log_retention_days,
        },
        "verification_events": verify.len(),
        "privacy_access_trail": access,
        "redaction": "payload values are never included; only metadata and hashes"
    })))
}

async fn metrics_v2(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(state.metrics_snapshot())
}

async fn release_artifact_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "policy-admin", false)?;
    let metrics = state.metrics_snapshot();
    let governance = state.governance.get();
    Ok(Json(serde_json::json!({
        "generated_at": Utc::now().to_rfc3339(),
        "profile": state.service.config.profile,
        "launch_mode": state.launch_mode.lock().expect("launch mode lock poisoned").clone(),
        "active_policy_version": governance.active_policy_version,
        "freeze_writes": governance.freeze_writes,
        "quality_gates": {
            "policy_loaded": true,
            "monitoring_active": true,
            "backup_recommended": true,
        },
        "metrics": metrics,
    })))
}

async fn set_launch_mode_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<LaunchModeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "policy-admin", true)?;
    if !matches!(req.mode.as_str(), "dry_run" | "canary" | "full") {
        return Err(ApiError::BadRequest(
            "launch mode must be dry_run|canary|full".to_string(),
        ));
    }
    *state
        .launch_mode
        .lock()
        .expect("launch mode lock poisoned") = req.mode.clone();
    Ok(Json(serde_json::json!({"status": "ok", "launch_mode": req.mode})))
}

async fn emergency_rollback_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<EmergencyRollbackRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let key = authorize_role(&state, &headers, addr.ip(), "policy-admin", true)?;
    verify_signature(
        &format!("{}:{}", req.target_policy_version, req.change_author),
        &req.signature,
        &key,
    )?;

    let mut policy = state.service.trust_registry.get_policy();
    policy.version = req.target_policy_version.clone();
    let (gov, policy) = state
        .governance
        .rollback_to(
            &req.target_policy_version,
            &req.change_author,
            &req.signature,
            req.reason,
            req.freeze_policy.unwrap_or(true),
            policy,
        )
        .map_err(|err| ApiError::BadRequest(err.to_string()))?;

    state
        .service
        .trust_registry
        .save_policy(policy)
        .map_err(|err| ApiError::Internal(err.to_string()))?;
    state.service.invalidate_caches();

    Ok(Json(serde_json::json!({
        "status": "ok",
        "rollback": true,
        "active_policy_version": gov.active_policy_version,
        "freeze_writes": gov.freeze_writes,
    })))
}

fn authorize_role(
    state: &AppState,
    headers: &HeaderMap,
    ip: IpAddr,
    required_role: &str,
    mutation: bool,
) -> Result<String, ApiError> {
    let provided_role = headers
        .get("x-role")
        .and_then(|raw| raw.to_str().ok())
        .map(str::trim)
        .ok_or_else(|| ApiError::Unauthorized("missing x-role header".to_string()))?;
    if provided_role != required_role {
        return Err(ApiError::Unauthorized("insufficient role".to_string()));
    }

    if state.service.config.admin_local_only
        && (required_role == "policy-admin" || required_role == "onboarding-admin")
        && !ip.is_loopback()
    {
        return Err(ApiError::Unauthorized("admin roles are local-only".to_string()));
    }

    let expected_key = match required_role {
        "verifier" => state
            .service
            .config
            .role_verifier_api_key
            .clone()
            .or_else(|| state.secret_provider.get_secret("ROLE_VERIFIER_API_KEY")),
        "policy-admin" => state
            .service
            .config
            .role_policy_admin_api_key
            .clone()
            .or_else(|| state.secret_provider.get_secret("ROLE_POLICY_ADMIN_API_KEY")),
        "onboarding-admin" => state
            .service
            .config
            .role_onboarding_admin_api_key
            .clone()
            .or_else(|| state.secret_provider.get_secret("ROLE_ONBOARDING_ADMIN_API_KEY")),
        _ => None,
    };

    let provided_key = headers
        .get("x-api-key")
        .and_then(|raw| raw.to_str().ok())
        .map(str::trim)
        .ok_or_else(|| ApiError::Unauthorized("missing x-api-key header".to_string()))?;

    if let Some(expected_key) = expected_key {
        if provided_key != expected_key {
            return Err(ApiError::Unauthorized("invalid role api key".to_string()));
        }
    } else {
        return Err(ApiError::Unauthorized(
            "role api key is not configured".to_string(),
        ));
    }

    if mutation {
        let nonce = headers
            .get("x-admin-nonce")
            .and_then(|raw| raw.to_str().ok())
            .map(str::trim)
            .filter(|nonce| !nonce.is_empty())
            .ok_or_else(|| ApiError::Unauthorized("missing x-admin-nonce header".to_string()))?;
        if !state.consume_admin_nonce(nonce) {
            return Err(ApiError::Unauthorized("nonce already used".to_string()));
        }
    }

    Ok(provided_key.to_string())
}

fn require_idempotency_key(headers: &HeaderMap) -> Result<String, ApiError> {
    headers
        .get("x-idempotency-key")
        .and_then(|raw| raw.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| ApiError::BadRequest("missing x-idempotency-key header".to_string()))
}

fn verify_signature(payload: &str, signature: &str, key: &str) -> Result<(), ApiError> {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}:{}", payload, key).as_bytes());
    let expected = hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();

    if signature != expected {
        return Err(ApiError::Unauthorized("invalid signed request".to_string()));
    }
    Ok(())
}

fn prune_json_log(entries: &mut Vec<serde_json::Value>, retention_days: i64, field: &str) {
    let cutoff = Utc::now() - chrono::Duration::days(retention_days.max(1));
    entries.retain(|entry| {
        entry
            .get(field)
            .and_then(|value| value.as_str())
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
            .map(|value| value.with_timezone(&Utc) >= cutoff)
            .unwrap_or(true)
    });
}

async fn run_synthetic_check(state: &AppState) -> serde_json::Value {
    let started = Instant::now();
    match (
        state.service.config.synthetic_notarization_id.clone(),
        state.service.config.synthetic_payload.clone(),
    ) {
        (Some(id), Some(payload)) => {
            let result = state.service.verify_notarization(&id, payload.as_bytes()).await;
            match result {
                Ok(verdict) => serde_json::json!({
                    "timestamp": Utc::now().to_rfc3339(),
                    "ok": true,
                    "status": format!("{:?}", verdict.status),
                    "latency_ms": started.elapsed().as_millis(),
                }),
                Err(error) => serde_json::json!({
                    "timestamp": Utc::now().to_rfc3339(),
                    "ok": false,
                    "error": error.to_string(),
                    "latency_ms": started.elapsed().as_millis(),
                }),
            }
        }
        _ => serde_json::json!({
            "timestamp": Utc::now().to_rfc3339(),
            "ok": false,
            "error": "synthetic target not configured",
            "latency_ms": started.elapsed().as_millis(),
        }),
    }
}
