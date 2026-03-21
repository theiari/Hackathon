use crate::config::NotarizationConfig;
use crate::model::{
    DynamicOptions, LockedOptions, PayloadStrategy, TransactionArg, TransactionIntent,
    VerificationStatus, VerificationVerdict,
};
use serde_json::json;

pub struct NotarizationService {
    pub node_url: String,
    pub package_id: String,
    pub config: NotarizationConfig,
}

fn hex_encode(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02x}", b)).collect()
}

fn state_bytes_from_payload(data: &[u8], strategy: PayloadStrategy) -> Vec<u8> {
    match strategy {
        PayloadStrategy::Raw => data.to_vec(),
        PayloadStrategy::Hash => {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(data);
            hasher.finalize().to_vec()
        }
    }
}

impl NotarizationService {
    pub async fn new(cfg: NotarizationConfig) -> anyhow::Result<Self> {
        Ok(Self {
            node_url: cfg.node_url.clone(),
            package_id: cfg.package_id.clone(),
            config: cfg,
        })
    }

    pub async fn create_locked_notarization(
        &self,
        data: &[u8],
        payload_strategy: PayloadStrategy,
        _options: LockedOptions,
        immutable_description: String,
        state_metadata: String,
    ) -> anyhow::Result<TransactionIntent> {
        let state_bytes = state_bytes_from_payload(data, payload_strategy);
        
        Ok(TransactionIntent {
            package_id: self.package_id.clone(),
            target_module: "locked".to_string(),
            target_function: "issue_locked".to_string(),
            arguments: vec![
                TransactionArg::PureString {
                    value: hex_encode(&state_bytes),
                },
                TransactionArg::PureString {
                    value: immutable_description,
                },
                TransactionArg::PureString {
                    value: state_metadata,
                },
            ],
        })
    }

    pub async fn create_dynamic_notarization(
        &self,
        data: &[u8],
        payload_strategy: PayloadStrategy,
        _options: DynamicOptions,
        immutable_description: String,
        state_metadata: String,
    ) -> anyhow::Result<TransactionIntent> {
        let state_bytes = state_bytes_from_payload(data, payload_strategy);
        
        Ok(TransactionIntent {
            package_id: self.package_id.clone(),
            target_module: "dynamic".to_string(),
            target_function: "issue_dynamic".to_string(),
            arguments: vec![
                TransactionArg::PureString {
                    value: hex_encode(&state_bytes),
                },
                TransactionArg::PureString {
                    value: immutable_description,
                },
                TransactionArg::PureString {
                    value: state_metadata,
                },
            ],
        })
    }

    pub async fn update_dynamic_state(
        &self,
        notarization_id: &str,
        data: &[u8],
        payload_strategy: PayloadStrategy,
        state_metadata: String,
    ) -> anyhow::Result<TransactionIntent> {
        let state_bytes = state_bytes_from_payload(data, payload_strategy);
        Ok(TransactionIntent {
            package_id: self.package_id.clone(),
            target_module: "dynamic".to_string(),
            target_function: "update_state".to_string(),
            arguments: vec![
                TransactionArg::Object {
                    object_id: notarization_id.to_string(),
                },
                TransactionArg::PureString {
                    value: hex_encode(&state_bytes),
                },
                TransactionArg::PureString {
                    value: state_metadata,
                },
            ],
        })
    }

    pub async fn update_dynamic_metadata(
        &self,
        notarization_id: &str,
        new_updatable_metadata: String,
    ) -> anyhow::Result<TransactionIntent> {
        Ok(TransactionIntent {
            package_id: self.package_id.clone(),
            target_module: "dynamic".to_string(),
            target_function: "update_metadata".to_string(),
            arguments: vec![
                TransactionArg::Object {
                    object_id: notarization_id.to_string(),
                },
                TransactionArg::PureString {
                    value: new_updatable_metadata,
                },
            ],
        })
    }

    pub async fn transfer_dynamic(
        &self,
        notarization_id: &str,
        new_owner_address: &str,
    ) -> anyhow::Result<TransactionIntent> {
        Ok(TransactionIntent {
            package_id: self.package_id.clone(),
            target_module: "dynamic".to_string(),
            target_function: "transfer_dynamic".to_string(),
            arguments: vec![
                TransactionArg::Object {
                    object_id: notarization_id.to_string(),
                },
                TransactionArg::PureString {
                    value: new_owner_address.to_string(),
                },
            ],
        })
    }

    pub async fn verify_notarization(
        &self,
        notarization_id: &str,
        _data: &[u8],
    ) -> anyhow::Result<VerificationVerdict> {
        let payload = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "iota_getObject",
            "params": [
                notarization_id,
                {
                    "showContent": true
                }
            ]
        });

        let response = reqwest::Client::new()
            .post(&self.node_url)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Ok(VerificationVerdict {
                verified: false,
                status: VerificationStatus::Error,
                reasons: vec![format!("rpc.request_failed: {}", response.status())],
            });
        }

        let body: serde_json::Value = response.json().await?;
        if body
            .get("result")
            .and_then(|result| result.get("data"))
            .is_none()
        {
            return Ok(VerificationVerdict {
                verified: false,
                status: VerificationStatus::NotFound,
                reasons: vec!["onchain.object_not_found".to_string()],
            });
        }

        let content = body
            .get("result")
            .and_then(|result| result.get("data"))
            .and_then(|data| data.get("content"));

        let (issuer, domain, template_version, revoked) = parse_policy_inputs(content);

        if revoked {
            return Ok(VerificationVerdict {
                verified: false,
                status: VerificationStatus::Revoked,
                reasons: vec!["policy.revoked".to_string()],
            });
        }

        let trust_policy = &self.config.trust_policy;

        if !trust_policy.accepted_issuers.is_empty() {
            let issuer_value = issuer.unwrap_or_default();
            if issuer_value.is_empty() || !trust_policy.accepted_issuers.contains(&issuer_value) {
                return Ok(VerificationVerdict {
                    verified: false,
                    status: VerificationStatus::UnknownIssuer,
                    reasons: vec!["policy.issuer_not_allowlisted".to_string()],
                });
            }
        }

        let mut invalid_template_reasons = Vec::new();
        if !trust_policy.accepted_domains.is_empty() {
            let domain_value = domain.unwrap_or_default();
            if domain_value.is_empty() || !trust_policy.accepted_domains.contains(&domain_value) {
                invalid_template_reasons.push("policy.domain_not_allowlisted".to_string());
            }
        }

        if !trust_policy.accepted_template_versions.is_empty() {
            let version_value = template_version.unwrap_or_default();
            if version_value.is_empty()
                || !trust_policy
                    .accepted_template_versions
                    .contains(&version_value)
            {
                invalid_template_reasons
                    .push("policy.template_version_not_allowlisted".to_string());
            }
        }

        if !invalid_template_reasons.is_empty() {
            return Ok(VerificationVerdict {
                verified: false,
                status: VerificationStatus::InvalidTemplate,
                reasons: invalid_template_reasons,
            });
        }

        Ok(VerificationVerdict {
            verified: true,
            status: VerificationStatus::Valid,
            reasons: vec!["onchain.object_found".to_string()],
        })
    }
}

fn parse_policy_inputs(content: Option<&serde_json::Value>) -> (Option<String>, Option<String>, Option<String>, bool) {
    let Some(content) = content else {
        return (None, None, None, false);
    };

    let metadata = extract_policy_metadata(content);
    let issuer = get_metadata_string(&metadata, &["issuer", "issuer_did", "issuerDid"]);
    let domain = get_metadata_string(&metadata, &["domain", "domain_id", "domainId"]);
    let template_version =
        get_metadata_string(&metadata, &["template_version", "templateVersion", "version"]);
    let revoked = get_metadata_bool(&metadata, &["revoked", "is_revoked", "isRevoked"]);

    (issuer, domain, template_version, revoked)
}

fn extract_policy_metadata(content: &serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    if let Some(value) = find_nested_value_by_keys(content, &["state_metadata", "metadata"]) {
        if let Some(map) = parse_json_object(value) {
            return map;
        }
    }

    if let Some(value) = find_nested_value_by_keys(content, &["updatable_metadata", "updatableMetadata"])
    {
        if let Some(map) = parse_json_object(value) {
            return map;
        }
    }

    parse_json_object(content).unwrap_or_default()
}

fn find_nested_value_by_keys<'a>(
    value: &'a serde_json::Value,
    keys: &[&str],
) -> Option<&'a serde_json::Value> {
    match value {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(found) = map.get(*key) {
                    return Some(found);
                }
            }
            map.values()
                .find_map(|entry| find_nested_value_by_keys(entry, keys))
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|entry| find_nested_value_by_keys(entry, keys)),
        _ => None,
    }
}

fn parse_json_object(value: &serde_json::Value) -> Option<serde_json::Map<String, serde_json::Value>> {
    match value {
        serde_json::Value::Object(map) => Some(map.clone()),
        serde_json::Value::String(raw) => serde_json::from_str::<serde_json::Value>(raw)
            .ok()
            .and_then(|parsed| parsed.as_object().cloned()),
        _ => None,
    }
}

fn get_metadata_string(metadata: &serde_json::Map<String, serde_json::Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        metadata.get(*key).and_then(|value| match value {
            serde_json::Value::String(text) => {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }
            serde_json::Value::Number(number) => Some(number.to_string()),
            _ => None,
        })
    })
}

fn get_metadata_bool(metadata: &serde_json::Map<String, serde_json::Value>, keys: &[&str]) -> bool {
    keys.iter().any(|key| {
        metadata.get(*key).is_some_and(|value| match value {
            serde_json::Value::Bool(flag) => *flag,
            serde_json::Value::String(text) => text.eq_ignore_ascii_case("true"),
            _ => false,
        })
    })
}
