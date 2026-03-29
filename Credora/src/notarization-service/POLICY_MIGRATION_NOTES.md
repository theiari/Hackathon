# Policy Schema Migration Notes (v2 -> v3)

## Summary

Phase 3 introduces governance metadata and staged rollout controls while preserving active policy semantics.

## New persisted artifacts

- `trust_policy.json`: active policy snapshot (still source for verification decisions)
- `policy_governance.json`: draft policies, activation history, rollback state, freeze flag

## New policy fields

- `change_author`
- `change_note`
- `change_signature`

These fields are optional and backward compatible with phase-2 policy files.

## Migration behavior

- If only legacy phase-2 policy is found, service bootstraps governance state automatically.
- Existing trust lists and revocation/dispute data remain valid without manual migration.

## Rollout guidance

1. Start with `NOTARIZATION_LAUNCH_MODE=dry_run`
2. Create and activate policy drafts via `/api/v2/policy/*`
3. Verify changelog/audit consistency
4. Move to `canary` and then `full`
