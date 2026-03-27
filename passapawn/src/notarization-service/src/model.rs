use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotarizationMethod {
    Locked,
    Dynamic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PayloadStrategy {
    Raw,   // store full data
    Hash,  // store SHA-256 hash only
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeleteLock {
    None,
    UnlockAt(u64),    // unix timestamp
    UntilDestroyed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferLock {
    None,
    UnlockAt(u64),
    UntilDestroyed,
}

#[derive(Debug, Clone)]
pub struct LockedOptions {
    pub delete_lock: DeleteLock,
}

#[derive(Debug, Clone)]
pub struct DynamicOptions {
    pub transfer_lock: TransferLock,
    pub updatable_metadata: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TransactionIntent {
    pub package_id: String,
    pub target_module: String,
    pub target_function: String,
    pub arguments: Vec<TransactionArg>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TransactionArg {
    Object {
        object_id: String,
    },
    PureId {
        value: String,
    },
    PureBytes {
        value: Vec<u8>,
    },
    PureString {
        value: String,
    },
    PureU64 {
        value: u64,
    },
    PureBool {
        value: bool,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Valid,
    NotFound,
    RevokedOnChain,
    Expired,
    Revoked,
    UnknownIssuer,
    UnknownDomain,
    InvalidTemplate,
    StaleTemplate,
    PolicyError,
    Disputed,
}

#[derive(Debug, Clone, Serialize)]
pub struct VerificationVerdict {
    pub id: String,
    pub verified: bool,
    pub status: VerificationStatus,
    pub summary: String,
    pub reasons: Vec<String>,
    pub issuer: Option<Value>,
    pub domain: Option<Value>,
    pub template: Option<Value>,
    pub revocation: Option<Value>,
    pub dispute: Option<Value>,
    pub policy_version: String,
    pub checked_at: String,
    pub evidence: Option<Value>,
    pub credential_metadata: Option<Value>,
    pub on_chain_transferable: Option<bool>,
    pub latency_ms: u64,
    pub cache_hit: bool,
    pub compat_notice: Option<String>,
}
