use axum::{
    extract::{Path, State},
    Json,
};

use crate::dto::{
    CreateDynamicRequest, TransactionIntentResponse, TransferDynamicRequest, UpdateDynamicMetadataRequest, UpdateDynamicStateRequest,
};
use crate::error::ApiError;
use crate::model::DynamicOptions;
use crate::AppState;

pub async fn create_dynamic(
    State(state): State<AppState>,
    Json(req): Json<CreateDynamicRequest>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    let intent = state
        .service
        .create_dynamic_notarization(
            req.data.as_bytes(),
            req.payload_strategy,
            DynamicOptions {
                transfer_lock: req.transfer_lock,
                updatable_metadata: req.updatable_metadata,
            },
            req.immutable_description,
            req.state_metadata,
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(intent.into()))
}

pub async fn update_dynamic_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateDynamicStateRequest>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    let intent = state
        .service
        .update_dynamic_state(&id, req.data.as_bytes(), req.payload_strategy, req.state_metadata)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(intent.into()))
}

pub async fn update_dynamic_metadata(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateDynamicMetadataRequest>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    let intent = state
        .service
        .update_dynamic_metadata(&id, req.updatable_metadata)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(intent.into()))
}

pub async fn transfer_dynamic(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<TransferDynamicRequest>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    let intent = state
        .service
        .transfer_dynamic(&id, &req.new_owner_address)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(intent.into()))
}
