use serde::{Deserialize, Serialize};
use crate::model::{
    PayloadStrategy, DeleteLock, TransferLock, TransactionArg, TransactionIntent
};

#[derive(Debug, Deserialize)]
pub struct CreateLockedRequest {
    pub data: String,               // base64 or hex; up to you
    pub payload_strategy: PayloadStrategy,
    pub delete_lock: DeleteLock,
    pub immutable_description: String,
    pub state_metadata: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDynamicRequest {
    pub data: String,
    pub payload_strategy: PayloadStrategy,
    pub transfer_lock: TransferLock,
    pub immutable_description: String,
    pub state_metadata: String,
    pub updatable_metadata: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDynamicStateRequest {
    pub data: String,
    pub payload_strategy: PayloadStrategy,
    pub state_metadata: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDynamicMetadataRequest {
    pub updatable_metadata: String,
}

#[derive(Debug, Deserialize)]
pub struct TransferDynamicRequest {
    pub new_owner_address: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyRequest {
    pub data: String,
}

#[derive(Debug, Serialize)]
pub struct TransactionIntentResponse {
    pub package_id: String,
    pub target_module: String,
    pub target_function: String,
    pub arguments: Vec<TransactionArg>,
}

impl From<TransactionIntent> for TransactionIntentResponse {
    fn from(r: TransactionIntent) -> Self {
        Self {
            package_id: r.package_id,
            target_module: r.target_module,
            target_function: r.target_function,
            arguments: r.arguments,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::TransactionArg;

    #[test]
    fn transaction_intent_response_serializes_with_typed_arguments() {
        let intent = TransactionIntent {
            package_id: "0xabc".to_string(),
            target_module: "locked".to_string(),
            target_function: "issue_locked".to_string(),
            arguments: vec![
                TransactionArg::Object {
                    object_id: "0x1".to_string(),
                },
                TransactionArg::PureString {
                    value: "metadata".to_string(),
                },
                TransactionArg::PureU64 { value: 7 },
            ],
        };

        let response: TransactionIntentResponse = intent.into();
        let payload = serde_json::to_value(response).expect("serialization must succeed");

        assert_eq!(payload["package_id"], "0xabc");
        assert_eq!(payload["target_module"], "locked");
        assert_eq!(payload["target_function"], "issue_locked");
        assert_eq!(payload["arguments"][0]["kind"], "object");
        assert_eq!(payload["arguments"][1]["kind"], "pure_string");
        assert_eq!(payload["arguments"][2]["kind"], "pure_u64");
    }
}
