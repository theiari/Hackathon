# Incident Runbook (Phase 3)

## SLO Targets

- Availability: 99.9%
- P95 verify latency: <= 500 ms
- Error rate: < 1%

## Alert thresholds

- `policy_error` status > 2% over 5 minutes
- P95 verify latency > 700 ms over 10 minutes
- Synthetic check fails 3 consecutive intervals

## First response

1. Switch launch mode to `canary` or `dry_run`
2. Inspect `/api/v2/metrics`
3. Inspect `/api/v2/compliance/report` for access and policy-change context
4. Execute emergency rollback if trust decisions are compromised

## Synthetic monitor

Enable:

- `SYNTHETIC_CHECK_ENABLED=true`
- `SYNTHETIC_NOTARIZATION_ID` and `SYNTHETIC_PAYLOAD` configured

Monitor synthetic state from `/api/v2/metrics`.
