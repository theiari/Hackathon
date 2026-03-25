# Passapawn MVP (Frontend + Notarization Service)

Passapawn is a permissionless IOTA credential prototype with trust-policy verification.

## 1) Local setup

### Frontend

```bash
cd passapawn
npm install
cp .env.example .env
npm run dev
```

Frontend env vars (`passapawn/.env`):

- `VITE_NOTARIZATION_API_URL`: backend URL used for transaction intents and verification.
- `VITE_IOTA_DEFAULT_NETWORK`: `devnet | testnet | mainnet`.
- `VITE_IOTA_*_RPC_URL`: optional RPC override per network.
- `VITE_IOTA_*_PACKAGE_ID`: package ID per network.

### Backend

```bash
cd passapawn/src/notarization-service
cp .env.example .env
cargo run --release
```

Backend env vars (`passapawn/src/notarization-service/.env`):

- `IOTA_NODE_URL`: JSON-RPC node endpoint.
- `IOTA_PACKAGE_ID`: package used for generated intents.
- `NOTARIZATION_BIND_ADDR`: API bind address, default `0.0.0.0:8080`.
- `TRUST_POLICY_PATH`: persisted policy store file.
- `NOTARIZATION_PROFILE`: `devnet | staging | mainnet`.
- `STARTUP_CHECKS_ENABLED`: fail-fast checks for config + RPC reachability.
- `MAX_PAYLOAD_BYTES`: request body guardrail for verify endpoint.
- `VERIFY_RATE_LIMIT_PER_MINUTE`: per-IP verify throttle.
- `NOTARIZATION_ADMIN_LOCAL_ONLY`: keep admin endpoints loopback-only.
- `NOTARIZATION_ADMIN_API_KEY`: optional API key for admin endpoints.
- `TRUST_ACCEPTED_DOMAINS`, `TRUST_ACCEPTED_ISSUERS`, `TRUST_ACCEPTED_TEMPLATE_VERSIONS`, `TRUST_BLOCKED_ISSUERS`: one-time boot defaults for policy seed.

Policy updates are persisted and hot-reloaded via admin APIs without service redeploy.

## 2) Verification policy behavior

`POST /notarizations/:id/verify` returns:

- `verified: boolean`
- `status: valid | not_found | revoked | unknown_issuer | unknown_domain | invalid_template | stale_template | policy_error | disputed`
- `summary: string`
- `reasons: string[]`
- `id: string`
- `issuer`, `domain`, `template`, `revocation`, `dispute` metadata objects (optional)
- `policy_version`, `checked_at`, `request_id`

Policy evaluation keeps on-chain existence as the first check and then applies deterministic trust rules.

## 3) Admin policy/revocation/dispute APIs

All `/admin/*` endpoints require:

- `x-admin-nonce` header (single-use replay protection)
- loopback origin when `NOTARIZATION_ADMIN_LOCAL_ONLY=true`
- optional `x-api-key` if `NOTARIZATION_ADMIN_API_KEY` is configured

Endpoints:

- `GET /admin/policy`
- `POST /admin/policy`
- `POST /admin/revocations`
- `POST /admin/disputes/open`
- `POST /admin/disputes/:id/resolve`

## 4) API versioning (phase 3)

Stable partner endpoints are now available under `/api/v1/*` and `/api/v2/*`.

Required v2 governance endpoints:

- `GET /api/v2/policy/active`
- `POST /api/v2/policy/draft`
- `POST /api/v2/policy/activate`
- `POST /api/v2/policy/rollback`

Required v2 onboarding endpoints:

- `POST /api/v2/onboarding/request`
- `POST /api/v2/onboarding/review`
- `POST /api/v2/onboarding/activate`
- `GET /api/v2/onboarding/:id`

Additional operations endpoints:

- `GET /api/v2/metrics`
- `GET /api/v2/compliance/report`
- `POST /api/v2/launch/mode`
- `POST /api/v2/launch/rollback`

Mutation endpoints require `x-idempotency-key` and role-based headers (`x-role`, `x-api-key`, `x-admin-nonce`).

## 5) Verify response (phase 3 extension)

`POST /api/v2/notarizations/:id/verify` returns all phase-2 fields plus:

- `evidence: object | null`
- `latency_ms: number`
- `cache_hit: boolean`
- `compat_notice: string | null`

## 6) Privacy defaults (GDPR-safe MVP)

- Frontend notarization intents default to `payload_strategy = hash`.
- Backend does not persist credential payloads and does not log request bodies.
- Keep raw personal/medical data off-chain; only hashes/references/governance metadata should be notarized.

## 7) Quick verification flow

1. Start backend and frontend with configured `.env` files.
2. Connect wallet and issue a locked or dynamic notarization from the UI.
3. Copy object ID and run verify in UI.
4. Update trust policy via admin endpoints or policy file.
5. Verify again to observe explainable policy verdict changes.

## 8) Launch controls

Launch mode is runtime-configurable: `dry_run | canary | full`.

- `dry_run`: operational checks and policy governance active, rollout blocked by policy.
- `canary`: partial rollout mode with fast rollback path.
- `full`: production rollout mode after readiness gates pass.

Use `POST /api/v2/launch/rollback` for emergency rollback with optional policy freeze.
