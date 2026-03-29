use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingState {
    Requested,
    UnderReview,
    Approved,
    Active,
    Suspended,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingRecord {
    pub id: String,
    pub organization_name: String,
    pub issuer_profile: String,
    pub domain_mapping: String,
    pub signer_verification: String,
    pub state: OnboardingState,
    pub requested_at: String,
    pub reviewed_by: Option<String>,
    pub review_note: Option<String>,
    pub activated_by: Option<String>,
    pub activated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingAuditEvent {
    pub event: String,
    pub onboarding_id: String,
    pub actor: String,
    pub timestamp: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OnboardingStore {
    #[serde(default)]
    pub records: HashMap<String, OnboardingRecord>,
    #[serde(default)]
    pub audit_events: Vec<OnboardingAuditEvent>,
}

#[derive(Clone)]
pub struct OnboardingRegistry {
    path: PathBuf,
    store: Arc<RwLock<OnboardingStore>>,
}

impl OnboardingRegistry {
    pub fn new(path: &str) -> Self {
        let path_buf = PathBuf::from(path);
        let loaded = load_from_disk(&path_buf).unwrap_or_default();
        let _ = write_to_disk(&path_buf, &loaded);
        Self {
            path: path_buf,
            store: Arc::new(RwLock::new(loaded)),
        }
    }

    pub fn request(
        &self,
        organization_name: String,
        issuer_profile: String,
        domain_mapping: String,
        signer_verification: String,
        actor: String,
    ) -> Result<OnboardingRecord> {
        let mut store = self.get();
        let id = Uuid::new_v4().to_string();
        let record = OnboardingRecord {
            id: id.clone(),
            organization_name,
            issuer_profile,
            domain_mapping,
            signer_verification,
            state: OnboardingState::Requested,
            requested_at: Utc::now().to_rfc3339(),
            reviewed_by: None,
            review_note: None,
            activated_by: None,
            activated_at: None,
        };
        store.records.insert(id.clone(), record.clone());
        store.audit_events.push(OnboardingAuditEvent {
            event: "requested".to_string(),
            onboarding_id: id,
            actor,
            timestamp: Utc::now().to_rfc3339(),
            note: None,
        });
        self.save(store)?;
        Ok(record)
    }

    pub fn review(
        &self,
        onboarding_id: &str,
        actor: String,
        approve: bool,
        note: Option<String>,
    ) -> Result<OnboardingRecord> {
        let mut store = self.get();
        let record = store
            .records
            .get_mut(onboarding_id)
            .ok_or_else(|| anyhow::anyhow!("onboarding record not found"))?;

        record.state = if approve {
            OnboardingState::Approved
        } else {
            OnboardingState::Suspended
        };
        record.reviewed_by = Some(actor.clone());
        record.review_note = note.clone();

        store.audit_events.push(OnboardingAuditEvent {
            event: if approve { "approved".to_string() } else { "suspended".to_string() },
            onboarding_id: onboarding_id.to_string(),
            actor,
            timestamp: Utc::now().to_rfc3339(),
            note,
        });

        let cloned = record.clone();
        self.save(store)?;
        Ok(cloned)
    }

    pub fn activate(&self, onboarding_id: &str, actor: String) -> Result<OnboardingRecord> {
        let mut store = self.get();
        let record = store
            .records
            .get_mut(onboarding_id)
            .ok_or_else(|| anyhow::anyhow!("onboarding record not found"))?;

        if !matches!(record.state, OnboardingState::Approved) {
            anyhow::bail!("onboarding must be approved before activation");
        }

        record.state = OnboardingState::Active;
        record.activated_by = Some(actor.clone());
        record.activated_at = Some(Utc::now().to_rfc3339());

        store.audit_events.push(OnboardingAuditEvent {
            event: "activated".to_string(),
            onboarding_id: onboarding_id.to_string(),
            actor,
            timestamp: Utc::now().to_rfc3339(),
            note: None,
        });

        let cloned = record.clone();
        self.save(store)?;
        Ok(cloned)
    }

    pub fn get_by_id(&self, onboarding_id: &str) -> Option<OnboardingRecord> {
        self.get().records.get(onboarding_id).cloned()
    }

    pub fn summary(&self) -> serde_json::Value {
        let store = self.get();
        let mut requested = 0_u64;
        let mut under_review = 0_u64;
        let mut approved = 0_u64;
        let mut active = 0_u64;
        let mut suspended = 0_u64;

        for record in store.records.values() {
            match record.state {
                OnboardingState::Requested => requested += 1,
                OnboardingState::UnderReview => under_review += 1,
                OnboardingState::Approved => approved += 1,
                OnboardingState::Active => active += 1,
                OnboardingState::Suspended => suspended += 1,
            }
        }

        serde_json::json!({
            "total": store.records.len(),
            "requested": requested,
            "under_review": under_review,
            "approved": approved,
            "active": active,
            "suspended": suspended,
            "audit_events": store.audit_events.len(),
        })
    }

    pub fn audit_events(&self) -> Vec<OnboardingAuditEvent> {
        self.get().audit_events
    }

    fn get(&self) -> OnboardingStore {
        self.store
            .read()
            .expect("onboarding store read lock poisoned")
            .clone()
    }

    fn save(&self, data: OnboardingStore) -> Result<()> {
        write_to_disk(&self.path, &data)?;
        *self
            .store
            .write()
            .expect("onboarding store write lock poisoned") = data;
        Ok(())
    }
}

fn load_from_disk(path: &PathBuf) -> Option<OnboardingStore> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<OnboardingStore>(&content).ok()
}

fn write_to_disk(path: &PathBuf, value: &OnboardingStore) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create onboarding directory {:?}", parent))?;
        }
    }

    fs::write(path, serde_json::to_string_pretty(value)?)
        .with_context(|| format!("failed to write onboarding store {:?}", path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path(file: &str) -> String {
        let mut path = std::env::temp_dir();
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        path.push(format!("{}-{}", unique, file));
        path.to_string_lossy().to_string()
    }

    #[test]
    fn onboarding_state_machine_request_review_activate() {
        let path = test_path("onboarding-store-test.json");
        let _ = std::fs::remove_file(&path);
        let registry = OnboardingRegistry::new(&path);

        let requested = registry
            .request(
                "Clinic Uno".to_string(),
                "did:iota:issuer:clinic-uno".to_string(),
                "did:iota:domain:clinic".to_string(),
                "signer-ok".to_string(),
                "operator-a".to_string(),
            )
            .expect("request should succeed");
        assert!(matches!(requested.state, OnboardingState::Requested));

        let reviewed = registry
            .review(
                &requested.id,
                "operator-b".to_string(),
                true,
                Some("verified".to_string()),
            )
            .expect("review should succeed");
        assert!(matches!(reviewed.state, OnboardingState::Approved));

        let activated = registry
            .activate(&requested.id, "operator-c".to_string())
            .expect("activation should succeed");
        assert!(matches!(activated.state, OnboardingState::Active));
        assert_eq!(registry.audit_events().len(), 3);
    }
}
