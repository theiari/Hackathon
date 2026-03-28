module notarization_package_hackathon::field_schema;

use std::string::String;

// === Field type constants ===
#[allow(unused_const)]
const FIELD_TYPE_STRING: u8 = 0;
#[allow(unused_const)]
const FIELD_TYPE_U64: u8 = 1;
#[allow(unused_const)]
const FIELD_TYPE_BOOL: u8 = 2;
#[allow(unused_const)]
const FIELD_TYPE_ADDRESS: u8 = 3;
const FIELD_TYPE_BYTES: u8 = 4;

const E_INVALID_FIELD_TYPE: u64 = 5;

public struct FieldDescriptor has copy, drop, store {
    name: String,
    field_type: u8,
    required: bool,
    description: String,
    // v7c: constraints
    min_length: u64,    // 0 = no constraint
    max_length: u64,    // 0 = no constraint
    min_value: u64,     // 0 = no constraint (for field_type == 1 / U64)
    max_value: u64,     // 0 = no constraint
    pattern_hint: String, // "email", "phone", "date", "url", "iso3166-alpha2", "iso8601"; empty = none
}

public fun new(name: String, field_type: u8, required: bool, description: String): FieldDescriptor {
    assert!(validate_field_type(field_type), E_INVALID_FIELD_TYPE);
    FieldDescriptor {
        name, field_type, required, description,
        min_length: 0, max_length: 0, min_value: 0, max_value: 0,
        pattern_hint: std::string::utf8(b""),
    }
}

public fun new_field_with_constraints(
    name: String,
    field_type: u8,
    required: bool,
    description: String,
    min_length: u64,
    max_length: u64,
    min_value: u64,
    max_value: u64,
    pattern_hint: String,
): FieldDescriptor {
    assert!(validate_field_type(field_type), E_INVALID_FIELD_TYPE);
    FieldDescriptor {
        name, field_type, required, description,
        min_length, max_length, min_value, max_value, pattern_hint,
    }
}

public fun validate_field_type(field_type: u8): bool {
    field_type <= FIELD_TYPE_BYTES
}

public fun name(fd: &FieldDescriptor): &String { &fd.name }

public fun field_type(fd: &FieldDescriptor): u8 { fd.field_type }

public fun required(fd: &FieldDescriptor): bool { fd.required }

public fun description(fd: &FieldDescriptor): &String { &fd.description }

public fun field_min_length(fd: &FieldDescriptor): u64 { fd.min_length }

public fun field_max_length(fd: &FieldDescriptor): u64 { fd.max_length }

public fun field_min_value(fd: &FieldDescriptor): u64 { fd.min_value }

public fun field_max_value(fd: &FieldDescriptor): u64 { fd.max_value }

public fun field_pattern_hint(fd: &FieldDescriptor): &String { &fd.pattern_hint }
