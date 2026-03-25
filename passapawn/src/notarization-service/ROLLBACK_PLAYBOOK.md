# Rollback Playbook (Phase 3)

## Emergency rollback command path

Endpoint: `POST /api/v2/launch/rollback`

Required headers:

- `x-role: policy-admin`
- `x-api-key: <ROLE_POLICY_ADMIN_API_KEY>`
- `x-admin-nonce: <single-use-nonce>`

Body:

```json
{
  "target_policy_version": "policy-v2-safe",
  "change_author": "operator-id",
  "signature": "<sha256(payload:key)>",
  "freeze_policy": true,
  "reason": "incident description"
}
```

## Containment sequence

1. Set launch mode to `dry_run`
2. Roll back to known-safe policy version
3. Freeze policy writes if compromise risk exists
4. Confirm verify status distribution normalizes via `/api/v2/metrics`
5. Record incident details in compliance report trail
