use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DisputeDisposition {
    Warning,
    Blocked,
    Resolved,
}

impl Default for DisputeDisposition {
    fn default() -> Self {
        Self::Warning
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TrustedTemplatePolicy {
    pub template_id: String,
    #[serde(default)]
    pub allowed_versions: Vec<String>,
    pub min_version: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevocationRecord {
    pub target_id: String,
    pub reason_code: String,
    pub timestamp: String,
    pub evidence_id: String,
    pub revoked_by: String,
    pub domain: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisputeRecord {
    pub opened_by: String,
    pub target_id: String,
    pub reason: String,
    pub status: String,
    pub opened_at: String,
    pub resolved_by: Option<String>,
    pub resolution_note: Option<String>,
    pub resolved_at: Option<String>,
    pub disposition: DisputeDisposition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustPolicyData {
    pub version: String,
    pub updated_at: String,
    #[serde(default)]
    pub change_author: Option<String>,
    #[serde(default)]
    pub change_note: Option<String>,
    #[serde(default)]
    pub change_signature: Option<String>,
    #[serde(default, alias = "accepted_domains")]
    pub trusted_domains: Vec<String>,
    #[serde(default, alias = "accepted_issuers")]
    pub trusted_issuers: Vec<String>,
    #[serde(default)]
    pub trusted_templates: Vec<TrustedTemplatePolicy>,
    #[serde(default, alias = "accepted_template_versions")]
    pub trusted_template_versions: Vec<String>,
    #[serde(default)]
    pub blocked_issuers: Vec<String>,
    #[serde(default)]
    pub revoked_credentials: HashMap<String, RevocationRecord>,
    #[serde(default, alias = "disputed_credentials")]
    pub disputes: HashMap<String, DisputeRecord>,
    #[serde(default)]
    pub dispute_default_disposition: DisputeDisposition,
}

impl Default for TrustPolicyData {
    fn default() -> Self {
        Self {
            version: "policy-v1".to_string(),
            updated_at: Utc::now().to_rfc3339(),
            change_author: None,
            change_note: None,
            change_signature: None,
            trusted_domains: Vec::new(),
            trusted_issuers: Vec::new(),
            trusted_templates: Vec::new(),
            trusted_template_versions: Vec::new(),
            blocked_issuers: Vec::new(),
            revoked_credentials: HashMap::new(),
            disputes: HashMap::new(),
            dispute_default_disposition: DisputeDisposition::Warning,
        }
    }
}

impl TrustPolicyData {
    pub fn normalized(mut self) -> Self {
        self.updated_at = Utc::now().to_rfc3339();
        self.trusted_domains = dedup_sorted_strings(self.trusted_domains);
        self.trusted_issuers = dedup_sorted_strings(self.trusted_issuers);
        self.trusted_template_versions = dedup_sorted_strings(self.trusted_template_versions);
        self.blocked_issuers = dedup_sorted_strings(self.blocked_issuers);

        self.trusted_templates = self
            .trusted_templates
            .into_iter()
            .filter(|entry| !entry.template_id.trim().is_empty())
            .map(|mut entry| {
                entry.template_id = entry.template_id.trim().to_string();
                entry.allowed_versions = dedup_sorted_strings(entry.allowed_versions);
                entry
            })
            .collect();

        self
    }

    pub fn from_env_defaults() -> Self {
        let mut policy = Self::default();
        policy.trusted_domains = split_csv_env("TRUST_ACCEPTED_DOMAINS");
        policy.trusted_issuers = split_csv_env("TRUST_ACCEPTED_ISSUERS");
        policy.trusted_template_versions = split_csv_env("TRUST_ACCEPTED_TEMPLATE_VERSIONS");
        policy.blocked_issuers = split_csv_env("TRUST_BLOCKED_ISSUERS");
        policy.normalized()
    }
}

#[derive(Clone)]
pub struct TrustRegistry {
    path: PathBuf,
    policy: Arc<RwLock<TrustPolicyData>>,
}

impl TrustRegistry {
    pub fn new(path: &str) -> Self {
        let path_buf = PathBuf::from(path);
        let loaded_policy = load_policy_from_disk(&path_buf).unwrap_or_else(|| {
            let defaults = TrustPolicyData::from_env_defaults();
            let _ = write_policy_to_disk(&path_buf, &defaults);
            defaults
        });

        Self {
            path: path_buf,
            policy: Arc::new(RwLock::new(loaded_policy.normalized())),
        }
    }

    pub fn get_policy(&self) -> TrustPolicyData {
        self.policy
            .read()
            .expect("trust policy read lock poisoned")
            .clone()
    }

    pub fn save_policy(&self, policy: TrustPolicyData) -> Result<()> {
        let normalized = policy.normalized();
        write_policy_to_disk(&self.path, &normalized)?;
        *self
            .policy
            .write()
            .expect("trust policy write lock poisoned") = normalized;
        Ok(())
    }

    pub fn update<F>(&self, apply: F) -> Result<TrustPolicyData>
    where
        F: FnOnce(&mut TrustPolicyData),
    {
        let mut next = self.get_policy();
        apply(&mut next);
        self.save_policy(next.clone())?;
        Ok(next)
    }

    pub fn add_revocation(&self, record: RevocationRecord) -> Result<TrustPolicyData> {
        self.update(move |policy| {
            policy
                .revoked_credentials
                .insert(record.target_id.clone(), record);
        })
    }

    pub fn open_dispute(&self, record: DisputeRecord) -> Result<TrustPolicyData> {
        self.update(move |policy| {
            policy.disputes.insert(record.target_id.clone(), record);
        })
    }

    pub fn resolve_dispute(
        &self,
        target_id: &str,
        resolved_by: &str,
        resolution_note: Option<String>,
    ) -> Result<TrustPolicyData> {
        self.update(|policy| {
            if let Some(record) = policy.disputes.get_mut(target_id) {
                record.status = "resolved".to_string();
                record.disposition = DisputeDisposition::Resolved;
                record.resolved_by = Some(resolved_by.to_string());
                record.resolution_note = resolution_note;
                record.resolved_at = Some(Utc::now().to_rfc3339());
            }
        })
    }
}

fn dedup_sorted_strings(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn split_csv_env(key: &str) -> Vec<String> {
    std::env::var(key)
        .ok()
        .map(|raw| {
            raw.split(',')
                .map(|segment| segment.trim().to_string())
                .filter(|segment| !segment.is_empty())
                .collect::<HashSet<_>>()
                .into_iter()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn load_policy_from_disk(path: &PathBuf) -> Option<TrustPolicyData> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<TrustPolicyData>(&content).ok()
}

fn write_policy_to_disk(path: &PathBuf, policy: &TrustPolicyData) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create policy directory {:?}", parent))?;
        }
    }

    let json = serde_json::to_string_pretty(policy)?;
    fs::write(path, json).with_context(|| format!("failed to write trust policy {:?}", path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_deduplicates_lists() {
        let policy = TrustPolicyData {
            trusted_domains: vec![" did:a ".to_string(), "did:a".to_string(), "did:b".to_string()],
            trusted_issuers: vec!["issuer1".to_string(), "issuer1".to_string()],
            trusted_template_versions: vec!["2".to_string(), "1".to_string(), "2".to_string()],
            blocked_issuers: vec!["bad-1".to_string(), "bad-1".to_string()],
            ..TrustPolicyData::default()
        }
        .normalized();

        assert_eq!(policy.trusted_domains, vec!["did:a".to_string(), "did:b".to_string()]);
        assert_eq!(policy.trusted_issuers, vec!["issuer1".to_string()]);
        assert_eq!(policy.trusted_template_versions, vec!["1".to_string(), "2".to_string()]);
        assert_eq!(policy.blocked_issuers, vec!["bad-1".to_string()]);
    }
}