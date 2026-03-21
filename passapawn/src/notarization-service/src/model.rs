use serde::{Deserialize, Serialize};

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
    PureString {
        value: String,
    },
    PureU64 {
        value: u64,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Valid,
    UnknownIssuer,
    Revoked,
    InvalidTemplate,
    NotFound,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct VerificationVerdict {
    pub verified: bool,
    pub status: VerificationStatus,
    pub reasons: Vec<String>,
}
