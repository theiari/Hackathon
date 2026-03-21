//functions for creating, updating, transferring, and verifying Dynamic notarizations.

use crate::model::{TransferLock, DynamicOptions, NotarizationRecord, PayloadStrategy};
use crate::client::NotarizationService;

// Pseudocode; adapt to actual library types.
/*
fn map_transfer_lock(lock: TransferLock) -> TransferLockType {
    match lock {
        TransferLock::None => TransferLockType::None,
        TransferLock::UnlockAt(ts) => TransferLockType::UnlockAt(ts),
        TransferLock::UntilDestroyed => TransferLockType::UntilDestroyed,
    }
}
*/
impl NotarizationService {
    pub async fn create_dynamic_notarization(
        &self,
        data: &[u8],
        payload_strategy: PayloadStrategy,
        options: DynamicOptions,
        immutable_description: String,
        state_metadata: String,
        // signer/account reference
    ) -> anyhow::Result<NotarizationRecord> {
        let state_bytes = prepare_state_bytes(data, payload_strategy);
        // let transfer_lock = map_transfer_lock(options.transfer_lock);

        // Rust builder pseudo-API mirroring TS:
        //
        // let mut builder = self.notarization_client
        //     .create_dynamic()
        //     .with_bytes_state(&state_bytes, state_metadata)
        //     .with_immutable_description(immutable_description);
        //
        // if let Some(meta) = options.updatable_metadata.as_ref() {
        //     builder = builder.with_updatable_metadata(meta.clone());
        // }
        //
        // builder = builder.with_transfer_lock(transfer_lock);
        //
        // let notarization_obj = builder.finish().build_and_execute(/* signer */).await?;
        //
        // let record = NotarizationRecord {
        //     id: notarization_obj.id().to_string(),
        //     method: NotarizationMethod::Dynamic,
        //     state_version: notarization_obj.state_version_count(),
        //     immutable_description: Some(immutable_description),
        //     state_metadata: Some(state_metadata),
        //     updatable_metadata: options.updatable_metadata,
        //     last_state_change_at: notarization_obj.last_state_change_at(),
        // };

        // Ok(record)
        todo!()
    }
}

impl NotarizationService {
    pub async fn update_dynamic_state(
        &self,
        notarization_id: &str,
        new_data: &[u8],
        payload_strategy: PayloadStrategy,
        new_state_metadata: String,
        // signer/account
    ) -> anyhow::Result<NotarizationRecord> {
        let state_bytes = prepare_state_bytes(new_data, payload_strategy);

        // Use library's update API from client module:
        // let notarization_obj = self.notarization_client
        //     .load_dynamic(notarization_id)
        //     .with_bytes_state(&state_bytes, new_state_metadata)
        //     .build_and_execute(/* signer */)
        //     .await?;
        //
        // Map to NotarizationRecord as above.
        todo!()
    }

    pub async fn update_dynamic_metadata(
        &self,
        notarization_id: &str,
        new_updatable_metadata: String,
        // signer/account
    ) -> anyhow::Result<NotarizationRecord> {
        // let notarization_obj = self.notarization_client
        //     .load_dynamic(notarization_id)
        //     .with_updatable_metadata(new_updatable_metadata)
        //     .build_and_execute(/* signer */)
        //     .await?;
        //
        // Map to NotarizationRecord
        todo!()
    }
}

impl NotarizationService {
    pub async fn transfer_dynamic(
        &self,
        notarization_id: &str,
        new_owner_address: &str,
        // signer/account
    ) -> anyhow::Result<NotarizationRecord> {
        // Use transfer API (subject to active transfer lock).[web:5][web:24]
        //
        // let notarization_obj = self.notarization_client
        //     .load_dynamic(notarization_id)
        //     .transfer_to(new_owner_address)
        //     .build_and_execute(/* signer */)
        //     .await?;
        //
        // Map to NotarizationRecord
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

