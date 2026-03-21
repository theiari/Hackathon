module notarization_package_hackathon::credential_domain;

use iota::event;
use iota::table::{Self, Table};
use iota::vec_map::{Self, VecMap};
use notarization_package_hackathon::field_schema::FieldDescriptor;
use std::string::String;

// === Error constants ===
const E_NOT_A_SIGNER: u64 = 1;
const E_ALREADY_VOTED: u64 = 2;
const E_PROPOSAL_ALREADY_EXECUTED: u64 = 3;
const E_THRESHOLD_NOT_MET: u64 = 4;
#[allow(unused_const)]
const E_INVALID_FIELD_TYPE: u64 = 5;
#[allow(unused_const)]
const E_DUPLICATE_CREDENTIAL_TYPE: u64 = 6;
const E_WRONG_DOMAIN_CAP: u64 = 7;
const E_EMPTY_FIELDS: u64 = 8;

// === Events ===
public struct ProposalCreated has copy, drop {
    domain_id: ID,
    proposal_id: u64,
    credential_type: String,
    proposer: address,
}

public struct TemplatePublished has copy, drop {
    domain_id: ID,
    template_id: ID,
    credential_type: String,
    version: u64,
}

public struct TemplateDecreePublished has copy, drop {
    domain_id: ID,
    template_id: ID,
    credential_type: String,
    law_reference: String,
}

// === Core structs ===

public struct CredentialDomain has key {
    id: UID,
    name: String,
    description: String,
    schema_authority_did: String,
    signers: vector<address>,
    threshold: u64,
    active_templates: Table<String, ID>,
    proposals: Table<u64, Proposal>,
    proposal_counter: u64,
}

public struct CredentialTypeTemplate has key, store {
    id: UID,
    domain_id: ID,
    credential_type: String,
    version: u64,
    fields: vector<FieldDescriptor>,
    schema_authority_did: String,
    deprecated: bool,
    superseded_by: Option<ID>,
    law_reference: Option<String>,
}

public struct Proposal has store {
    id: u64,
    proposer: address,
    credential_type: String,
    proposed_fields: vector<FieldDescriptor>,
    proposed_schema_authority_did: String,
    supersedes: Option<ID>,
    approvals: VecMap<address, bool>,
    executed: bool,
}

public struct DomainAdminCap has key, store {
    id: UID,
    domain_id: ID,
}

// === Domain creation ===

public fun create_domain(
    name: String,
    description: String,
    schema_authority_did: String,
    signers: vector<address>,
    threshold: u64,
    ctx: &mut TxContext,
): DomainAdminCap {
    let domain = CredentialDomain {
        id: object::new(ctx),
        name,
        description,
        schema_authority_did,
        signers,
        threshold,
        active_templates: table::new(ctx),
        proposals: table::new(ctx),
        proposal_counter: 0,
    };
    let cap = DomainAdminCap {
        id: object::new(ctx),
        domain_id: object::id(&domain),
    };
    transfer::share_object(domain);
    cap
}

// === Governance ===

public fun submit_proposal(
    domain: &mut CredentialDomain,
    credential_type: String,
    proposed_fields: vector<FieldDescriptor>,
    proposed_schema_authority_did: String,
    supersedes: Option<ID>,
    ctx: &TxContext,
): u64 {
    let sender = ctx.sender();
    assert!(is_signer(domain, sender), E_NOT_A_SIGNER);
    assert!(!proposed_fields.is_empty(), E_EMPTY_FIELDS);

    let proposal_id = domain.proposal_counter;
    domain.proposal_counter = proposal_id + 1;

    let mut approvals = vec_map::empty();
    approvals.insert(sender, true);

    let proposal = Proposal {
        id: proposal_id,
        proposer: sender,
        credential_type,
        proposed_fields,
        proposed_schema_authority_did,
        supersedes,
        approvals,
        executed: false,
    };

    event::emit(ProposalCreated {
        domain_id: object::id(domain),
        proposal_id,
        credential_type: proposal.credential_type,
        proposer: sender,
    });

    domain.proposals.add(proposal_id, proposal);
    proposal_id
}

public fun approve_proposal(domain: &mut CredentialDomain, proposal_id: u64, ctx: &TxContext) {
    let sender = ctx.sender();
    assert!(is_signer(domain, sender), E_NOT_A_SIGNER);

    let proposal = &mut domain.proposals[proposal_id];
    assert!(!proposal.executed, E_PROPOSAL_ALREADY_EXECUTED);
    assert!(!proposal.approvals.contains(&sender), E_ALREADY_VOTED);

    proposal.approvals.insert(sender, true);
}

public fun execute_proposal(
    domain: &mut CredentialDomain,
    proposal_id: u64,
    version: u64,
    ctx: &mut TxContext,
) {
    let domain_id = object::id(domain);
    let threshold = domain.threshold;

    let proposal = &mut domain.proposals[proposal_id];
    assert!(!proposal.executed, E_PROPOSAL_ALREADY_EXECUTED);
    assert!(proposal.approvals.size() >= threshold, E_THRESHOLD_NOT_MET);

    proposal.executed = true;

    let cred_type = proposal.credential_type;
    let fields = proposal.proposed_fields;
    let schema_did = proposal.proposed_schema_authority_did;

    let template = CredentialTypeTemplate {
        id: object::new(ctx),
        domain_id,
        credential_type: cred_type,
        version,
        fields,
        schema_authority_did: schema_did,
        deprecated: false,
        superseded_by: option::none(),
        law_reference: option::none(),
    };

    let template_id = object::id(&template);

    if (domain.active_templates.contains(cred_type)) {
        *&mut domain.active_templates[cred_type] = template_id;
    } else {
        domain.active_templates.add(cred_type, template_id);
    };

    event::emit(TemplatePublished {
        domain_id,
        template_id,
        credential_type: cred_type,
        version,
    });

    transfer::freeze_object(template);
}

public fun decree_template(
    cap: &DomainAdminCap,
    domain: &mut CredentialDomain,
    credential_type: String,
    fields: vector<FieldDescriptor>,
    schema_authority_did: String,
    law_reference: String,
    supersedes: Option<ID>,
    version: u64,
    ctx: &mut TxContext,
) {
    assert!(cap.domain_id == object::id(domain), E_WRONG_DOMAIN_CAP);
    assert!(!fields.is_empty(), E_EMPTY_FIELDS);

    let _supersedes = supersedes;

    let template = CredentialTypeTemplate {
        id: object::new(ctx),
        domain_id: object::id(domain),
        credential_type,
        version,
        fields,
        schema_authority_did,
        deprecated: false,
        superseded_by: option::none(),
        law_reference: option::some(law_reference),
    };

    let template_id = object::id(&template);

    if (domain.active_templates.contains(credential_type)) {
        *&mut domain.active_templates[credential_type] = template_id;
    } else {
        domain.active_templates.add(credential_type, template_id);
    };

    event::emit(TemplateDecreePublished {
        domain_id: object::id(domain),
        template_id,
        credential_type,
        law_reference: *template.law_reference.borrow(),
    });

    transfer::freeze_object(template);
}

// === Helpers ===

fun is_signer(domain: &CredentialDomain, addr: address): bool {
    domain.signers.contains(&addr)
}

// === Getters ===

public fun domain_name(domain: &CredentialDomain): &String { &domain.name }

public fun domain_description(domain: &CredentialDomain): &String { &domain.description }

public fun domain_schema_authority_did(domain: &CredentialDomain): &String {
    &domain.schema_authority_did
}

public fun domain_signers(domain: &CredentialDomain): &vector<address> { &domain.signers }

public fun domain_threshold(domain: &CredentialDomain): u64 { domain.threshold }

public fun template_credential_type(t: &CredentialTypeTemplate): &String { &t.credential_type }

public fun template_version(t: &CredentialTypeTemplate): u64 { t.version }

public fun template_fields(t: &CredentialTypeTemplate): &vector<FieldDescriptor> { &t.fields }

public fun template_deprecated(t: &CredentialTypeTemplate): bool { t.deprecated }

public fun template_superseded_by(t: &CredentialTypeTemplate): &Option<ID> { &t.superseded_by }

public fun template_law_reference(t: &CredentialTypeTemplate): &Option<String> { &t.law_reference }
