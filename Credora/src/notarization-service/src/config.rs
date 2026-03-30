#[derive(Debug, Clone)]
pub struct NotarizationConfig {
    pub node_url: String,
    pub package_id: String,
    pub bind_addr: String,
    pub policy_file_path: String,
    pub profile: String,
    pub admin_api_key: Option<String>,
    pub admin_local_only: bool,
    pub verify_rate_limit_per_minute: usize,
    pub max_payload_bytes: usize,
    pub startup_checks_enabled: bool,
    pub launch_mode: String,
    pub role_verifier_api_key: Option<String>,
    pub role_policy_admin_api_key: Option<String>,
    pub role_onboarding_admin_api_key: Option<String>,
    pub policy_governance_path: String,
    pub onboarding_store_path: String,
    pub compliance_store_path: String,
    pub verify_cache_ttl_seconds: u64,
    pub metadata_index_ttl_seconds: u64,
    pub synthetic_check_enabled: bool,
    pub synthetic_check_interval_seconds: u64,
    pub synthetic_notarization_id: Option<String>,
    pub synthetic_payload: Option<String>,
    pub audit_retention_days: i64,
    pub log_retention_days: i64,
    pub secrets_file_path: Option<String>,
}

impl NotarizationConfig {
    pub fn from_env() -> Self {
        Self {
            node_url: std::env::var("IOTA_NODE_URL")
                .unwrap_or_else(|_| "https://api.devnet.iota.cafe".to_string()),
            package_id: std::env::var("IOTA_PACKAGE_ID")
                .unwrap_or_else(|_| {
                    "0x52bcff89c205d8f8b0ec62294f1baf7d6c9f52cce6437849d68d8557b6f7ed44".to_string()
                }),
            bind_addr: std::env::var("NOTARIZATION_BIND_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
            policy_file_path: std::env::var("TRUST_POLICY_PATH")
                .unwrap_or_else(|_| "trust_policy.json".to_string()),
            profile: std::env::var("NOTARIZATION_PROFILE")
                .unwrap_or_else(|_| "devnet".to_string()),
            admin_api_key: std::env::var("NOTARIZATION_ADMIN_API_KEY").ok(),
            admin_local_only: std::env::var("NOTARIZATION_ADMIN_LOCAL_ONLY")
                .ok()
                .and_then(|v| v.parse::<bool>().ok())
                .unwrap_or(true),
            verify_rate_limit_per_minute: std::env::var("VERIFY_RATE_LIMIT_PER_MINUTE")
                .ok()
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(60),
            max_payload_bytes: std::env::var("MAX_PAYLOAD_BYTES")
                .ok()
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(4096),
            startup_checks_enabled: std::env::var("STARTUP_CHECKS_ENABLED")
                .ok()
                .and_then(|v| v.parse::<bool>().ok())
                .unwrap_or(true),
            launch_mode: std::env::var("NOTARIZATION_LAUNCH_MODE")
                .unwrap_or_else(|_| "dry_run".to_string()),
            role_verifier_api_key: std::env::var("ROLE_VERIFIER_API_KEY").ok(),
            role_policy_admin_api_key: std::env::var("ROLE_POLICY_ADMIN_API_KEY")
                .or_else(|_| std::env::var("NOTARIZATION_ADMIN_API_KEY"))
                .ok(),
            role_onboarding_admin_api_key: std::env::var("ROLE_ONBOARDING_ADMIN_API_KEY").ok(),
            policy_governance_path: std::env::var("POLICY_GOVERNANCE_PATH")
                .unwrap_or_else(|_| "policy_governance.json".to_string()),
            onboarding_store_path: std::env::var("ONBOARDING_STORE_PATH")
                .unwrap_or_else(|_| "onboarding_store.json".to_string()),
            compliance_store_path: std::env::var("COMPLIANCE_STORE_PATH")
                .unwrap_or_else(|_| "compliance_store.json".to_string()),
            verify_cache_ttl_seconds: std::env::var("VERIFY_CACHE_TTL_SECONDS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(60),
            metadata_index_ttl_seconds: std::env::var("METADATA_INDEX_TTL_SECONDS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(120),
            synthetic_check_enabled: std::env::var("SYNTHETIC_CHECK_ENABLED")
                .ok()
                .and_then(|v| v.parse::<bool>().ok())
                .unwrap_or(false),
            synthetic_check_interval_seconds: std::env::var("SYNTHETIC_CHECK_INTERVAL_SECONDS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(60),
            synthetic_notarization_id: std::env::var("SYNTHETIC_NOTARIZATION_ID").ok(),
            synthetic_payload: std::env::var("SYNTHETIC_PAYLOAD").ok(),
            audit_retention_days: std::env::var("AUDIT_RETENTION_DAYS")
                .ok()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(90),
            log_retention_days: std::env::var("LOG_RETENTION_DAYS")
                .ok()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(30),
            secrets_file_path: std::env::var("SECRETS_FILE_PATH").ok(),
        }
    }
}
