use axum::{
    extract::{ConnectInfo, Path, State},
    http::HeaderMap,
    Json,
};
use serde::Serialize;
use std::net::SocketAddr;
use uuid::Uuid;

use crate::dto::VerifyRequest;
use crate::error::ApiError;
use crate::model::VerificationStatus;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct VerifyResponse {
    pub id: String,
    pub verified: bool,
    pub status: VerificationStatus,
    pub summary: String,
    pub reasons: Vec<String>,
    pub issuer: Option<serde_json::Value>,
    pub domain: Option<serde_json::Value>,
    pub template: Option<serde_json::Value>,
    pub revocation: Option<serde_json::Value>,
    pub dispute: Option<serde_json::Value>,
    pub policy_version: String,
    pub checked_at: String,
    pub request_id: String,
    pub evidence: Option<serde_json::Value>,
    pub credential_metadata: Option<serde_json::Value>,
    pub on_chain_transferable: Option<bool>,
    pub latency_ms: u64,
    pub cache_hit: bool,
    pub compat_notice: Option<String>,
}

pub async fn verify_notarization(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, ApiError> {
    verify_with_payload(state, addr, headers, id, Some(req.data)).await
}

pub async fn verify_notarization_public(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<VerifyResponse>, ApiError> {
    verify_with_payload(state, addr, headers, id, None).await
}

async fn verify_with_payload(
    state: AppState,
    addr: SocketAddr,
    headers: HeaderMap,
    id: String,
    data: Option<String>,
) -> Result<Json<VerifyResponse>, ApiError> {
    let payload = data.unwrap_or_default();

    if payload.len() > state.service.config.max_payload_bytes {
        return Err(ApiError::BadRequest(format!(
            "payload exceeds MAX_PAYLOAD_BYTES={} bytes",
            state.service.config.max_payload_bytes
        )));
    }

    let rate_key = addr.ip().to_string();
    if !state.check_verify_rate_limit(&rate_key, state.service.config.verify_rate_limit_per_minute) {
        return Err(ApiError::RateLimited("verify_rate_limit_exceeded".to_string()));
    }

    let request_id = headers
        .get("x-request-id")
        .and_then(|raw| raw.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let access_actor = headers
        .get("x-access-actor")
        .and_then(|raw| raw.to_str().ok())
        .map(str::to_string);
    let access_reason = headers
        .get("x-access-reason")
        .and_then(|raw| raw.to_str().ok())
        .map(str::to_string);

    let payload_bytes = if payload.trim().is_empty() {
        &[][..]
    } else {
        payload.as_bytes()
    };

    let verdict = state
        .service
        .verify_notarization(&id, payload_bytes)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    state.record_access_event(
        &request_id,
        access_actor,
        access_reason,
        serde_json::json!({"notarization_id": id}),
    );
    state.record_verify_event(
        &request_id,
        &format!("{:?}", verdict.status),
        verdict.latency_ms,
        verdict.cache_hit,
        &verdict.checked_at,
        &verdict.reasons,
    );

    Ok(Json(VerifyResponse {
        id,
        verified: verdict.verified,
        status: verdict.status,
        summary: verdict.summary,
        reasons: verdict.reasons,
        issuer: verdict.issuer,
        domain: verdict.domain,
        template: verdict.template,
        revocation: verdict.revocation,
        dispute: verdict.dispute,
        policy_version: verdict.policy_version,
        checked_at: verdict.checked_at,
        request_id,
        evidence: verdict.evidence,
        credential_metadata: verdict.credential_metadata,
        on_chain_transferable: verdict.on_chain_transferable,
        latency_ms: verdict.latency_ms,
        cache_hit: verdict.cache_hit,
        compat_notice: verdict.compat_notice,
    }))
}
