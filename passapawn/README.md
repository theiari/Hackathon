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
- `TRUST_ACCEPTED_DOMAINS`: comma-separated allowlist.
- `TRUST_ACCEPTED_ISSUERS`: comma-separated allowlist.
- `TRUST_ACCEPTED_TEMPLATE_VERSIONS`: comma-separated allowlist.

Changing trust allowlists affects verifier verdicts without any contract redeploy.

## 2) Verification policy behavior

`POST /notarizations/:id/verify` returns:

- `verified: boolean`
- `status: valid | unknown_issuer | revoked | invalid_template | not_found | error`
- `reasons: string[]`
- `id: string`

Policy evaluation keeps the on-chain object existence check and then applies local trust allowlists.

## 3) Privacy defaults (GDPR-safe MVP)

- Frontend notarization intents default to `payload_strategy = hash`.
- Backend does not persist credential payloads and does not log request bodies.
- Keep raw personal/medical data off-chain; only hashes/references/governance metadata should be notarized.

## 4) Quick verification flow

1. Start backend and frontend with configured `.env` files.
2. Connect wallet and issue a locked or dynamic notarization from the UI.
3. Copy object ID and run verify in UI.
4. Update backend trust allowlists (issuer/domain/version) and restart backend.
5. Verify again to observe policy-aware status changes.
