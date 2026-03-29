use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// W3C DID Document (simplified for hackathon)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DidDocument {
    #[serde(rename = "@context")]
    pub context: Vec<String>,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub controller: Option<String>,
    #[serde(rename = "verificationMethod", skip_serializing_if = "Vec::is_empty")]
    pub verification_method: Vec<VerificationMethod>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub authentication: Vec<String>,
    #[serde(rename = "assertionMethod", skip_serializing_if = "Vec::is_empty")]
    pub assertion_method: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub service: Vec<DidService>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationMethod {
    pub id: String,
    #[serde(rename = "type")]
    pub method_type: String,
    pub controller: String,
    #[serde(rename = "publicKeyMultibase", skip_serializing_if = "Option::is_none")]
    pub public_key_multibase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DidService {
    pub id: String,
    #[serde(rename = "type")]
    pub service_type: String,
    #[serde(rename = "serviceEndpoint")]
    pub service_endpoint: String,
}

/// In-memory DID document store
#[derive(Clone)]
pub struct DidRegistry {
    documents: Arc<Mutex<HashMap<String, DidDocument>>>,
}

impl DidRegistry {
    pub fn new() -> Self {
        Self {
            documents: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Generate a DID document for a domain.
    /// domain_object_id: the on-chain CredentialDomain object ID (0x...).
    /// controller_address: the IOTA address of the domain creator.
    /// domain_name: human-readable domain name.
    pub fn create_did_for_domain(
        &self,
        domain_object_id: &str,
        controller_address: &str,
        _domain_name: &str,
    ) -> DidDocument {
        let did = format!(
            "did:iota:devnet:{}",
            domain_object_id.trim_start_matches("0x")
        );
        let now = chrono::Utc::now().to_rfc3339();

        let vm_id = format!("{}#key-1", did);
        let doc = DidDocument {
            context: vec![
                "https://www.w3.org/ns/did/v1".to_string(),
                "https://w3id.org/security/multikey/v1".to_string(),
            ],
            id: did.clone(),
            controller: Some(format!(
                "did:iota:devnet:{}",
                controller_address.trim_start_matches("0x")
            )),
            verification_method: vec![VerificationMethod {
                id: vm_id.clone(),
                method_type: "Ed25519VerificationKey2020".to_string(),
                controller: did.clone(),
                public_key_multibase: None,
            }],
            authentication: vec![vm_id.clone()],
            assertion_method: vec![vm_id],
            service: vec![DidService {
                id: format!("{}#credora-domain", did),
                service_type: "CredoraCertificateDomain".to_string(),
                service_endpoint: format!(
                    "https://credora.app/domains/{}",
                    domain_object_id
                ),
            }],
            created: Some(now.clone()),
            updated: Some(now),
        };

        self.documents
            .lock()
            .expect("did lock")
            .insert(did.clone(), doc.clone());
        doc
    }

    pub fn resolve(&self, did: &str) -> Option<DidDocument> {
        self.documents.lock().expect("did lock").get(did).cloned()
    }

    pub fn list_all(&self) -> Vec<DidDocument> {
        self.documents
            .lock()
            .expect("did lock")
            .values()
            .cloned()
            .collect()
    }
}
