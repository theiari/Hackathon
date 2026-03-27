module notarization_package_hackathon::asset_record;

// PACKAGE REDEPLOYMENT REQUIRED after v5b Move changes.
// Run: cd move/counter && iota client publish --gas-budget 100000000
// Then update {NEW_PACKAGE_ID} in .env.example, constants.ts, backend .env

use iota_notarization::notarization::Notarization;
use notarization_package_hackathon::credential_domain;

const E_WRONG_DOMAIN_CAP: u64 = 10;

public struct AssetRecord has key, store {
    id: UID,
    notarization_id: ID,
    domain_id: ID,
    asset_meta: vector<u8>,
    expiry_unix: u64,
    revoked: bool,
    transferable: bool,
}

public struct AssetRecordCreated has copy, drop {
    record_id: ID,
    notarization_id: ID,
    domain_id: ID,
}

public entry fun create_credential_record(
    notarization_id: ID,
    domain_id: ID,
    meta: vector<u8>,
    expiry_unix: u64,
    transferable: bool,
    ctx: &mut TxContext,
) {
    let id = object::new(ctx);
    let record_id = object::uid_to_inner(&id);
    iota::event::emit(AssetRecordCreated {
        record_id,
        notarization_id,
        domain_id,
    });
    let record = AssetRecord {
        id,
        notarization_id,
        domain_id,
        asset_meta: meta,
        expiry_unix,
        revoked: false,
        transferable,
    };
    transfer::public_transfer(record, ctx.sender());
}

public entry fun revoke_credential_record(
    cap: &credential_domain::DomainAdminCap,
    record: &mut AssetRecord,
    ctx: &mut TxContext,
) {
    assert!(
        credential_domain::cap_domain_id(cap) == record.domain_id,
        E_WRONG_DOMAIN_CAP
    );
    record.revoked = true;
    let _ = ctx;
}

public fun register_asset_record<D: store + drop + copy>(
    notarization: &Notarization<D>,
    domain_id: ID,
    meta: vector<u8>,
    ctx: &mut TxContext,
): AssetRecord {
    let notarization_id = object::id(notarization);
    let id = object::new(ctx);
    let record_id = object::uid_to_inner(&id);

    iota::event::emit(AssetRecordCreated {
        record_id,
        notarization_id,
        domain_id,
    });

    AssetRecord {
        id,
        notarization_id,
        domain_id,
        asset_meta: meta,
        expiry_unix: 0,
        revoked: false,
        transferable: false,
    }
}

public fun get_notarization_id(record: &AssetRecord): ID {
    record.notarization_id
}

public fun get_expiry_unix(record: &AssetRecord): u64 {
    record.expiry_unix
}

public fun is_revoked(record: &AssetRecord): bool {
    record.revoked
}

public fun is_transferable(record: &AssetRecord): bool {
    record.transferable
}

public fun get_domain_id(record: &AssetRecord): ID {
    record.domain_id
}
