use crate::config::NotarizationConfig;
use crate::model::{
    DynamicOptions, LockedOptions, PayloadStrategy, TransactionArg, TransactionIntent,
    VerificationStatus, VerificationVerdict,
};
use crate::trust_registry::{DisputeDisposition, TrustRegistry, TrustPolicyData};
use serde_json::json;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone)]
struct CachedVerification {
    verdict: VerificationVerdict,
    cached_at: Instant,
}

#[derive(Clone)]
struct CachedMetadata {
    content: Option<serde_json::Value>,
    cached_at: Instant,
}

pub struct NotarizationService {
    pub node_url: String,
    pub package_id: String,
    pub config: NotarizationConfig,
    pub trust_registry: TrustRegistry,
    verify_cache: Arc<Mutex<HashMap<String, CachedVerification>>>,
    metadata_index: Arc<Mutex<HashMap<String, CachedMetadata>>>,
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
        if cfg.startup_checks_enabled {
            validate_startup_config(&cfg)?;
            check_rpc_reachability(&cfg.node_url).await?;
        }

        let registry = TrustRegistry::new(&cfg.policy_file_path);
        Ok(Self {
            node_url: cfg.node_url.clone(),
            package_id: cfg.package_id.clone(),
            config: cfg,
            trust_registry: registry,
            verify_cache: Arc::new(Mutex::new(HashMap::new())),
            metadata_index: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn invalidate_caches(&self) {
        self.verify_cache
            .lock()
            .expect("verify cache lock poisoned")
            .clear();
        self.metadata_index
            .lock()
            .expect("metadata cache lock poisoned")
            .clear();
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
        data: &[u8],
    ) -> anyhow::Result<VerificationVerdict> {
        let started_at = Instant::now();
        let check_time = Utc::now().to_rfc3339();
        let request_hash = hex_encode(&state_bytes_from_payload(data, PayloadStrategy::Hash));
        let policy = self.trust_registry.get_policy();
        let cache_key = format!("{}:{}:{}", notarization_id, request_hash, policy.version);

        if let Some(cached) = self
            .verify_cache
            .lock()
            .expect("verify cache lock poisoned")
            .get(&cache_key)
            .cloned()
        {
            if cached.cached_at.elapsed() <= Duration::from_secs(self.config.verify_cache_ttl_seconds) {
                let mut verdict = cached.verdict;
                verdict.checked_at = Utc::now().to_rfc3339();
                verdict.cache_hit = true;
                verdict.latency_ms = started_at.elapsed().as_millis() as u64;
                return Ok(verdict);
            }
        }

        println!(
            "{}",
            json!({
                "event": "verify_request",
                "target_id": notarization_id,
                "request_hash": request_hash,
                "checked_at": check_time,
            })
        );
        
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
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::PolicyError,
                summary: "RPC Request failed".to_string(),
                reasons: vec![format!("rpc.request_failed: {}", response.status())],
                issuer: None,
                domain: None,
                template: None,
                revocation: None,
                dispute: None,
                policy_version: policy.version,
                checked_at: check_time,
                evidence: Some(json!({"source": "rpc", "error": response.status().to_string()})),
                latency_ms: started_at.elapsed().as_millis() as u64,
                cache_hit: false,
                compat_notice: Some("field 'verified' remains for v1 compatibility and is deprecated for future v3 clients".to_string()),
            });
        }

        let body: serde_json::Value = response.json().await?;
        if body
            .get("result")
            .and_then(|result| result.get("data"))
            .is_none()
        {
            return Ok(VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::NotFound,
                summary: "On-chain object not found".to_string(),
                reasons: vec!["onchain.object_not_found".to_string()],
                issuer: None,
                domain: None,
                template: None,
                revocation: None,
                dispute: None,
                policy_version: policy.version,
                checked_at: check_time,
                evidence: Some(json!({"source": "rpc", "result": "not_found"})),
                latency_ms: started_at.elapsed().as_millis() as u64,
                cache_hit: false,
                compat_notice: Some("field 'verified' remains for v1 compatibility and is deprecated for future v3 clients".to_string()),
            });
        }

        let content = if let Some(cached) = self
            .metadata_index
            .lock()
            .expect("metadata cache lock poisoned")
            .get(notarization_id)
            .cloned()
        {
            if cached.cached_at.elapsed() <= Duration::from_secs(self.config.metadata_index_ttl_seconds) {
                cached.content
            } else {
                body.get("result")
                    .and_then(|result| result.get("data"))
                    .and_then(|data| data.get("content"))
                    .cloned()
            }
        } else {
            body.get("result")
                .and_then(|result| result.get("data"))
                .and_then(|data| data.get("content"))
                .cloned()
        };

        self.metadata_index
            .lock()
            .expect("metadata cache lock poisoned")
            .insert(
                notarization_id.to_string(),
                CachedMetadata {
                    content: content.clone(),
                    cached_at: Instant::now(),
                },
            );

        let inputs = parse_policy_inputs(content.as_ref());
        let mut verdict = evaluate_policy(notarization_id, &policy, inputs, check_time);
        verdict.evidence = Some(
            verdict
                .evidence
                .unwrap_or_else(|| json!({"source": "policy", "change_author": policy.change_author})),
        );
        verdict.latency_ms = started_at.elapsed().as_millis() as u64;
        verdict.cache_hit = false;
        verdict.compat_notice = Some(
            "field 'verified' remains for v1 compatibility and is deprecated for future v3 clients"
                .to_string(),
        );

        self.verify_cache
            .lock()
            .expect("verify cache lock poisoned")
            .insert(
                cache_key,
                CachedVerification {
                    verdict: verdict.clone(),
                    cached_at: Instant::now(),
                },
            );

        println!(
            "{}",
            json!({
                "event": "verify_verdict",
                "target_id": notarization_id,
                "status": format!("{:?}", verdict.status),
                "verified": verdict.verified,
                "policy_version": verdict.policy_version,
                "checked_at": verdict.checked_at,
                "latency_ms": verdict.latency_ms,
                "cache_hit": verdict.cache_hit,
            })
        );

        Ok(verdict)
    }
}

#[derive(Debug, Clone, Default)]
struct PolicyInputs {
    issuer: Option<String>,
    domain: Option<String>,
    template_id: Option<String>,
    template_version: Option<String>,
    revoked: bool,
}

fn parse_policy_inputs(content: Option<&serde_json::Value>) -> PolicyInputs {
    let Some(content) = content else {
        return PolicyInputs::default();
    };

    let metadata = extract_policy_metadata(content);
    PolicyInputs {
        issuer: get_metadata_string(&metadata, &["issuer", "issuer_did", "issuerDid"]),
        domain: get_metadata_string(&metadata, &["domain", "domain_id", "domainId"]),
        template_id: get_metadata_string(&metadata, &["template_id", "templateId", "template"]),
        template_version: get_metadata_string(&metadata, &["template_version", "templateVersion", "version"]),
        revoked: get_metadata_bool(&metadata, &["revoked", "is_revoked", "isRevoked"]),
    }
}

fn evaluate_policy(
    notarization_id: &str,
    policy: &TrustPolicyData,
    inputs: PolicyInputs,
    checked_at: String,
) -> VerificationVerdict {
    let issuer_json = inputs.issuer.clone().map(|value| json!(value));
    let domain_json = inputs.domain.clone().map(|value| json!(value));
    let template_json = Some(json!({
        "id": inputs.template_id.clone(),
        "version": inputs.template_version.clone(),
    }));

    if let Some(revocation) = policy.revoked_credentials.get(notarization_id) {
        return VerificationVerdict {
            id: notarization_id.to_string(),
            verified: false,
            status: VerificationStatus::Revoked,
            summary: "Credential is revoked by policy registry".to_string(),
            reasons: vec!["policy.revoked_registry".to_string(), revocation.reason_code.clone()],
            issuer: issuer_json,
            domain: domain_json,
            template: template_json,
            revocation: Some(json!(revocation)),
            dispute: None,
            policy_version: policy.version.clone(),
            checked_at,
            evidence: Some(json!({
                "source": "policy",
                "change_author": policy.change_author,
                "evidence_id": revocation.evidence_id,
            })),
            latency_ms: 0,
            cache_hit: false,
            compat_notice: None,
        };
    }

    if inputs.revoked {
        return VerificationVerdict {
            id: notarization_id.to_string(),
            verified: false,
            status: VerificationStatus::Revoked,
            summary: "Credential is marked revoked in metadata".to_string(),
            reasons: vec!["policy.revoked_metadata".to_string()],
            issuer: issuer_json,
            domain: domain_json,
            template: template_json,
            revocation: Some(json!({ "is_revoked": true })),
            dispute: None,
            policy_version: policy.version.clone(),
            checked_at,
            evidence: Some(json!({"source": "metadata", "change_author": policy.change_author})),
            latency_ms: 0,
            cache_hit: false,
            compat_notice: None,
        };
    }

    if !policy.trusted_domains.is_empty() {
        let domain = inputs.domain.clone().unwrap_or_default();
        if domain.is_empty() || !policy.trusted_domains.contains(&domain) {
            return VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::UnknownDomain,
                summary: "Domain is not in trusted allowlist".to_string(),
                reasons: vec!["policy.domain_not_allowlisted".to_string()],
                issuer: issuer_json,
                domain: domain_json,
                template: template_json,
                revocation: None,
                dispute: None,
                policy_version: policy.version.clone(),
                checked_at,
                evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                latency_ms: 0,
                cache_hit: false,
                compat_notice: None,
            };
        }
    }

    if let Some(issuer) = inputs.issuer.clone() {
        if policy.blocked_issuers.contains(&issuer) {
            return VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::UnknownIssuer,
                summary: "Issuer is explicitly blocked".to_string(),
                reasons: vec!["policy.issuer_blocked".to_string()],
                issuer: issuer_json,
                domain: domain_json,
                template: template_json,
                revocation: None,
                dispute: None,
                policy_version: policy.version.clone(),
                checked_at,
                evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                latency_ms: 0,
                cache_hit: false,
                compat_notice: None,
            };
        }
    }

    if !policy.trusted_issuers.is_empty() {
        let issuer = inputs.issuer.clone().unwrap_or_default();
        if issuer.is_empty() || !policy.trusted_issuers.contains(&issuer) {
            return VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::UnknownIssuer,
                summary: "Issuer is not in trusted allowlist".to_string(),
                reasons: vec!["policy.issuer_not_allowlisted".to_string()],
                issuer: issuer_json,
                domain: domain_json,
                template: template_json,
                revocation: None,
                dispute: None,
                policy_version: policy.version.clone(),
                checked_at,
                evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                latency_ms: 0,
                cache_hit: false,
                compat_notice: None,
            };
        }
    }

    if !policy.trusted_templates.is_empty() {
        let template_id = inputs.template_id.clone().unwrap_or_default();
        if template_id.is_empty() {
            return VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::InvalidTemplate,
                summary: "Template id missing from metadata".to_string(),
                reasons: vec!["policy.template_missing".to_string()],
                issuer: issuer_json,
                domain: domain_json,
                template: template_json,
                revocation: None,
                dispute: None,
                policy_version: policy.version.clone(),
                checked_at,
                evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                latency_ms: 0,
                cache_hit: false,
                compat_notice: None,
            };
        }

        let Some(template_policy) = policy
            .trusted_templates
            .iter()
            .find(|template| template.template_id == template_id)
        else {
            return VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::InvalidTemplate,
                summary: "Template id is not trusted".to_string(),
                reasons: vec!["policy.template_not_allowlisted".to_string()],
                issuer: issuer_json,
                domain: domain_json,
                template: template_json,
                revocation: None,
                dispute: None,
                policy_version: policy.version.clone(),
                checked_at,
                evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                latency_ms: 0,
                cache_hit: false,
                compat_notice: None,
            };
        };

        let template_version = inputs.template_version.clone().unwrap_or_default();
        if let Some(min_version) = template_policy.min_version {
            let parsed_version = template_version.parse::<u64>().unwrap_or_default();
            if parsed_version < min_version {
                return VerificationVerdict {
                    id: notarization_id.to_string(),
                    verified: false,
                    status: VerificationStatus::StaleTemplate,
                    summary: "Template version is below minimum trusted version".to_string(),
                    reasons: vec!["policy.template_stale_minimum".to_string()],
                    issuer: issuer_json,
                    domain: domain_json,
                    template: template_json,
                    revocation: None,
                    dispute: None,
                    policy_version: policy.version.clone(),
                    checked_at,
                    evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                    latency_ms: 0,
                    cache_hit: false,
                    compat_notice: None,
                };
            }
        }

        if !template_policy.allowed_versions.is_empty()
            && !template_policy.allowed_versions.contains(&template_version)
        {
            return VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::StaleTemplate,
                summary: "Template version is not trusted".to_string(),
                reasons: vec!["policy.template_version_not_allowlisted".to_string()],
                issuer: issuer_json,
                domain: domain_json,
                template: template_json,
                revocation: None,
                dispute: None,
                policy_version: policy.version.clone(),
                checked_at,
                evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                latency_ms: 0,
                cache_hit: false,
                compat_notice: None,
            };
        }
    } else if !policy.trusted_template_versions.is_empty() {
        let template_version = inputs.template_version.clone().unwrap_or_default();
        if template_version.is_empty() || !policy.trusted_template_versions.contains(&template_version)
        {
            return VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::InvalidTemplate,
                summary: "Template version not allowlisted".to_string(),
                reasons: vec!["policy.template_version_not_allowlisted".to_string()],
                issuer: issuer_json,
                domain: domain_json,
                template: template_json,
                revocation: None,
                dispute: None,
                policy_version: policy.version.clone(),
                checked_at,
                evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                latency_ms: 0,
                cache_hit: false,
                compat_notice: None,
            };
        }
    }

    let mut reasons = vec!["onchain.object_found".to_string()];
    let dispute = policy.disputes.get(notarization_id);
    if let Some(dispute_record) = dispute {
        let blocked = dispute_record.status.eq_ignore_ascii_case("blocked")
            || matches!(dispute_record.disposition, DisputeDisposition::Blocked);
        let warning = dispute_record.status.eq_ignore_ascii_case("warning")
            || matches!(dispute_record.disposition, DisputeDisposition::Warning);

        if blocked {
            return VerificationVerdict {
                id: notarization_id.to_string(),
                verified: false,
                status: VerificationStatus::Disputed,
                summary: "Credential is blocked due to active dispute".to_string(),
                reasons: vec!["policy.disputed_blocked".to_string(), dispute_record.reason.clone()],
                issuer: issuer_json,
                domain: domain_json,
                template: template_json,
                revocation: None,
                dispute: Some(json!(dispute_record)),
                policy_version: policy.version.clone(),
                checked_at,
                evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
                latency_ms: 0,
                cache_hit: false,
                compat_notice: None,
            };
        }

        if warning {
            reasons.push("policy.disputed_warning".to_string());
        }
    }

    VerificationVerdict {
        id: notarization_id.to_string(),
        verified: true,
        status: VerificationStatus::Valid,
        summary: "Credential exists on-chain and passed trust policy".to_string(),
        reasons,
        issuer: issuer_json,
        domain: domain_json,
        template: template_json,
        revocation: None,
        dispute: dispute.map(|record| json!(record)),
        policy_version: policy.version.clone(),
        checked_at,
        evidence: Some(json!({"source": "policy", "change_author": policy.change_author})),
        latency_ms: 0,
        cache_hit: false,
        compat_notice: None,
    }
}

fn validate_startup_config(cfg: &NotarizationConfig) -> anyhow::Result<()> {
    if !cfg.package_id.starts_with("0x") || cfg.package_id.len() < 3 {
        anyhow::bail!("Invalid IOTA package id format")
    }
    if !matches!(cfg.profile.as_str(), "devnet" | "staging" | "mainnet") {
        anyhow::bail!("Invalid NOTARIZATION_PROFILE. Use devnet|staging|mainnet")
    }
    Ok(())
}

async fn check_rpc_reachability(node_url: &str) -> anyhow::Result<()> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "iota_getLatestCheckpointSequenceNumber",
        "params": []
    });
    let response = reqwest::Client::new()
        .post(node_url)
        .json(&payload)
        .send()
        .await?;

    if !response.status().is_success() {
        anyhow::bail!("RPC reachability check failed: {}", response.status());
    }
    Ok(())
}

fn extract_policy_metadata(content: &serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    if let Some(value) = find_nested_value_by_keys(content, &["state_metadata", "metadata"]) {
        if let Some(map) = parse_json_object(value) {
            return map;
        }
    }

    if let Some(value) = find_nested_value_by_keys(content, &["updatable_metadata", "updatableMetadata"]) {
        if let Some(map) = parse_json_object(value) {
            return map;
        }
    }

    parse_json_object(content).unwrap_or_default()
}

fn find_nested_value_by_keys<'a>(value: &'a serde_json::Value, keys: &[&str]) -> Option<&'a serde_json::Value> {
    match value {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(found) = map.get(*key) {
                    return Some(found);
                }
            }
            map.values().find_map(|entry| find_nested_value_by_keys(entry, keys))
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
                if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trust_registry::{DisputeRecord, TrustedTemplatePolicy};

    fn base_policy() -> TrustPolicyData {
        TrustPolicyData {
            version: "policy-v1".to_string(),
            trusted_domains: vec!["did:iota:domain:school".to_string()],
            trusted_issuers: vec!["did:iota:issuer:alpha".to_string()],
            trusted_templates: vec![TrustedTemplatePolicy {
                template_id: "tpl-1".to_string(),
                allowed_versions: vec!["1".to_string(), "2".to_string()],
                min_version: Some(1),
            }],
            ..TrustPolicyData::default()
        }
        .normalized()
    }

    fn base_inputs() -> PolicyInputs {
        PolicyInputs {
            issuer: Some("did:iota:issuer:alpha".to_string()),
            domain: Some("did:iota:domain:school".to_string()),
            template_id: Some("tpl-1".to_string()),
            template_version: Some("2".to_string()),
            revoked: false,
        }
    }

    #[test]
    fn evaluate_policy_valid_happy_path() {
        let verdict = evaluate_policy("0xabc", &base_policy(), base_inputs(), Utc::now().to_rfc3339());
        assert!(verdict.verified);
        assert!(matches!(verdict.status, VerificationStatus::Valid));
    }

    #[test]
    fn evaluate_policy_unknown_issuer_when_not_allowlisted() {
        let mut inputs = base_inputs();
        inputs.issuer = Some("did:iota:issuer:unknown".to_string());
        let verdict = evaluate_policy("0xabc", &base_policy(), inputs, Utc::now().to_rfc3339());
        assert!(!verdict.verified);
        assert!(matches!(verdict.status, VerificationStatus::UnknownIssuer));
    }

    #[test]
    fn evaluate_policy_stale_template_when_version_is_old() {
        let mut inputs = base_inputs();
        inputs.template_version = Some("0".to_string());
        let verdict = evaluate_policy("0xabc", &base_policy(), inputs, Utc::now().to_rfc3339());
        assert!(!verdict.verified);
        assert!(matches!(verdict.status, VerificationStatus::StaleTemplate));
    }

    #[test]
    fn evaluate_policy_disputed_when_blocked_dispute_open() {
        let mut policy = base_policy();
        policy.disputes.insert(
            "0xabc".to_string(),
            DisputeRecord {
                opened_by: "moderator".to_string(),
                target_id: "0xabc".to_string(),
                reason: "contested provenance".to_string(),
                status: "blocked".to_string(),
                opened_at: Utc::now().to_rfc3339(),
                resolved_by: None,
                resolution_note: None,
                resolved_at: None,
                disposition: DisputeDisposition::Blocked,
            },
        );

        let verdict = evaluate_policy("0xabc", &policy, base_inputs(), Utc::now().to_rfc3339());
        assert!(!verdict.verified);
        assert!(matches!(verdict.status, VerificationStatus::Disputed));
    }
}
