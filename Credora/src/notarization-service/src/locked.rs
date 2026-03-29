//functions for creating and verifying Locked notarizations.

use sha2::{Sha256, Digest};
use crate::model::{PayloadStrategy, DeleteLock, LockedOptions, NotarizationRecord};
use crate::client::NotarizationService;

fn prepare_state_bytes(data: &[u8], strategy: PayloadStrategy) -> Vec<u8> {
    match strategy {
        PayloadStrategy::Raw => data.to_vec(),
        PayloadStrategy::Hash => {
            let mut hasher = Sha256::new();
            hasher.update(data);
            hasher.finalize().to_vec()
        }
    }
}

// Pseudocode; replace LockType with real type from notarization crate
/*
fn map_delete_lock(lock: DeleteLock) -> LockType {
    match lock {
        DeleteLock::None => LockType::None,
        DeleteLock::UnlockAt(ts) => LockType::UnlockAt(ts),
        DeleteLock::UntilDestroyed => LockType::UntilDestroyed,
    }
}
*/

impl NotarizationService {
    pub async fn create_locked_notarization(
        &self,
        data: &[u8],
        payload_strategy: PayloadStrategy,
        options: LockedOptions,
        immutable_description: String,
        state_metadata: String,
        // signer/account reference comes from your key management
    ) -> anyhow::Result<NotarizationRecord> {
        let state_bytes = prepare_state_bytes(data, payload_strategy);

        // 1. Map delete lock to library enum.
        // let delete_lock = map_delete_lock(options.delete_lock);

        // 2. Use the Rust notarization crate’s client/builder API.
        // The exact names mirror the example 01_create_locked_notarization.[web:7][web:31]
        //
        // let builder = self.notarization_client
        //     .create_locked()
        //     .with_bytes_state(&state_bytes, state_metadata)
        //     .with_immutable_description(immutable_description)
        //     .with_delete_lock(delete_lock);
        //
        // let notarization_obj = builder.build_and_execute(/* signer */).await?;

        // 3. Map result into NotarizationRecord.
        // let record = NotarizationRecord {
        //     id: notarization_obj.id().to_string(),
        //     method: NotarizationMethod::Locked,
        //     state_version: notarization_obj.state_version_count(),
        //     immutable_description: Some(immutable_description),
        //     state_metadata: Some(state_metadata),
        //     updatable_metadata: None,
        //     last_state_change_at: notarization_obj.last_state_change_at(),
        // };

        // Ok(record)
        todo!()
    }
}

impl NotarizationService {
    pub async fn verify_notarization(
        &self,
        notarization_id: &str,
        data: &[u8],
    ) -> anyhow::Result<bool> {
        let candidate_hash = {
            let mut hasher = Sha256::new();
            hasher.update(data);
            hasher.finalize().to_vec()
        };

        // 1. Fetch notarization object from ledger using `iota-sdk` read APIs
        //    or via the notarization client.[web:31][web:36]
        //
        // let notarization_obj = self.notarization_client
        //     .load(notarization_id)
        //     .await?;
        //
        // 2. Extract stored state bytes (which are either raw data or a hash).
        // let stored_state_bytes = notarization_obj.state_bytes();
        //
        // 3. If your convention is “always store hash”, just compare directly:
        // Ok(stored_state_bytes == candidate_hash)

        todo!()
    }
}

