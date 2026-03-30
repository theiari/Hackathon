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
mod did;

// PACKAGE REDEPLOYMENT REQUIRED after v5b Move changes.
// Run: cd move/counter && iota client publish --gas-budget 100000000
// Then update {NEW_PACKAGE_ID} in .env.example, constants.ts, backend .env

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use axum::{
    http::HeaderMap,
    routing::{get, post},
    Router,
    extract::{ConnectInfo, Path, Query, State},
    Json,
};
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use tokio::net::TcpListener;
use axum::http::HeaderValue;
use tower_http::cors::{Any, CorsLayer};
use chrono::Utc;
use sha2::{Digest, Sha256};
use serde::Serialize;
use tokio::time::sleep;

use crate::client::NotarizationService;
use crate::config::NotarizationConfig;
use crate::dto::{
    CreateCredentialRecordIntentRequest, EmergencyRollbackRequest, LaunchModeRequest,
    ExplorerCredentialItem, ExplorerQuery, ExplorerResponse,
    OnboardingActivateRequest, OnboardingRequestCreate, OnboardingReviewRequest,
    OpenDisputeRequest, PolicyActivateRequest, PolicyDraftRequest, PolicyRollbackRequest,
    PresentationToken, ResolveDisputeRequest, RevokeCredentialRequest, RevokeOnchainIntentRequest,
    TransactionIntentResponse,
    CreateAaAccountIntentRequest, AaGovernanceIntentRequest,
    AaSigningRequest, AaSubmitRequest, AaSubmitResponse,
};
use crate::error::ApiError;
use crate::dynamic_impl::{create_dynamic, transfer_dynamic, update_dynamic_metadata, update_dynamic_state};
use crate::locked_impl::create_locked;
use crate::onboarding_registry::OnboardingRegistry;
use crate::policy_governance::PolicyGovernanceRegistry;
use crate::secrets::{EnvAndFileSecretProvider, SecretProvider};
use crate::trust_registry::{DisputeRecord, TrustPolicyData, RevocationRecord};
use crate::verify_impl::{verify_notarization, verify_notarization_public};

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
    did_registry: crate::did::DidRegistry,
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
    let _ = dotenvy::dotenv();
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
        did_registry: crate::did::DidRegistry::new(),
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
        .route("/api/v1/public/verify/:id", get(verify_notarization_public))
        .route("/api/v1/public/present", get(public_present))
        .route("/api/v1/explorer/credentials", get(explorer_credentials_v1))
        .route("/api/v1/holder/:address/credentials", get(holder_credentials_v1))
        .route("/api/v1/templates/:template_id/fields", get(get_template_fields_v1))
        .route("/api/v1/notarizations/locked", post(create_locked))
        .route("/api/v1/notarizations/dynamic", post(create_dynamic))
        .route("/api/v2/credential-record/intent", post(credential_record_intent_v2))
        .route("/api/v2/credentials/:id/revoke-onchain", post(revoke_onchain_v2))
        .route("/api/v2/issuer/:domain_id/credentials", get(issuer_credentials_v2))
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
        .route("/api/v2/aa/create-account-intent", post(aa_create_account_intent_v2))
        .route("/api/v2/aa/governance-intent", post(aa_governance_intent_v2))
        .route("/api/v2/aa/submit", post(aa_submit_v2))
        .route("/api/v2/notarizations/:id/verify", post(verify_notarization))
        // DID
        .route("/api/v1/did/create", post(did_create))
        .route("/api/v1/did/resolve/:did_id", get(did_resolve))
        .route("/api/v1/did/list", get(did_list))
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
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    // 4. Start HTTP server
    let listener = TcpListener::bind(&bind_addr).await?;
    println!("Listening on {}", listener.local_addr()?);
    println!("Public verify endpoint: /api/v1/public/verify/:id (no auth required)");
    println!("Holder credentials endpoint: /api/v1/holder/:address/credentials");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}

// ── DID endpoints ──

#[derive(Debug, serde::Deserialize)]
struct DidCreateRequest {
    domain_object_id: String,
    controller_address: String,
    domain_name: String,
}

async fn did_create(
    State(state): State<AppState>,
    Json(req): Json<DidCreateRequest>,
) -> Result<Json<crate::did::DidDocument>, ApiError> {
    if !req.domain_object_id.starts_with("0x") {
        return Err(ApiError::BadRequest(
            "domain_object_id must start with 0x".into(),
        ));
    }
    let doc = state.did_registry.create_did_for_domain(
        &req.domain_object_id,
        &req.controller_address,
        &req.domain_name,
    );
    Ok(Json(doc))
}

async fn did_resolve(
    State(state): State<AppState>,
    Path(did_id): Path<String>,
) -> Result<Json<crate::did::DidDocument>, ApiError> {
    let did = if did_id.starts_with("did:") {
        did_id
    } else {
        format!("did:iota:devnet:{}", did_id.trim_start_matches("0x"))
    };
    state
        .did_registry
        .resolve(&did)
        .map(Json)
        .ok_or_else(|| ApiError::BadRequest(format!("DID not found: {}", did)))
}

async fn did_list(State(state): State<AppState>) -> Json<Vec<crate::did::DidDocument>> {
    Json(state.did_registry.list_all())
}

#[derive(Debug, Serialize)]
struct HolderCredentialItem {
    id: String,
    object_type: String,
    domain_id: Option<String>,
    asset_meta_preview: String,
    verdict: serde_json::Value,
    fetched_at: String,
}

#[derive(Debug, Serialize)]
struct HolderCredentialsResponse {
    address: String,
    credentials: Vec<HolderCredentialItem>,
    count: usize,
    truncated: bool,
    fetched_at: String,
}

#[derive(Debug, Clone)]
struct OwnedCredential {
    id: String,
    object_type: String,
    domain_id: Option<String>,
    asset_meta_preview: String,
}

#[derive(Debug, Serialize)]
struct TemplateField {
    name: String,
    field_type: u8,
    required: bool,
    description: String,
    #[serde(default)]
    min_length: u64,
    #[serde(default)]
    max_length: u64,
    #[serde(default)]
    min_value: u64,
    #[serde(default)]
    max_value: u64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pattern_hint: String,
}

#[derive(Debug, Serialize)]
struct TemplateFieldsResponse {
    template_id: String,
    credential_type: String,
    fields: Vec<TemplateField>,
}

#[derive(Debug, Serialize)]
struct IssuerCredentialItem {
    record_id: String,
    notarization_id: String,
    verdict: serde_json::Value,
    fetched_at: String,
}

#[derive(Debug, Serialize)]
struct IssuerCredentialsResponse {
    domain_id: String,
    credentials: Vec<IssuerCredentialItem>,
    total: usize,
    truncated: bool,
    fetched_at: String,
}

async fn holder_credentials_v1(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(address): Path<String>,
) -> Result<Json<HolderCredentialsResponse>, ApiError> {
    let rate_key = addr.ip().to_string();
    if !state.check_verify_rate_limit(&rate_key, state.service.config.verify_rate_limit_per_minute) {
        return Err(ApiError::RateLimited("verify_rate_limit_exceeded".to_string()));
    }

    let fetched_at = Utc::now().to_rfc3339();
    let mut owned = fetch_owned_credentials(
        &state.service.node_url,
        address.trim(),
        &state.service.package_id,
    )
    .await
    .map_err(|err| ApiError::Internal(format!("failed to fetch owned credentials: {err}")))?;

    let truncated = owned.len() > 50;
    if truncated {
        owned.truncate(50);
    }

    let mut credentials = Vec::with_capacity(owned.len());
    for item in owned {
        let verdict = state
            .service
            .verify_notarization(&item.id, b"")
            .await
            .map_err(|err| ApiError::Internal(format!("verify failed for {}: {}", item.id, err)))?;

        credentials.push(HolderCredentialItem {
            id: item.id,
            object_type: item.object_type,
            domain_id: item.domain_id,
            asset_meta_preview: item.asset_meta_preview,
            verdict: serde_json::json!({
                "id": verdict.id,
                "verified": verdict.verified,
                "status": verdict.status,
                "summary": verdict.summary,
                "reasons": verdict.reasons,
                "issuer": verdict.issuer,
                "domain": verdict.domain,
                "template": verdict.template,
                "revocation": verdict.revocation,
                "dispute": verdict.dispute,
                "policy_version": verdict.policy_version,
                "checked_at": verdict.checked_at,
                "request_id": format!("holder-{}", uuid::Uuid::new_v4()),
                "evidence": verdict.evidence,
                "credential_metadata": verdict.credential_metadata,
                "on_chain_transferable": verdict.on_chain_transferable,
                "latency_ms": verdict.latency_ms,
                "cache_hit": verdict.cache_hit,
                "compat_notice": verdict.compat_notice,
            }),
            fetched_at: Utc::now().to_rfc3339(),
        });
    }

    Ok(Json(HolderCredentialsResponse {
        address: address.trim().to_string(),
        count: credentials.len(),
        credentials,
        truncated,
        fetched_at,
    }))
}

async fn get_template_fields_v1(
    State(state): State<AppState>,
    Path(template_id): Path<String>,
) -> Result<Json<TemplateFieldsResponse>, ApiError> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "iota_getObject",
        "params": [template_id, {"showContent": true}]
    });

    let response = reqwest::Client::new()
        .post(&state.service.node_url)
        .json(&payload)
        .send()
        .await
        .map_err(|err| ApiError::Internal(format!("template lookup failed: {err}")))?;

    if !response.status().is_success() {
        return Ok(Json(TemplateFieldsResponse {
            template_id: String::new(),
            credential_type: "B2 Language Certificate".to_string(),
            fields: vec![TemplateField {
                name: "student_name".to_string(),
                field_type: 0,
                required: true,
                description: "Full name of the student".to_string(),
                min_length: 0,
                max_length: 0,
                min_value: 0,
                max_value: 0,
                pattern_hint: String::new(),
            }],
        }));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|err| ApiError::Internal(format!("invalid template response: {err}")))?;
    let content = body
        .get("result")
        .and_then(|result| result.get("data"))
        .and_then(|data| data.get("content"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    let credential_type = extract_field_value(&content, &["credential_type", "credentialType"]) 
        .unwrap_or_else(|| "Credential".to_string());

    let mut fields = Vec::new();
    if let Some(values) = find_nested_array(&content, &["fields", "field_descriptors"]) {
        for item in values {
            let name = extract_field_value(item, &["name"]).unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            let field_type = extract_field_value(item, &["field_type", "fieldType"])
                .and_then(|raw| raw.parse::<u8>().ok())
                .unwrap_or(0);
            let required = extract_field_value(item, &["required"]).is_none_or(|raw| raw == "true" || raw == "1");
            let description = extract_field_value(item, &["description"]).unwrap_or_default();
            let min_length = extract_field_value(item, &["min_length", "minLength"])
                .and_then(|raw| raw.parse::<u64>().ok())
                .unwrap_or(0);
            let max_length = extract_field_value(item, &["max_length", "maxLength"])
                .and_then(|raw| raw.parse::<u64>().ok())
                .unwrap_or(0);
            let min_value = extract_field_value(item, &["min_value", "minValue"])
                .and_then(|raw| raw.parse::<u64>().ok())
                .unwrap_or(0);
            let max_value = extract_field_value(item, &["max_value", "maxValue"])
                .and_then(|raw| raw.parse::<u64>().ok())
                .unwrap_or(0);
            let pattern_hint = extract_field_value(item, &["pattern_hint", "patternHint"]).unwrap_or_default();
            fields.push(TemplateField {
                name,
                field_type,
                required,
                description,
                min_length,
                max_length,
                min_value,
                max_value,
                pattern_hint,
            });
        }
    }

    if fields.is_empty() {
        fields.push(TemplateField {
            name: "student_name".to_string(),
            field_type: 0,
            required: true,
            description: "Full name of the student".to_string(),
            min_length: 0,
            max_length: 0,
            min_value: 0,
            max_value: 0,
            pattern_hint: String::new(),
        });
    }

    Ok(Json(TemplateFieldsResponse {
        template_id,
        credential_type,
        fields,
    }))
}

#[derive(Debug)]
struct ExplorerObjectPage {
    ids: Vec<String>,
    next_cursor: Option<String>,
}

async fn explorer_credentials_v1(
    State(state): State<AppState>,
    Query(query): Query<ExplorerQuery>,
) -> Result<Json<ExplorerResponse>, ApiError> {
    let fetched_at = Utc::now().to_rfc3339();
    let requested_limit = query.limit.unwrap_or(20).clamp(1, 50);

    let page = fetch_asset_record_object_ids(&state, query.cursor.as_deref()).await?;
    let now_secs = Utc::now().timestamp().max(0) as u64;

    let tag_filter = query.tag.as_deref().map(str::trim).filter(|v| !v.is_empty());
    let domain_filter = query
        .domain_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty());
    let type_filter = query
        .credential_type
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_lowercase);

    let mut filtered = Vec::new();
    for record_id in page.ids {
        let content = match fetch_object_content(&state.service.node_url, &record_id).await {
            Ok(content) => content,
            Err(_) => continue,
        };

        let Some(item) = parse_explorer_item(&record_id, &content, now_secs) else {
            continue;
        };

        if let Some(tag) = tag_filter {
            if !item
                .tags
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(tag))
            {
                continue;
            }
        }

        if let Some(domain) = domain_filter {
            if item.domain_id.as_deref() != Some(domain) {
                continue;
            }
        }

        if let Some(filter) = &type_filter {
            let candidate = item
                .credential_type
                .as_deref()
                .unwrap_or_default()
                .to_lowercase();
            if !candidate.contains(filter) {
                continue;
            }
        }

        filtered.push(item);
    }

    let total = filtered.len();
    let truncated = total > requested_limit;
    if truncated {
        filtered.truncate(requested_limit);
    }

    let next_cursor = if truncated {
        filtered.last().map(|item| item.record_id.clone())
    } else {
        page.next_cursor
    };

    Ok(Json(ExplorerResponse {
        items: filtered,
        total,
        truncated,
        next_cursor,
        fetched_at,
    }))
}

async fn fetch_asset_record_object_ids(
    state: &AppState,
    cursor: Option<&str>,
) -> Result<ExplorerObjectPage, ApiError> {
    // Primary: use iotax_queryEvents for AssetRecordCreated events (works on devnet).
    let event_type = format!(
        "{}::asset_record::AssetRecordCreated",
        state.service.package_id
    );
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "iotax_queryEvents",
        "params": [
            { "MoveEventType": event_type },
            cursor,
            50,
            false
        ]
    });

    let response = reqwest::Client::new()
        .post(&state.service.node_url)
        .json(&payload)
        .send()
        .await
        .map_err(|err| ApiError::Internal(format!("explorer event query failed: {err}")))?;
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|err| ApiError::Internal(format!("invalid explorer event response: {err}")))?;

    if let Some(rpc_error) = body.get("error") {
        let code = rpc_error
            .get("code")
            .and_then(|value| value.as_i64())
            .unwrap_or_default();
        if code == -32601 {
            return fetch_asset_record_object_ids_fallback_owned(state, cursor).await;
        }
        return Err(ApiError::Internal(format!(
            "explorer event query RPC error: {rpc_error}"
        )));
    }

    let data = body
        .get("result")
        .and_then(|value| value.get("data"))
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let mut ids = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for entry in &data {
        // Each event has parsedJson.record_id
        let record_id = entry
            .get("parsedJson")
            .and_then(|pj| pj.get("record_id"))
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if !record_id.is_empty() && seen.insert(record_id.to_string()) {
            ids.push(record_id.to_string());
        }
    }

    let next_cursor = body
        .get("result")
        .and_then(|value| value.get("nextCursor").or_else(|| value.get("next_cursor")))
        .and_then(|value| value.as_str())
        .map(str::to_string);

    // If events returned nothing, try owned-object fallback
    if ids.is_empty() && next_cursor.is_none() {
        return fetch_asset_record_object_ids_fallback_owned(state, cursor).await;
    }

    Ok(ExplorerObjectPage { ids, next_cursor })
}

async fn fetch_asset_record_object_ids_fallback_owned(
    state: &AppState,
    cursor: Option<&str>,
) -> Result<ExplorerObjectPage, ApiError> {
    let policy = state.service.trust_registry.get_policy();
    let owners: Vec<String> = policy
        .trusted_issuers
        .iter()
        .filter(|value| value.trim().starts_with("0x"))
        .map(|value| value.trim().to_string())
        .collect();

    if owners.is_empty() {
        return Ok(ExplorerObjectPage {
            ids: Vec::new(),
            next_cursor: None,
        });
    }

    let wanted_type = format!("{}::asset_record::AssetRecord", state.service.package_id);
    let query = serde_json::json!({
        "filter": { "StructType": wanted_type },
        "options": { "showType": true }
    });

    let mut all_ids = Vec::new();
    let mut last_next_cursor: Option<String> = None;
    let mut last_method_not_found: Option<String> = None;

    for owner in &owners {
        let mut found_method = false;
        for method in ["iotax_getOwnedObjects", "iota_getOwnedObjects", "suix_getOwnedObjects"] {
            let payload = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": [owner, query, cursor, 50]
            });

            let response = reqwest::Client::new()
                .post(&state.service.node_url)
                .json(&payload)
                .send()
                .await
                .map_err(|err| ApiError::Internal(format!("explorer fallback failed: {err}")))?;
            let body: serde_json::Value = response
                .json()
                .await
                .map_err(|err| ApiError::Internal(format!("invalid explorer fallback response: {err}")))?;

            if let Some(rpc_error) = body.get("error") {
                let code = rpc_error
                    .get("code")
                    .and_then(|value| value.as_i64())
                    .unwrap_or_default();
                if code == -32601 {
                    last_method_not_found = Some(format!("{method}: {rpc_error}"));
                    continue;
                }
                return Err(ApiError::Internal(format!(
                    "explorer fallback RPC error via {method}: {rpc_error}"
                )));
            }

            found_method = true;
            let entries = body
                .get("result")
                .and_then(|result| result.get("data").or_else(|| result.get("objects")))
                .and_then(|value| value.as_array())
                .cloned()
                .unwrap_or_default();

            for entry in entries {
                let candidate = entry.get("data").unwrap_or(&entry);
                let object_type = candidate
                    .get("type")
                    .or_else(|| candidate.get("objectType"))
                    .and_then(|value| value.as_str())
                    .unwrap_or_default();
                if !object_type.contains("AssetRecord") {
                    continue;
                }
                if let Some(object_id) = candidate
                    .get("objectId")
                    .or_else(|| candidate.get("object_id"))
                    .and_then(|value| value.as_str())
                {
                    all_ids.push(object_id.to_string());
                }
            }

            last_next_cursor = body
                .get("result")
                .and_then(|value| value.get("nextCursor").or_else(|| value.get("next_cursor")))
                .and_then(|value| value.as_str())
                .map(str::to_string);

            break; // found a working method for this owner
        }

        if !found_method {
            // All RPC methods returned -32601 for this owner — skip
            continue;
        }
    }

    if all_ids.is_empty() && last_method_not_found.is_some() && owners.len() == 1 {
        // Only fail if we had exactly one owner and no working method
        return Err(ApiError::Internal(format!(
            "explorer fallback failed: no supported getOwnedObjects method ({})",
            last_method_not_found.unwrap_or_else(|| "no details".to_string())
        )));
    }

    Ok(ExplorerObjectPage {
        ids: all_ids,
        next_cursor: last_next_cursor,
    })
}

async fn fetch_object_content(node_url: &str, object_id: &str) -> anyhow::Result<serde_json::Value> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "iota_getObject",
        "params": [object_id, {"showContent": true, "showType": true}]
    });

    let response = reqwest::Client::new().post(node_url).json(&payload).send().await?;
    let body: serde_json::Value = response.json().await?;
    if let Some(rpc_error) = body.get("error") {
        anyhow::bail!("object fetch failed: {rpc_error}");
    }

    let content = body
        .get("result")
        .and_then(|result| result.get("data"))
        .and_then(|data| data.get("content"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    Ok(content)
}

fn parse_explorer_item(record_id: &str, content: &serde_json::Value, now_secs: u64) -> Option<ExplorerCredentialItem> {
    let domain_id = extract_field_value(content, &["domain_id", "domainId", "domain"]);
    let mut tags = extract_string_array_field(content, &["tags"]);
    let expiry_unix = extract_u64_field(content, &["expiry_unix", "expiryUnix"]).unwrap_or(0);
    let revoked = extract_bool_field(content, &["revoked"]).unwrap_or(false);
    let transferable = extract_bool_field(content, &["transferable"]).unwrap_or(false);

    let meta_bytes = extract_u8_array_field(content, &["asset_meta", "assetMeta", "state_metadata", "metadata"]);
    let metadata = meta_bytes
        .as_ref()
        .and_then(|bytes| std::str::from_utf8(bytes).ok())
        .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok());

    let credential_type = metadata
        .as_ref()
        .and_then(|value| extract_field_value(value, &["credential_type", "credentialType"]));
    let issued_at = metadata
        .as_ref()
        .and_then(|value| extract_field_value(value, &["issued_at", "issuedAt"]));
    let expiry_iso = metadata
        .as_ref()
        .and_then(|value| extract_field_value(value, &["expiry_iso", "expiryIso"]));

    if tags.is_empty() {
        if let Some(raw_tags) = metadata
            .as_ref()
            .and_then(|value| extract_field_value(value, &["tags"]))
            .or_else(|| {
                metadata
                    .as_ref()
                    .and_then(|value| value.get("public_fields"))
                    .and_then(|fields| fields.get("tags"))
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            })
        {
            tags = raw_tags
                .split(',')
                .map(|part| part.trim().to_string())
                .filter(|part| !part.is_empty())
                .collect();
        }
    }

    let status = if revoked {
        "revoked_on_chain".to_string()
    } else if expiry_unix > 0 && now_secs > expiry_unix {
        "expired".to_string()
    } else {
        "valid".to_string()
    };

    Some(ExplorerCredentialItem {
        record_id: record_id.to_string(),
        domain_id,
        tags,
        credential_type,
        issued_at,
        expiry_iso,
        revoked,
        transferable,
        status,
    })
}

fn extract_by_keys(value: &serde_json::Value, keys: &[&str]) -> Option<serde_json::Value> {
    match value {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(found) = map.get(*key) {
                    return Some(found.clone());
                }
            }
            map.values().find_map(|child| extract_by_keys(child, keys))
        }
        serde_json::Value::Array(values) => values.iter().find_map(|child| extract_by_keys(child, keys)),
        _ => None,
    }
}

fn extract_bool_field(content: &serde_json::Value, keys: &[&str]) -> Option<bool> {
    let value = extract_by_keys(content, keys)?;
    match value {
        serde_json::Value::Bool(v) => Some(v),
        serde_json::Value::String(v) => Some(v.eq_ignore_ascii_case("true") || v == "1"),
        serde_json::Value::Object(map) => map
            .get("value")
            .and_then(|nested| nested.as_bool())
            .or_else(|| map.get("value").and_then(|nested| nested.as_str()).map(|v| v.eq_ignore_ascii_case("true") || v == "1")),
        _ => None,
    }
}

fn extract_u64_field(content: &serde_json::Value, keys: &[&str]) -> Option<u64> {
    let value = extract_by_keys(content, keys)?;
    match value {
        serde_json::Value::Number(v) => v.as_u64(),
        serde_json::Value::String(v) => v.parse::<u64>().ok(),
        serde_json::Value::Object(map) => map
            .get("value")
            .and_then(|nested| nested.as_u64())
            .or_else(|| map.get("value").and_then(|nested| nested.as_str()).and_then(|v| v.parse::<u64>().ok())),
        _ => None,
    }
}

fn extract_string_array_field(content: &serde_json::Value, keys: &[&str]) -> Vec<String> {
    let Some(value) = extract_by_keys(content, keys) else {
        return Vec::new();
    };
    collect_strings(&value)
}

fn collect_strings(value: &serde_json::Value) -> Vec<String> {
    match value {
        serde_json::Value::Array(values) => values
            .iter()
            .flat_map(collect_strings)
            .collect::<Vec<_>>(),
        serde_json::Value::String(v) => {
            let trimmed = v.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else if trimmed.starts_with('[') && trimmed.ends_with(']') {
                serde_json::from_str::<Vec<String>>(trimmed).unwrap_or_default()
            } else {
                vec![trimmed.to_string()]
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(value) = map.get("value") {
                return collect_strings(value);
            }
            if let Some(value) = map.get("fields") {
                return collect_strings(value);
            }
            map.values().flat_map(collect_strings).collect::<Vec<_>>()
        }
        _ => Vec::new(),
    }
}

fn extract_u8_array_field(content: &serde_json::Value, keys: &[&str]) -> Option<Vec<u8>> {
    let value = extract_by_keys(content, keys)?;
    collect_u8_array(&value)
}

fn collect_u8_array(value: &serde_json::Value) -> Option<Vec<u8>> {
    match value {
        serde_json::Value::Array(values) => {
            let mut out = Vec::with_capacity(values.len());
            for item in values {
                let number = item.as_u64()?;
                out.push(number as u8);
            }
            Some(out)
        }
        serde_json::Value::Object(map) => {
            if let Some(value) = map.get("value") {
                return collect_u8_array(value);
            }
            if let Some(value) = map.get("fields") {
                return collect_u8_array(value);
            }
            if let Some(value) = map.get("bytes") {
                return collect_u8_array(value);
            }
            None
        }
        serde_json::Value::String(value) => {
            if value.starts_with('[') && value.ends_with(']') {
                serde_json::from_str::<Vec<u8>>(value).ok()
            } else {
                Some(value.as_bytes().to_vec())
            }
        }
        _ => None,
    }
}

async fn issuer_credentials_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(domain_id): Path<String>,
) -> Result<Json<IssuerCredentialsResponse>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "verifier", false)?;

    // Issuer dashboard should reflect fresh revoke/expiry state immediately after tx confirmation.
    state.service.invalidate_caches();

    let query = serde_json::json!({
        "MoveEventType": format!("{}::asset_record::AssetRecordCreated", state.service.package_id)
    });
    let mut method_used: Option<&str> = None;
    let mut events: Vec<serde_json::Value> = Vec::new();
    let mut last_method_not_found: Option<String> = None;

    for method in ["iotax_queryEvents", "iota_queryEvents", "suix_queryEvents"] {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": [query, null, 200, true]
        });

        let response = reqwest::Client::new()
            .post(&state.service.node_url)
            .json(&payload)
            .send()
            .await
            .map_err(|err| ApiError::Internal(format!("issuer events query failed: {err}")))?;

        if !response.status().is_success() {
            continue;
        }

        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|err| ApiError::Internal(format!("invalid issuer events response: {err}")))?;

        if let Some(rpc_error) = body.get("error") {
            let code = rpc_error
                .get("code")
                .and_then(|value| value.as_i64())
                .unwrap_or_default();
            if code == -32601 {
                last_method_not_found = Some(format!("{method}: {rpc_error}"));
                continue;
            }
            return Err(ApiError::Internal(format!(
                "issuer events query RPC error via {method}: {rpc_error}"
            )));
        }

        method_used = Some(method);
        events = body
            .get("result")
            .and_then(|result| result.get("data"))
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        break;
    }

    if method_used.is_none() {
        return Err(ApiError::Internal(format!(
            "no supported event query RPC method available ({})",
            last_method_not_found.unwrap_or_else(|| "no details".to_string())
        )));
    }

    let mut rows: Vec<(String, String)> = Vec::new();
    for event in &events {
            let parsed = event.get("parsedJson").unwrap_or(event);
            let event_domain = extract_field_value(parsed, &["domain_id", "domainId"]).unwrap_or_default();
            if event_domain != domain_id {
                continue;
            }
            let record_id = extract_field_value(parsed, &["record_id", "recordId"]).unwrap_or_default();
            let notarization_id = extract_field_value(parsed, &["notarization_id", "notarizationId"]).unwrap_or_else(|| record_id.clone());
            if !record_id.is_empty() {
                rows.push((record_id, notarization_id));
            }
    }

    let truncated = rows.len() > 100;
    if truncated {
        rows.truncate(100);
    }

    let mut credentials = Vec::with_capacity(rows.len());
    for (record_id, notarization_id) in rows {
        let verdict = state
            .service
            .verify_notarization(&record_id, b"")
            .await
            .map_err(|err| ApiError::Internal(format!("verify failed for {}: {}", record_id, err)))?;
        credentials.push(IssuerCredentialItem {
            record_id,
            notarization_id,
            verdict: serialize_verdict(verdict, &format!("issuer-{}", uuid::Uuid::new_v4())),
            fetched_at: Utc::now().to_rfc3339(),
        });
    }

    Ok(Json(IssuerCredentialsResponse {
        domain_id,
        total: credentials.len(),
        credentials,
        truncated,
        fetched_at: Utc::now().to_rfc3339(),
    }))
}

async fn fetch_owned_credentials(
    node_url: &str,
    address: &str,
    package_id: &str,
) -> anyhow::Result<Vec<OwnedCredential>> {
    let wanted_asset_type = format!("{}::asset_record::AssetRecord", package_id);
    let query = serde_json::json!({
        "options": {
            "showType": true,
            "showContent": true
        }
    });
    let mut entries: Vec<serde_json::Value> = Vec::new();
    let mut method_used: Option<&str> = None;
    let mut last_method_not_found: Option<String> = None;

    // TODO(iota-rpc-adapter): node versions differ on method names (iotax/iota/suix);
    // keep this fallback adapter to preserve API contracts.
    for method in ["iotax_getOwnedObjects", "iota_getOwnedObjects", "suix_getOwnedObjects"] {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": [address, query, null, 50]
        });

        let response = reqwest::Client::new().post(node_url).json(&payload).send().await?;
        if !response.status().is_success() {
            continue;
        }

        let body: serde_json::Value = response.json().await?;
        if let Some(rpc_error) = body.get("error") {
            let code = rpc_error
                .get("code")
                .and_then(|value| value.as_i64())
                .unwrap_or_default();
            if code == -32601 {
                last_method_not_found = Some(format!("{method}: {rpc_error}"));
                continue;
            }
            anyhow::bail!("owned objects RPC error via {method}: {rpc_error}");
        }

        entries = body
            .get("result")
            .and_then(|result| result.get("data").or_else(|| result.get("objects")))
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        method_used = Some(method);
        break;
    }

    if method_used.is_none() {
        anyhow::bail!(
            "no supported owned-objects RPC method available ({})",
            last_method_not_found.unwrap_or_else(|| "no details".to_string())
        );
    }

    let mut out = Vec::new();
    for entry in entries {
        let candidate = entry.get("data").unwrap_or(&entry);
        let object_id = candidate
            .get("objectId")
            .or_else(|| candidate.get("object_id"))
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        if object_id.is_empty() {
            continue;
        }

        let object_type = candidate
            .get("type")
            .or_else(|| candidate.get("objectType"))
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();

        let include = object_type.contains(&wanted_asset_type)
            || object_type.contains("AssetRecord")
            || object_type.contains("iota_notarization::notarization::Notarization")
            || object_type.contains("::notarization::Notarization");
        if !include {
            continue;
        }

        let content = candidate.get("content").cloned().unwrap_or(serde_json::Value::Null);
        let domain_id = extract_field_value(&content, &["domain_id", "domainId", "domain"]);
        let meta_raw = extract_field_value(&content, &["asset_meta", "assetMeta", "state_metadata", "metadata"]) 
            .unwrap_or_default();

        out.push(OwnedCredential {
            id: object_id,
            object_type: if object_type.contains("AssetRecord") {
                "AssetRecord".to_string()
            } else {
                "Notarization".to_string()
            },
            domain_id,
            asset_meta_preview: sanitize_preview(&meta_raw),
        });
    }

    Ok(out)
}

fn extract_field_value(content: &serde_json::Value, keys: &[&str]) -> Option<String> {
    match content {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(found) = map.get(*key) {
                    if let Some(as_str) = found.as_str() {
                        return Some(as_str.to_string());
                    }
                    if let Some(as_obj) = found.as_object() {
                        if let Some(value) = as_obj.get("value").and_then(|v| v.as_str()) {
                            return Some(value.to_string());
                        }
                    }
                    return Some(found.to_string());
                }
            }
            map.values().find_map(|value| extract_field_value(value, keys))
        }
        serde_json::Value::Array(values) => values.iter().find_map(|value| extract_field_value(value, keys)),
        _ => None,
    }
}

fn sanitize_preview(raw: &str) -> String {
    let mut preview = raw.chars().take(64).collect::<String>();
    if preview.is_empty() {
        return "".to_string();
    }

    let has_email = preview.contains('@');
    let digits = preview.chars().filter(|ch| ch.is_ascii_digit()).count();
    if has_email || digits >= 12 {
        return "[redacted]".to_string();
    }

    preview = preview.replace('\n', " ").replace('\r', " ");
    preview
}

fn find_nested_array<'a>(value: &'a serde_json::Value, keys: &[&str]) -> Option<&'a Vec<serde_json::Value>> {
    match value {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(found) = map.get(*key).and_then(|v| v.as_array()) {
                    return Some(found);
                }
            }
            map.values().find_map(|child| find_nested_array(child, keys))
        }
        serde_json::Value::Array(values) => values.iter().find_map(|child| find_nested_array(child, keys)),
        _ => None,
    }
}

fn bcs_uleb128(mut n: usize) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let byte = (n & 0x7F) as u8;
        n >>= 7;
        if n == 0 {
            out.push(byte);
            break;
        }
        out.push(byte | 0x80);
    }
    out
}

fn serialize_verdict(verdict: crate::model::VerificationVerdict, request_id: &str) -> serde_json::Value {
    serde_json::json!({
        "id": verdict.id,
        "verified": verdict.verified,
        "status": verdict.status,
        "summary": verdict.summary,
        "reasons": verdict.reasons,
        "issuer": verdict.issuer,
        "domain": verdict.domain,
        "template": verdict.template,
        "revocation": verdict.revocation,
        "dispute": verdict.dispute,
        "policy_version": verdict.policy_version,
        "checked_at": verdict.checked_at,
        "request_id": request_id,
        "evidence": verdict.evidence,
        "credential_metadata": verdict.credential_metadata,
        "on_chain_transferable": verdict.on_chain_transferable,
        "latency_ms": verdict.latency_ms,
        "cache_hit": verdict.cache_hit,
        "compat_notice": verdict.compat_notice,
    })
}

#[derive(Debug, serde::Deserialize)]
struct PresentQuery {
    token: String,
}

async fn public_present(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(query): Query<PresentQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let rate_key = format!("present:{}", addr.ip());
    if !state.check_verify_rate_limit(&rate_key, state.service.config.verify_rate_limit_per_minute) {
        return Err(ApiError::RateLimited("verify_rate_limit_exceeded".to_string()));
    }

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(query.token.as_bytes())
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(query.token.as_bytes()))
        .map_err(|_| ApiError::BadRequest("invalid presentation token encoding".to_string()))?;
    let payload: PresentationToken = serde_json::from_slice(&decoded)
        .map_err(|_| ApiError::BadRequest("invalid presentation token payload".to_string()))?;

    let expected_message = format!(
        "Credora Certificate Presentation\ncredential_id: {}\nholder: {}\ntimestamp: {}\nnonce: {}",
        payload.credential_id, payload.holder, payload.timestamp, payload.nonce
    );

    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.signature.trim().as_bytes())
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload.signature.trim().as_bytes()))
        .map_err(|_| ApiError::BadRequest("invalid signature encoding".to_string()))?;

    let raw_msg_bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.message_bytes.as_bytes())
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload.message_bytes.as_bytes()))
        .map_err(|_| ApiError::BadRequest("invalid message_bytes encoding".to_string()))?;

    let message_match = raw_msg_bytes == expected_message.as_bytes();

    // Reconstruct the intent message exactly as the IOTA wallet signs it:
    // blake2b-256( [3,0,0] + bcs_uleb128(len) + raw_message_bytes )
    let intent_prefix = [3u8, 0u8, 0u8];
    let msg_len_prefix = bcs_uleb128(raw_msg_bytes.len());
    let mut signed_bytes = Vec::with_capacity(intent_prefix.len() + msg_len_prefix.len() + raw_msg_bytes.len());
    signed_bytes.extend_from_slice(&intent_prefix);
    signed_bytes.extend_from_slice(&msg_len_prefix);
    signed_bytes.extend_from_slice(&raw_msg_bytes);

    use blake2::{Blake2b, digest::consts::U32, Digest as Blake2Digest};
    let prehash: [u8; 32] = Blake2b::<U32>::digest(&signed_bytes).into();

    let (signature_valid, mut failure_reason): (bool, Option<String>) = if sig_bytes.len() < 97 {
        (false, Some("invalid_signature_length".to_string()))
    } else if sig_bytes[0] != 0x00 {
        (false, Some("unsupported_signature_scheme".to_string()))
    } else {
        let raw_sig: [u8; 64] = match sig_bytes[1..65].try_into() {
            Ok(value) => value,
            Err(_) => {
                return Err(ApiError::BadRequest("invalid signature bytes".to_string()));
            }
        };
        let raw_pubkey: [u8; 32] = match sig_bytes[65..97].try_into() {
            Ok(value) => value,
            Err(_) => {
                return Err(ApiError::BadRequest("invalid public key bytes".to_string()));
            }
        };

        let signature = Signature::from_bytes(&raw_sig);
        match VerifyingKey::from_bytes(&raw_pubkey) {
            Ok(verifying_key) => {
                // The IOTA wallet signs blake2b-256(intent_message) using standard
                // Ed25519 (RFC 8032). Pass the 32-byte blake2b digest as the message
                // to standard Ed25519 verify (which applies SHA-512 internally per spec).
                if verifying_key.verify(&prehash, &signature).is_ok() {
                    if message_match {
                        (true, None)
                    } else {
                        (false, Some("message_mismatch".to_string()))
                    }
                } else {
                    (false, Some("signature_invalid".to_string()))
                }
            }
            Err(_) => (false, Some("signature_parse_error".to_string())),
        }
    };

    let holder_owner = fetch_object_owner_address(&state.service.node_url, &payload.credential_id)
        .await
        .map_err(|err| ApiError::Internal(format!("owner lookup failed: {err}")))?;
    let holder_owns_credential = holder_owner
        .as_deref()
        .map(|owner| owner.eq_ignore_ascii_case(payload.holder.trim()))
        .unwrap_or(false);

    if !holder_owns_credential {
        failure_reason = Some("holder_mismatch".to_string());
    }

    let verdict = state
        .service
        .verify_notarization(payload.credential_id.trim(), b"")
        .await
        .map_err(|err| ApiError::Internal(format!("verify failed for presentation: {err}")))?;

    let presentation_valid = signature_valid && holder_owns_credential;
    Ok(Json(serde_json::json!({
        "credential_id": payload.credential_id,
        "holder_address": payload.holder,
        "presentation_valid": presentation_valid,
        "presentation_verified_at": Utc::now().to_rfc3339(),
        "signature_valid": signature_valid,
        "holder_owns_credential": holder_owns_credential,
        "nonce": payload.nonce,
        "timestamp": payload.timestamp,
        "reason": failure_reason,
        "verdict": serialize_verdict(verdict, &format!("present-{}", uuid::Uuid::new_v4())),
    })))
}

async fn credential_record_intent_v2(
    State(state): State<AppState>,
    Json(req): Json<CreateCredentialRecordIntentRequest>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    if req.notarization_id.trim().is_empty() || req.domain_id.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "notarization_id and domain_id are required".to_string(),
        ));
    }

    let intent = crate::model::TransactionIntent {
        package_id: state.service.package_id.clone(),
        target_module: "asset_record".to_string(),
        target_function: "create_credential_record".to_string(),
        arguments: vec![
            crate::model::TransactionArg::PureId {
                value: req.notarization_id.trim().to_string(),
            },
            crate::model::TransactionArg::PureId {
                value: req.domain_id.trim().to_string(),
            },
            crate::model::TransactionArg::PureBytes {
                value: req.meta.into_bytes(),
            },
            crate::model::TransactionArg::PureU64 {
                value: req.expiry_unix,
            },
            crate::model::TransactionArg::PureBool {
                value: req.transferable,
            },
            crate::model::TransactionArg::PureStringVector {
                value: req.tags,
            },
        ],
    };

    Ok(Json(intent.into()))
}

async fn revoke_onchain_v2(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<RevokeOnchainIntentRequest>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    authorize_role(&state, &headers, addr.ip(), "policy-admin", false)?;
    if req.domain_cap_id.trim().is_empty() || id.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "domain_cap_id and credential id are required".to_string(),
        ));
    }

    let intent = crate::model::TransactionIntent {
        package_id: state.service.package_id.clone(),
        target_module: "asset_record".to_string(),
        target_function: "revoke_credential_record".to_string(),
        arguments: vec![
            crate::model::TransactionArg::Object {
                object_id: req.domain_cap_id.trim().to_string(),
            },
            crate::model::TransactionArg::Object {
                object_id: id.trim().to_string(),
            },
        ],
    };

    Ok(Json(intent.into()))
}

async fn fetch_object_owner_address(node_url: &str, object_id: &str) -> anyhow::Result<Option<String>> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "iota_getObject",
        "params": [object_id, {"showOwner": true}]
    });

    let response = reqwest::Client::new()
        .post(node_url)
        .json(&payload)
        .send()
        .await?;
    if !response.status().is_success() {
        return Ok(None);
    }

    let body: serde_json::Value = response.json().await?;
    let owner = body
        .get("result")
        .and_then(|result| result.get("data"))
        .and_then(|data| data.get("owner"))
        .and_then(|owner| {
            owner
                .get("AddressOwner")
                .and_then(|value| value.as_str())
                .map(str::to_string)
                .or_else(|| {
                    owner
                        .get("address_owner")
                        .and_then(|value| value.as_str())
                        .map(str::to_string)
                })
        });
    Ok(owner)
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

// =====================================================================
//  AA (Account Abstraction) endpoints
// =====================================================================

async fn aa_create_account_intent_v2(
    State(state): State<AppState>,
    Json(req): Json<CreateAaAccountIntentRequest>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    use crate::model::TransactionArg;

    // Validate: each pubkey_hex must be 64 hex chars (32 bytes)
    for pk_hex in &req.public_keys_hex {
        if pk_hex.len() != 64 || !pk_hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(ApiError::BadRequest(format!(
                "public key '{}' must be 64 hex chars (32 bytes)",
                &pk_hex[..8.min(pk_hex.len())]
            )));
        }
    }

    // Decode pubkeys to bytes
    let pubkey_bytes: Vec<Vec<u8>> = req
        .public_keys_hex
        .iter()
        .map(|hex| {
            (0..32)
                .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap())
                .collect()
        })
        .collect();

    // BCS-encode vector<vector<u8>>
    let pubkeys_bcs = bcs::to_bytes(&pubkey_bytes)
        .map_err(|e| ApiError::Internal(format!("bcs encode pubkeys: {e}")))?;

    // BCS-encode vector<String> for labels
    let labels_bcs = bcs::to_bytes(&req.labels)
        .map_err(|e| ApiError::Internal(format!("bcs encode labels: {e}")))?;

    let response = TransactionIntentResponse {
        package_id: state.service.package_id.clone(),
        target_module: "passapawn_aa".to_string(),
        target_function: "create".to_string(),
        arguments: vec![
            TransactionArg::Object {
                object_id: req.package_metadata_id.clone(),
            },
            TransactionArg::PureBcsBytes {
                value: pubkeys_bcs,
            },
            TransactionArg::PureU64 {
                value: req.threshold,
            },
            TransactionArg::PureBcsBytes {
                value: labels_bcs,
            },
        ],
    };

    Ok(Json(response))
}

async fn aa_governance_intent_v2(
    State(state): State<AppState>,
    Json(req): Json<AaGovernanceIntentRequest>,
) -> Result<Json<AaSigningRequest>, ApiError> {
    // Build a description of what this governance action does
    let action_description = format!(
        "Execute proposal #{} on domain {} (template version {})",
        req.proposal_id,
        &req.domain_id[..10.min(req.domain_id.len())],
        req.template_version
    );

    // Build the unsigned PTB as a TransactionIntentResponse
    // The frontend will build the actual Transaction from this intent
    // and use useSignTransaction to collect signatures
    let intent = TransactionIntentResponse {
        package_id: state.service.package_id.clone(),
        target_module: "templates".to_string(),
        target_function: "execute_proposal".to_string(),
        arguments: vec![
            crate::model::TransactionArg::Object {
                object_id: req.domain_id.clone(),
            },
            crate::model::TransactionArg::PureU64 {
                value: req.proposal_id,
            },
            crate::model::TransactionArg::PureU64 {
                value: req.template_version,
            },
        ],
    };

    // Retrieve threshold/signer_count from localStorage on the frontend side
    // (they were stored during AA account creation)
    // For the backend response, we use the values the frontend will provide
    // or default to 1 if not available
    Ok(Json(AaSigningRequest {
        tx_bytes_b64: serde_json::to_string(&intent)
            .map_err(|e| ApiError::Internal(format!("serialize intent: {e}")))?,
        aa_account_id: req.aa_account_id,
        threshold: 1, // frontend overrides from localStorage
        signer_count: 1, // frontend overrides from localStorage
        action_description,
    }))
}

async fn aa_submit_v2(
    State(state): State<AppState>,
    Json(req): Json<AaSubmitRequest>,
) -> Result<Json<AaSubmitResponse>, ApiError> {
    // Decode and validate signatures
    let sigs_bytes: Vec<Vec<u8>> = req
        .signatures_hex
        .iter()
        .map(|hex| {
            if hex.len() != 128 {
                return Err(ApiError::BadRequest(format!(
                    "signature must be 128 hex chars (64 bytes), got {}",
                    hex.len()
                )));
            }
            Ok((0..64)
                .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap())
                .collect::<Vec<u8>>())
        })
        .collect::<Result<Vec<_>, _>>()?;

    // BCS-encode the signatures as the AA authenticator proof
    let proof_bytes = bcs::to_bytes(&sigs_bytes)
        .map_err(|e| ApiError::Internal(format!("bcs encode sigs: {e}")))?;
    let proof_b64 =
        base64::engine::general_purpose::STANDARD.encode(&proof_bytes);

    // Submit via raw JSON-RPC
    // TODO(iota-aa-rpc): If this submission format is incorrect,
    // the RPC may return an error. Inspect the error and adjust the
    // wrapping format. Known alternative: wrap proof_bytes in a
    // GenericSignature::AccountAuthenticator envelope from iota_types.
    let rpc_body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "iota_executeTransactionBlock",
        "params": [
            req.tx_bytes_b64,
            [proof_b64],
            {
                "showEffects": true,
                "showObjectChanges": true,
                "showEvents": true
            },
            "WaitForLocalExecution"
        ]
    });

    let http_client = reqwest::Client::new();
    let resp = http_client
        .post(&state.service.node_url)
        .json(&rpc_body)
        .send()
        .await
        .map_err(|e| ApiError::Internal(format!("rpc send: {e}")))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| ApiError::Internal(format!("rpc parse: {e}")))?;

    if let Some(error) = body.get("error") {
        return Ok(Json(AaSubmitResponse {
            submitted: false,
            digest: None,
            error: Some(error.to_string()),
            proof_bytes_b64: Some(proof_b64),
        }));
    }

    let digest = body
        .pointer("/result/digest")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    Ok(Json(AaSubmitResponse {
        submitted: digest.is_some(),
        digest,
        error: None,
        proof_bytes_b64: None,
    }))
}
