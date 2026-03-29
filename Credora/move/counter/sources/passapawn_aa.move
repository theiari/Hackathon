module notarization_package_hackathon::passapawn_aa;

use iota::account;
use iota::authenticator_function;
use iota::dynamic_field;
use iota::ed25519;
use iota::package_metadata::PackageMetadataV1;
use std::ascii;
use std::string::String;

// === Error codes ===
const E_THRESHOLD_NOT_MET: u64 = 0;
const E_EMPTY_SIGNERS: u64 = 1;
const E_INVALID_THRESHOLD: u64 = 2;
const E_WRONG_SIG_LENGTH: u64 = 3;

// === Dynamic field keys ===
public struct PublicKeysKey has copy, drop, store {}
public struct ThresholdKey has copy, drop, store {}
public struct SignerLabelsKey has copy, drop, store {}

// === AA Account struct ===
// BYTECODE VERIFIER: create_account_v1 can only be called from THIS module.
public struct PassapawnAaAccount has key {
    id: UID,
}

// === Events ===
public struct AaAccountCreated has copy, drop {
    account_id: ID,
    threshold: u64,
    signer_count: u64,
}

// === Entry: create the AA account ===
//
// package_metadata : PackageMetadataV1 of THIS package.
//   Object ID is derived with move_package::derive_package_metadata_id(package_id).
//   After redeploy: find in tx effects (type contains "PackageMetadataV1"),
//   store as VITE_PACKAGE_METADATA_ID / IOTA_PACKAGE_METADATA_ID in .env.
//
// public_keys : 32-byte raw Ed25519 public keys — one per signer.
//   Obtain from IOTA serialized sig bytes[65..97] (see dapp-kit notes).
//
// threshold : number of required valid signatures (1 <= threshold <= len(public_keys)).
//
// labels : human-readable signer names, same length as public_keys.
public entry fun create(
    package_metadata: &PackageMetadataV1,
    public_keys: vector<vector<u8>>,
    threshold: u64,
    labels: vector<String>,
    ctx: &mut TxContext,
) {
    assert!(public_keys.length() > 0, E_EMPTY_SIGNERS);
    assert!(
        threshold > 0 && threshold <= (public_keys.length() as u64),
        E_INVALID_THRESHOLD
    );

    let authenticator =
        authenticator_function::create_auth_function_ref_v1<PassapawnAaAccount>(
            package_metadata,
            ascii::string(b"passapawn_aa"),
            ascii::string(b"authenticate"),
        );

    let mut acc = PassapawnAaAccount { id: object::new(ctx) };
    let account_id = object::uid_to_inner(&acc.id);

    dynamic_field::add(&mut acc.id, PublicKeysKey {}, public_keys);
    dynamic_field::add(&mut acc.id, ThresholdKey {}, threshold);
    dynamic_field::add(&mut acc.id, SignerLabelsKey {}, labels);

    iota::event::emit(AaAccountCreated {
        account_id,
        threshold,
        signer_count: (public_keys.length() as u64),
    });

    account::create_account_v1(acc, authenticator);
}

// === Authenticator ===
//
// Called by the IOTA validator when a tx sender = this AA account address.
// signatures: vector of 64-byte raw Ed25519 sigs over ctx.digest().
//   Do NOT pass IOTA-wrapped sigs (97 bytes). Strip byte[0] in the frontend.
// The framework injects &AuthContext automatically. Do NOT import it.
#[authenticator]
public fun authenticate(
    account: &PassapawnAaAccount,
    signatures: vector<vector<u8>>,
    _: &AuthContext,
    ctx: &TxContext,
) {
    let public_keys: &vector<vector<u8>> =
        dynamic_field::borrow(&account.id, PublicKeysKey {});
    let threshold: &u64 =
        dynamic_field::borrow(&account.id, ThresholdKey {});

    let mut verified_count = 0u64;

    let n_keys = public_keys.length();
    let mut i = 0;
    while (i < n_keys) {
        let pk = &public_keys[i];
        let n_sigs = signatures.length();
        let mut j = 0;
        while (j < n_sigs) {
            let sig = &signatures[j];
            assert!(sig.length() == 64, E_WRONG_SIG_LENGTH);
            if (ed25519::ed25519_verify(sig, pk, ctx.digest())) {
                verified_count = verified_count + 1;
                break
            };
            j = j + 1;
        };
        i = i + 1;
    };

    assert!(verified_count >= *threshold, E_THRESHOLD_NOT_MET);
}

// === Read helpers ===
public fun get_threshold(acc: &PassapawnAaAccount): u64 {
    *dynamic_field::borrow(&acc.id, ThresholdKey {})
}

public fun get_signer_count(acc: &PassapawnAaAccount): u64 {
    let keys: &vector<vector<u8>> =
        dynamic_field::borrow(&acc.id, PublicKeysKey {});
    keys.length() as u64
}

public fun get_labels(acc: &PassapawnAaAccount): &vector<String> {
    dynamic_field::borrow(&acc.id, SignerLabelsKey {})
}
