use serde::{Deserialize, Serialize};
use crate::model::{
    PayloadStrategy, DeleteLock, TransferLock, TransactionArg, TransactionIntent
};
use crate::trust_registry::DisputeDisposition;
use crate::trust_registry::TrustPolicyData;

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

#[derive(Debug, Deserialize)]
pub struct CreateCredentialRecordIntentRequest {
    pub notarization_id: String,
    pub domain_id: String,
    pub meta: String,
    pub expiry_unix: u64,
    pub transferable: bool,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExplorerQuery {
    pub tag: Option<String>,
    pub domain_id: Option<String>,
    pub credential_type: Option<String>,
    pub limit: Option<usize>,
    pub cursor: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExplorerCredentialItem {
    pub record_id: String,
    pub domain_id: Option<String>,
    pub tags: Vec<String>,
    pub credential_type: Option<String>,
    pub issued_at: Option<String>,
    pub expiry_iso: Option<String>,
    pub revoked: bool,
    pub transferable: bool,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct ExplorerResponse {
    pub items: Vec<ExplorerCredentialItem>,
    pub total: usize,
    pub truncated: bool,
    pub next_cursor: Option<String>,
    pub fetched_at: String,
}

#[derive(Debug, Deserialize)]
pub struct RevokeOnchainIntentRequest {
    pub domain_cap_id: String,
}

#[derive(Debug, Deserialize)]
pub struct PresentationToken {
    pub credential_id: String,
    pub holder: String,
    pub timestamp: String,
    pub nonce: String,
    pub signature: String,
    pub message_bytes: String,
}

#[derive(Debug, Deserialize)]
pub struct RevokeCredentialRequest {
    pub target_id: String,
    pub reason_code: String,
    pub evidence_id: String,
    pub revoked_by: String,
    pub domain: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OpenDisputeRequest {
    pub opened_by: String,
    pub target_id: String,
    pub reason: String,
    pub disposition: Option<DisputeDisposition>,
}

#[derive(Debug, Deserialize)]
pub struct ResolveDisputeRequest {
    pub resolved_by: String,
    pub resolution_note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PolicyDraftRequest {
    pub policy_version: String,
    pub policy: TrustPolicyData,
    pub change_author: String,
    pub change_note: Option<String>,
    pub signature: String,
}

#[derive(Debug, Deserialize)]
pub struct PolicyActivateRequest {
    pub policy_version: String,
    pub change_author: String,
    pub change_note: Option<String>,
    pub signature: String,
}

#[derive(Debug, Deserialize)]
pub struct PolicyRollbackRequest {
    pub target_policy_version: String,
    pub change_author: String,
    pub change_note: Option<String>,
    pub signature: String,
    pub freeze_policy: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct OnboardingRequestCreate {
    pub organization_name: String,
    pub issuer_profile: String,
    pub domain_mapping: String,
    pub signer_verification: String,
    pub opened_by: String,
}

#[derive(Debug, Deserialize)]
pub struct OnboardingReviewRequest {
    pub onboarding_id: String,
    pub reviewed_by: String,
    pub approve: bool,
    pub review_note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OnboardingActivateRequest {
    pub onboarding_id: String,
    pub activated_by: String,
}

#[derive(Debug, Deserialize)]
pub struct LaunchModeRequest {
    pub mode: String,
}

#[derive(Debug, Deserialize)]
pub struct EmergencyRollbackRequest {
    pub target_policy_version: String,
    pub change_author: String,
    pub signature: String,
    pub freeze_policy: Option<bool>,
    pub reason: Option<String>,
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
