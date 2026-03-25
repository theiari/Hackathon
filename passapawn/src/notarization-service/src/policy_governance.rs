use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::trust_registry::TrustPolicyData;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyChangeLogEntry {
    pub event: String,
    pub policy_version: String,
    pub change_author: String,
    pub change_note: Option<String>,
    pub signature: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDraft {
    pub version: String,
    pub policy: TrustPolicyData,
    pub created_by: String,
    pub created_at: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyGovernanceData {
    pub active_policy_version: String,
    #[serde(default)]
    pub drafts: HashMap<String, PolicyDraft>,
    #[serde(default)]
    pub changelog: Vec<PolicyChangeLogEntry>,
    #[serde(default)]
    pub rollback_stack: Vec<String>,
    #[serde(default)]
    pub freeze_writes: bool,
}

impl PolicyGovernanceData {
    pub fn bootstrap(active_policy: &TrustPolicyData) -> Self {
        Self {
            active_policy_version: active_policy.version.clone(),
            drafts: HashMap::new(),
            changelog: Vec::new(),
            rollback_stack: Vec::new(),
            freeze_writes: false,
        }
    }
}

#[derive(Clone)]
pub struct PolicyGovernanceRegistry {
    path: PathBuf,
    data: Arc<RwLock<PolicyGovernanceData>>,
}

impl PolicyGovernanceRegistry {
    pub fn new(path: &str, active_policy: &TrustPolicyData) -> Self {
        let path_buf = PathBuf::from(path);
        let loaded = load_from_disk(&path_buf).unwrap_or_else(|| {
            let seed = PolicyGovernanceData::bootstrap(active_policy);
            let _ = write_to_disk(&path_buf, &seed);
            seed
        });
        Self {
            path: path_buf,
            data: Arc::new(RwLock::new(loaded)),
        }
    }

    pub fn get(&self) -> PolicyGovernanceData {
        self.data
            .read()
            .expect("policy governance read lock poisoned")
            .clone()
    }

    pub fn create_draft(
        &self,
        version: &str,
        mut policy: TrustPolicyData,
        author: &str,
        signature: &str,
        change_note: Option<String>,
    ) -> Result<PolicyGovernanceData> {
        let mut data = self.get();
        if data.freeze_writes {
            anyhow::bail!("policy writes are frozen");
        }

        let draft_version = version.trim();
        if draft_version.is_empty() {
            anyhow::bail!("draft version is required");
        }

        policy.version = draft_version.to_string();
        policy.change_author = Some(author.to_string());
        policy.change_signature = Some(signature.to_string());
        policy.change_note = change_note.clone();

        data.drafts.insert(
            draft_version.to_string(),
            PolicyDraft {
                version: draft_version.to_string(),
                policy,
                created_by: author.to_string(),
                created_at: Utc::now().to_rfc3339(),
                signature: signature.to_string(),
            },
        );
        data.changelog.push(PolicyChangeLogEntry {
            event: "draft_created".to_string(),
            policy_version: draft_version.to_string(),
            change_author: author.to_string(),
            change_note,
            signature: signature.to_string(),
            timestamp: Utc::now().to_rfc3339(),
        });

        self.save(data)
    }

    pub fn activate_draft(
        &self,
        version: &str,
        author: &str,
        signature: &str,
        change_note: Option<String>,
    ) -> Result<(PolicyGovernanceData, TrustPolicyData)> {
        let mut data = self.get();
        if data.freeze_writes {
            anyhow::bail!("policy writes are frozen");
        }

        let draft = data
            .drafts
            .remove(version)
            .ok_or_else(|| anyhow::anyhow!("draft version not found"))?;

        let previous_active = data.active_policy_version.clone();
        if !previous_active.is_empty() {
            data.rollback_stack.push(previous_active);
        }

        let mut active_policy = draft.policy;
        active_policy.change_author = Some(author.to_string());
        active_policy.change_signature = Some(signature.to_string());
        active_policy.change_note = change_note.clone();

        data.active_policy_version = active_policy.version.clone();
        data.changelog.push(PolicyChangeLogEntry {
            event: "draft_activated".to_string(),
            policy_version: active_policy.version.clone(),
            change_author: author.to_string(),
            change_note,
            signature: signature.to_string(),
            timestamp: Utc::now().to_rfc3339(),
        });

        let snapshot = self.save(data)?;
        Ok((snapshot, active_policy))
    }

    pub fn rollback_to(
        &self,
        target_version: &str,
        author: &str,
        signature: &str,
        change_note: Option<String>,
        freeze_policy: bool,
        target_policy: TrustPolicyData,
    ) -> Result<(PolicyGovernanceData, TrustPolicyData)> {
        let mut data = self.get();
        let mut policy = target_policy;
        policy.version = target_version.to_string();
        policy.change_author = Some(author.to_string());
        policy.change_signature = Some(signature.to_string());
        policy.change_note = change_note.clone();

        data.active_policy_version = target_version.to_string();
        data.freeze_writes = freeze_policy;
        data.changelog.push(PolicyChangeLogEntry {
            event: "rollback".to_string(),
            policy_version: target_version.to_string(),
            change_author: author.to_string(),
            change_note,
            signature: signature.to_string(),
            timestamp: Utc::now().to_rfc3339(),
        });

        let snapshot = self.save(data)?;
        Ok((snapshot, policy))
    }

    pub fn set_freeze(&self, freeze: bool) -> Result<PolicyGovernanceData> {
        let mut data = self.get();
        data.freeze_writes = freeze;
        self.save(data)
    }

    pub fn history(&self) -> Vec<PolicyChangeLogEntry> {
        self.get().changelog
    }

    fn save(&self, data: PolicyGovernanceData) -> Result<PolicyGovernanceData> {
        write_to_disk(&self.path, &data)?;
        *self
            .data
            .write()
            .expect("policy governance write lock poisoned") = data.clone();
        Ok(data)
    }
}

fn load_from_disk(path: &PathBuf) -> Option<PolicyGovernanceData> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<PolicyGovernanceData>(&content).ok()
}

fn write_to_disk(path: &PathBuf, value: &PolicyGovernanceData) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create policy governance directory {:?}", parent))?;
        }
    }

    fs::write(path, serde_json::to_string_pretty(value)?)
        .with_context(|| format!("failed to write governance file {:?}", path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_path(file: &str) -> String {
        let mut path = std::env::temp_dir();
        path.push(file);
        path.to_string_lossy().to_string()
    }

    #[test]
    fn governance_supports_draft_activate_and_rollback() {
        let path = test_path("policy-governance-test.json");
        let base = TrustPolicyData::default();
        let registry = PolicyGovernanceRegistry::new(&path, &base);

        let created = registry
            .create_draft(
                "policy-v3",
                TrustPolicyData::default(),
                "operator-a",
                "sig-a",
                Some("draft for rollout".to_string()),
            )
            .expect("draft creation should succeed");

        assert!(created.drafts.contains_key("policy-v3"));

        let (activated_state, activated_policy) = registry
            .activate_draft(
                "policy-v3",
                "operator-a",
                "sig-b",
                Some("activate".to_string()),
            )
            .expect("activation should succeed");

        assert_eq!(activated_state.active_policy_version, "policy-v3");
        assert_eq!(activated_policy.version, "policy-v3");
        assert_eq!(activated_policy.change_author.as_deref(), Some("operator-a"));

        let (rolled_back_state, rolled_back_policy) = registry
            .rollback_to(
                "policy-v2",
                "operator-b",
                "sig-c",
                Some("incident rollback".to_string()),
                true,
                activated_policy,
            )
            .expect("rollback should succeed");

        assert_eq!(rolled_back_state.active_policy_version, "policy-v2");
        assert!(rolled_back_state.freeze_writes);
        assert_eq!(rolled_back_policy.version, "policy-v2");
    }
}
