use axum::{
    extract::{Path, State},
    Json,
};
use serde::Serialize;

use crate::dto::VerifyRequest;
use crate::error::ApiError;
use crate::model::VerificationStatus;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct VerifyResponse {
    pub id: String,
    pub verified: bool,
    pub status: VerificationStatus,
    pub reasons: Vec<String>,
}

pub async fn verify_notarization(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, ApiError> {
    let verdict = state
        .service
        .verify_notarization(&id, req.data.as_bytes())
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(VerifyResponse {
        id,
        verified: verdict.verified,
        status: verdict.status,
        reasons: verdict.reasons,
    }))
}
