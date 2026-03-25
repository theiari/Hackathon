# Mainnet Readiness Checklist

## Configuration gates

- [ ] `NOTARIZATION_PROFILE=mainnet`
- [ ] `IOTA_NODE_URL` points to approved mainnet RPC
- [ ] `IOTA_PACKAGE_ID` validated and deployed package confirmed
- [ ] `TRUST_POLICY_PATH` exists and matches `policy_schema.json`

## Trust and compliance gates

- [ ] Trust policy loaded successfully at startup
- [ ] Trusted issuer/domain/template lists reviewed by business owner
- [ ] Backup of policy file and audit history completed
- [ ] Revocation and dispute admin procedures tested

## Operations gates

- [ ] Verify endpoint rate limit configured (`VERIFY_RATE_LIMIT_PER_MINUTE`)
- [ ] Payload limit configured (`MAX_PAYLOAD_BYTES`)
- [ ] Admin route protection configured (`NOTARIZATION_ADMIN_API_KEY` or local-only)
- [ ] Monitoring captures verification outcomes and policy changes

## Validation gates

- [ ] `cargo check` passes in `src/notarization-service`
- [ ] `cargo test` passes in `src/notarization-service`
- [ ] `npm run build` passes in project root
- [ ] Happy-path verify and adversarial-path verify manually confirmed
