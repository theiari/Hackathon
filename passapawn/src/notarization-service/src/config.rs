use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct TrustPolicy {
    pub accepted_domains: HashSet<String>,
    pub accepted_issuers: HashSet<String>,
    pub accepted_template_versions: HashSet<String>,
}

#[derive(Debug, Clone)]
pub struct NotarizationConfig {
    pub node_url: String,
    pub package_id: String,
    pub bind_addr: String,
    pub trust_policy: TrustPolicy,
}

impl NotarizationConfig {
    pub fn from_env() -> Self {
        Self {
            node_url: std::env::var("IOTA_NODE_URL")
                .unwrap_or_else(|_| "https://api.devnet.iota.cafe".to_string()),
            package_id: std::env::var("IOTA_PACKAGE_ID")
                .unwrap_or_else(|_| {
                    "0xbc6b8d122ab9b277e9ba4d1173bc62fdbdd07f2f4935f6f55327f983833b9afb"
                        .to_string()
                }),
            bind_addr: std::env::var("NOTARIZATION_BIND_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
            trust_policy: TrustPolicy {
                accepted_domains: parse_csv_set("TRUST_ACCEPTED_DOMAINS"),
                accepted_issuers: parse_csv_set("TRUST_ACCEPTED_ISSUERS"),
                accepted_template_versions: parse_csv_set("TRUST_ACCEPTED_TEMPLATE_VERSIONS"),
            },
        }
    }
}

fn parse_csv_set(var_name: &str) -> HashSet<String> {
    std::env::var(var_name)
        .ok()
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .collect()
        })
        .unwrap_or_default()
}