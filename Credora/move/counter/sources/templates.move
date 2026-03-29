module notarization_package_hackathon::templates;

use notarization_package_hackathon::credential_domain::{Self, CredentialDomain, DomainAdminCap};
use notarization_package_hackathon::field_schema;
use std::string::String;

entry fun create_domain(
    name: String,
    description: String,
    schema_authority_did: String,
    signers: vector<address>,
    threshold: u64,
    ctx: &mut TxContext,
) {
    let cap = credential_domain::create_domain(
        name,
        description,
        schema_authority_did,
        signers,
        threshold,
        ctx,
    );
    transfer::public_transfer(cap, ctx.sender());
}

entry fun submit_proposal(
    domain: &mut CredentialDomain,
    credential_type: String,
    field_names: vector<String>,
    field_types: vector<u8>,
    field_required_flags: vector<bool>,
    field_descriptions: vector<String>,
    field_min_lengths: vector<u64>,
    field_max_lengths: vector<u64>,
    field_min_values: vector<u64>,
    field_max_values: vector<u64>,
    field_pattern_hints: vector<String>,
    schema_authority_did: String,
    supersedes_opt: Option<ID>,
    ctx: &TxContext,
) {
    let fields = zip_fields(
        field_names, field_types, field_required_flags, field_descriptions,
        field_min_lengths, field_max_lengths, field_min_values, field_max_values, field_pattern_hints,
    );
    credential_domain::submit_proposal(
        domain,
        credential_type,
        fields,
        schema_authority_did,
        supersedes_opt,
        ctx,
    );
}

entry fun approve_proposal(domain: &mut CredentialDomain, proposal_id: u64, ctx: &TxContext) {
    credential_domain::approve_proposal(domain, proposal_id, ctx);
}

entry fun execute_proposal(
    domain: &mut CredentialDomain,
    proposal_id: u64,
    version: u64,
    ctx: &mut TxContext,
) {
    credential_domain::execute_proposal(domain, proposal_id, version, ctx);
}

entry fun decree_template(
    cap: &DomainAdminCap,
    domain: &mut CredentialDomain,
    credential_type: String,
    field_names: vector<String>,
    field_types: vector<u8>,
    field_required_flags: vector<bool>,
    field_descriptions: vector<String>,
    field_min_lengths: vector<u64>,
    field_max_lengths: vector<u64>,
    field_min_values: vector<u64>,
    field_max_values: vector<u64>,
    field_pattern_hints: vector<String>,
    schema_authority_did: String,
    law_reference: String,
    supersedes_opt: Option<ID>,
    version: u64,
    ctx: &mut TxContext,
) {
    let fields = zip_fields(
        field_names, field_types, field_required_flags, field_descriptions,
        field_min_lengths, field_max_lengths, field_min_values, field_max_values, field_pattern_hints,
    );
    credential_domain::decree_template(
        cap,
        domain,
        credential_type,
        fields,
        schema_authority_did,
        law_reference,
        supersedes_opt,
        version,
        ctx,
    );
}

fun zip_fields(
    names: vector<String>,
    types: vector<u8>,
    required: vector<bool>,
    descriptions: vector<String>,
    min_lengths: vector<u64>,
    max_lengths: vector<u64>,
    min_values: vector<u64>,
    max_values: vector<u64>,
    pattern_hints: vector<String>,
): vector<field_schema::FieldDescriptor> {
    let len = names.length();
    assert!(
        len == types.length()
        && len == required.length()
        && len == descriptions.length()
        && len == min_lengths.length()
        && len == max_lengths.length()
        && len == min_values.length()
        && len == max_values.length()
        && len == pattern_hints.length(),
        100,
    );

    let mut fields = vector[];
    let mut i = 0;
    while (i < len) {
        fields.push_back(field_schema::new_field_with_constraints(
            names[i], types[i], required[i], descriptions[i],
            min_lengths[i], max_lengths[i], min_values[i], max_values[i], pattern_hints[i],
        ));
        i = i + 1;
    };
    fields
}
