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

public struct FieldDescriptor has store, copy, drop {
    name: String,
    field_type: u8,
    required: bool,
    description: String,
}

public fun new(
    name: String,
    field_type: u8,
    required: bool,
    description: String,
): FieldDescriptor {
    assert!(validate_field_type(field_type), E_INVALID_FIELD_TYPE);
    FieldDescriptor { name, field_type, required, description }
}

public fun validate_field_type(field_type: u8): bool {
    field_type <= FIELD_TYPE_BYTES
}

public fun name(fd: &FieldDescriptor): &String { &fd.name }
public fun field_type(fd: &FieldDescriptor): u8 { fd.field_type }
public fun required(fd: &FieldDescriptor): bool { fd.required }
public fun description(fd: &FieldDescriptor): &String { &fd.description }
