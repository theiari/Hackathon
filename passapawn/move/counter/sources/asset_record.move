module notarization_package_hackathon::asset_record;

use iota_notarization::notarization::Notarization;

/// Represents an asset tracking record that uses an official Locked Notarization for proof.
/// This acts as a wrapper bridging your credential domain specific logic to the official
/// cryptographic proofs maintained by the IOTA Notarization framework.
public struct AssetRecord has key, store {
    id: UID,
    notarization_id: ID, // References the official framework's notarization object
    domain_id: ID, // References your credential_domain
    asset_meta: vector<u8>,
}

/// Event emitted when an asset record is registered
public struct AssetRecordCreated has copy, drop {
    record_id: ID,
    notarization_id: ID,
    domain_id: ID,
}

/// Registers a new AssetRecord by validating it against a genuine Notarization
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
    }
}

// You can also include read helpers here:
public fun get_notarization_id(record: &AssetRecord): ID {
    record.notarization_id
}
