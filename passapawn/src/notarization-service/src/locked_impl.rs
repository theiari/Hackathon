use axum::{extract::State, Json};

use crate::dto::{CreateLockedRequest, TransactionIntentResponse};
use crate::error::ApiError;
use crate::model::LockedOptions;
use crate::AppState;

pub async fn create_locked(
    State(state): State<AppState>,
    Json(req): Json<CreateLockedRequest>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    let intent = state
        .service
        .create_locked_notarization(
            req.data.as_bytes(),
            req.payload_strategy,
            LockedOptions {
                delete_lock: req.delete_lock,
            },
            req.immutable_description,
            req.state_metadata,
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(intent.into()))
}
