# Credora 🎓

> **Tamper-proof university certificates on IOTA, verified from any browser.**

![IOTA devnet](https://img.shields.io/badge/network-IOTA%20devnet-0fc1b7)
![Rust](https://img.shields.io/badge/backend-Rust%20%2F%20Axum-orange)
![React](https://img.shields.io/badge/frontend-React%2018-61dafb)
![Move](https://img.shields.io/badge/contracts-Move-6f42c1)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is Credora?

Credora is an end-to-end university certificate issuance, holding, and verification platform deployed on the IOTA devnet. It helps universities, language schools, and training providers issue tamper-proof certificate references on-chain while keeping raw personal data off-chain.

The strongest workflow is simple: an institution sets up its profile, publishes a certificate template, issues a certificate, and the holder shares a verification link that works in a plain browser with no wallet and no login.

Under the hood, the product combines **IOTA Notarization** for cryptographic anchoring, a lightweight **Decentralized Identifier (DID)** registry for issuer identity, and optional **Account Abstraction (AA)** governance that remains roadmap-facing for the hackathon demo.

---

## The Problem

Universities and certification bodies still rely on paper documents, PDFs, and manual registry checks. These systems are:

- **Slow to verify** — employers and admissions offices phone or email the issuing institution and wait days for a reply.
- **Easy to forge** — a PDF or paper certificate carries no cryptographic proof of origin.
- **Hard to share** — each institution stores credentials in its own silo; holders have no unified portfolio.
- **Privacy-hostile** — centralised credential stores duplicate sensitive data and make GDPR compliance an operational burden.

## The Solution

Credora replaces manual certificate checks with on-chain certificate records anchored by IOTA Notarization:

1. **Set up** — The institution creates its issuing profile, defines a typed certificate template, and publishes it on IOTA.
2. **Issue** — The issuer creates certificate records for students or trainees. Sensitive fields are hashed before touching the chain.
3. **Verify** — Anyone with a verification link checks the certificate against on-chain state plus trust policy. No wallet needed — works in a plain incognito browser tab.

Trust is governed by configurable institution-scoped policy and optional DID-linked issuer identity. For the hackathon demo, the product is intentionally focused on immutable certificates and frictionless verification rather than broad identity features.

---

## Architecture

```mermaid
flowchart TB
  subgraph Browser
    FE["React 18 + IOTA dApp Kit\n(Tailwind, Radix UI)"]
  end

  subgraph IOTA_Devnet["IOTA Devnet"]
    MOVE["Move Package\n5 modules"]
  end

  subgraph Backend["Rust / Axum Backend"]
    API["REST API\n40+ endpoints"]
    TRUST["Trust Policy\n+ Governance\n+ Onboarding"]
    DID["DID Registry\n(in-memory)"]
  end

  FE -- "wallet-signed TX" --> MOVE
  FE -- "REST" --> API
  API -- "IOTA JSON-RPC" --> MOVE
  API --> TRUST
  API --> DID
```

### Move Smart Contracts

| Module | Purpose | Key entry functions |
|--------|---------|---------------------|
| `credential_domain` | Multi-sig governed credential domains with proposal-based template governance | `create_domain`, `submit_proposal`, `approve_proposal`, `execute_proposal`, `decree_template` |
| `templates` | Entry-point wrappers that accept flat vectors (no struct args) for Move entry calls | `create_domain`, `submit_proposal`, `approve_proposal`, `execute_proposal`, `decree_template` |
| `asset_record` | On-chain credential records linked to a notarization + domain | `create_credential_record`, `revoke_credential_record` |
| `field_schema` | Typed field descriptors with constraints (min/max length, min/max value, pattern hints) | `new`, `new_field_with_constraints`, `validate_field_type` |
| `credora_aa` | Account Abstraction — multi-sig Ed25519 accounts for institutional governance | `create`, `authenticate` |

### Backend (Rust / Axum)

The backend provides 40+ REST endpoints covering:

- **Notarization** — locked (immutable) and dynamic (updatable / transferable) credential issuance via IOTA Notarization.
- **Verification** — multi-layer verdicts checking on-chain state, trust policy, revocation, disputes, expiry, domain trust and template validity.
- **Credential Explorer** — paginated, filterable listing of on-chain `AssetRecord` objects.
- **Holder Portfolio** — wallet-address-based credential listing with inline verification.
- **Presentation Verification** — Ed25519-signed presentation tokens proving credential ownership.
- **DID Registry** — in-memory DID document creation and resolution tied to credential domains.
- **Trust Policy & Governance** — versioned policy drafts with signature-based activation, rollback and freeze.
- **Issuer Onboarding** — multi-step onboarding workflow (request → review → activate) that auto-adds issuers to trust policy.
- **Account Abstraction** — transaction intent builders for multi-sig AA accounts and governance proposals.
- **Operational** — per-IP rate limiting, idempotency, admin nonces, SLO metrics, synthetic monitoring, compliance reporting, progressive launch modes (`dry_run` → `canary` → `full`).

### Frontend (React 18 + TypeScript)

| Component | Role |
|-----------|------|
| `LandingHero` | University-focused product intro and quick navigation |
| `GettingStarted` | 5-step institution → issue → verify walkthrough |
| `DomainPanel` | Institution setup and certificate template publishing |
| `IssuerPanel` | Certificate issuance form — single / batch, public / private fields, tags, expiry |
| `IssuerDashboard` | View issued certificates per institution with verification status |
| `HolderView` | Certificate portfolio with link sharing, signed proof generation, and QR sharing |
| `VerifierPanel` | Verify by certificate ID, display verdicts, and copy verification links |
| `VerifierHistory` | Timeline of past verifications with filtering and JSON export |
| `PresentationViewer` | Verify holder-signed proof links |
| `AaGovernancePanel` | Advanced roadmap-only governance prototype |
| `AaProposalSigner` | Advanced roadmap-only multi-sig signer flow |
| `PolicyAdminPanel` | Operator tooling, not part of the main judge flow |
| `OnboardingAdminPanel` | Operator tooling, not part of the main judge flow |

---

## IOTA Frameworks Used

### 1 — IOTA Notarization

Every credential is anchored via the IOTA Notarization crate (`notarization` v0.1). The backend builds a notarization intent (locked or dynamic), the frontend wallet signs it, and the resulting on-chain object is linked to an `AssetRecord` in our Move package. Verification reads the notarization state, checks its hash against the payload, and layers on trust-policy rules.

### 2 — IOTA Identity (DID)

Credential domains can mint a DID document that binds the domain's on-chain object ID to a resolvable `did:iota:devnet:…` identifier. The DID includes a verification method derived from the issuer's wallet address and is stored in an in-memory registry exposed via REST (`/api/v1/did/create`, `/api/v1/did/resolve/:id`, `/api/v1/did/list`).

### 3 — IOTA Account Abstraction

The `credora_aa` Move module implements a k-of-n Ed25519 multi-sig account using `iota::account::create_account_v1` and `iota::authenticator_function`. Institutions can wrap their `DomainAdminCap` inside an AA account so that governance proposals (template changes, revocations) require threshold signatures from multiple trustees. The frontend provides a dedicated AA panel and a multi-signer workflow.

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| Rust | stable (1.75+) |
| IOTA wallet extension | latest (e.g. IOTA Wallet for Chrome) |

### 1. Clone and install

```bash
git clone <repo-url> && cd Credora

# Frontend
npm install

# Backend
cd src/notarization-service && cargo build --release
```

### 2. Configure environment

```bash
# Frontend (Vite)
cp .env.example .env
# → set VITE_NOTARIZATION_API_URL (default http://127.0.0.1:8080)

# Backend
cp src/notarization-service/.env.example src/notarization-service/.env
# → set IOTA_NODE_URL, IOTA_PACKAGE_ID, NOTARIZATION_ADMIN_API_KEY
```

### 3. Start

```bash
# Terminal 1 — backend
cd src/notarization-service && cargo run --release

# Terminal 2 — frontend
npm run dev
```

### 4. Open

Navigate to `http://localhost:5173`, connect your IOTA wallet, and follow the guided demo flow.

### Docker (backend only)

```bash
docker-compose up --build
# Backend on port 3001, frontend still via `npm run dev`
```

---

## Demo Walkthrough (for Judges)

> Follow these steps to see the university certificate lifecycle in under 5 minutes.

| # | Action |
|---|--------|
| 1 | Open the app and read the **landing page** — it frames the product as university certificate issuance plus browser-based verification. |
| 2 | Click **Connect Wallet** and approve in the IOTA wallet extension. |
| 3 | In the **Issue Certificates** flow, create an institution profile (e.g. `Credora Demo School`). Note the on-chain institution domain ID. |
| 4 | In the same flow, define a certificate template (e.g. `B2 Language Certificate` or `Bachelor Degree`) with typed fields and publish it. |
| 5 | Issue a certificate by filling in the student fields, keeping sensitive data private, and signing the transaction. |
| 6 | Optional: switch to **Batch** and issue a few identical demo certificates to show repeatable issuance. |
| 7 | Open **My Certificates** to see the holder portfolio. Copy a verification link or generate a holder-signed proof. |
| 8 | Go to **Verify Certificate**, paste the certificate record ID, and inspect the multi-layer verdict and metadata card. |
| 9 | Click **Copy verification link**, open it in a **private / incognito window** — the certificate verifies with no wallet and no login. |
| 10 | If judges ask about advanced features, mention AA governance and broader operator tooling as roadmap or advanced prototype material. |

> 🚀 **KILLER DEMO MOMENT:** Step 9 — verification works from a plain browser link in incognito. No wallet, no app, no signup. Just a URL.

---

## API Overview

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | — | Health check |
| `POST` | `/api/v1/notarizations/locked` | — | Create locked notarization intent |
| `POST` | `/api/v1/notarizations/dynamic` | — | Create dynamic notarization intent |
| `POST` | `/api/v2/credential-record/intent` | — | Build `create_credential_record` TX intent |
| `GET` | `/api/v1/public/verify/:id` | — | Public credential verification |
| `POST` | `/api/v1/notarizations/:id/verify` | — | Verify with payload body |
| `GET` | `/api/v1/public/present` | rate-limited | Verify signed presentation token |
| `GET` | `/api/v1/holder/:address/credentials` | rate-limited | List credentials by wallet address |
| `GET` | `/api/v1/explorer/credentials` | — | Paginated credential explorer |
| `GET` | `/api/v1/templates/:template_id/fields` | — | Template field descriptors |
| `POST` | `/api/v1/did/create` | — | Create DID document |
| `GET` | `/api/v1/did/resolve/:did_id` | — | Resolve DID document |
| `POST` | `/api/v2/aa/create-account-intent` | — | AA account creation intent |
| `POST` | `/api/v2/aa/governance-intent` | — | AA governance TX intent |
| `POST` | `/api/v2/aa/submit` | — | Submit signed AA transaction |
| `GET` | `/api/v2/policy/active` | `policy-admin` | Active trust policy |
| `POST` | `/api/v2/policy/draft` | `policy-admin` | Create policy draft |
| `POST` | `/api/v2/policy/activate` | `policy-admin` | Activate policy draft |
| `POST` | `/api/v2/onboarding/request` | `onboarding-admin` | Submit onboarding request |
| `POST` | `/api/v2/onboarding/review` | `onboarding-admin` | Review onboarding |
| `POST` | `/api/v2/onboarding/activate` | `onboarding-admin` | Activate onboarding |
| `POST` | `/api/v2/credentials/:id/revoke-onchain` | `policy-admin` | On-chain revocation intent |
| `GET` | `/api/v2/metrics` | — | SLO / SLA metrics |
| `GET` | `/api/v2/compliance/report` | `policy-admin` | Compliance audit report |
| `POST` | `/api/v2/launch/mode` | `policy-admin` | Set launch mode |
| `POST` | `/api/v2/launch/rollback` | `policy-admin` | Emergency rollback |

> Role-based endpoints require `x-role` + `x-api-key` headers. Mutations additionally require `x-admin-nonce` + `x-idempotency-key`.

---

## Move Package

| Field | Value |
|-------|-------|
| **Package ID** | `0x488888e8dde8048f6406d1563f63903e9d41f54599e8e0c5376d1bca92083830` |
| **Metadata ID** | `0xb5b4a7d056b55692846ee73ab4651a8025769ed31dffc4fb63d93986b7ef24a6` |
| **Network** | IOTA devnet |
| **Modules** | `credential_domain`, `templates`, `asset_record`, `field_schema`, `credora_aa` |

---

## Project Structure

```
Credora/
├── index.html                      # Vite entry point
├── package.json                    # Frontend dependencies & scripts
├── vite.config.ts                  # Vite + Tailwind config
├── tsconfig.json                   # TypeScript config
├── docker-compose.yml              # Docker setup (backend)
│
├── move/counter/                   # Move smart contracts
│   ├── Move.toml
│   └── sources/
│       ├── asset_record.move       # On-chain credential records
│       ├── credential_domain.move  # Multi-sig governed domains
│       ├── field_schema.move       # Typed field descriptors + constraints
│       ├── templates.move          # Entry-point wrappers
│       └── credora_aa.move         # Account Abstraction module
│
├── src/
│   ├── App.tsx                     # Root app with tab routing
│   ├── main.tsx                    # React entry point
│   ├── constants.ts                # Package IDs, types
│   ├── flowState.ts                # Zustand flow state
│   ├── networkConfig.ts            # IOTA network config
│   ├── notarizationApi.ts          # Backend API client
│   │
│   ├── components/                 # 20+ React components
│   │   ├── LandingHero.tsx         # Landing page
│   │   ├── DomainPanel.tsx         # Domain management + governance
│   │   ├── IssuerPanel.tsx         # Credential issuance (single + batch)
│   │   ├── HolderView.tsx          # Credential portfolio
│   │   ├── VerifierPanel.tsx       # Verification + shareable links
│   │   ├── CredentialExplorer.tsx  # Public credential catalog
│   │   └── ...                     # See Frontend table above
│   │
│   └── notarization-service/       # Rust backend
│       ├── Cargo.toml
│       ├── Dockerfile
│       └── src/
│           ├── main.rs             # Axum server + all route handlers
│           ├── client.rs           # IOTA RPC client
│           ├── model.rs            # Domain types
│           ├── dto.rs              # Request / response DTOs
│           ├── config.rs           # Env-based configuration
│           ├── error.rs            # Error types
│           ├── secrets.rs          # Secrets provider
│           ├── trust_registry.rs   # Trust policy engine
│           ├── policy_governance.rs# Policy governance state machine
│           ├── onboarding_registry.rs # Onboarding workflow
│           ├── locked.rs / locked_impl.rs   # Locked notarization
│           ├── dynamic.rs / dynamic_impl.rs # Dynamic notarization
│           └── verify_impl.rs      # Multi-layer verification
│
└── scripts/
    └── seed_demo.ts                # Demo data seeder
```

---

## Known Limitations

1. **AA wallet support** — The Account Abstraction Move module is deployed on-chain, but current browser wallets (IOTA Wallet) do not yet support AA-authenticated transactions. The AA panel is marked "Architecture Ready."
2. **In-memory DID registry** — DID documents are stored in-memory and are lost on backend restart. A persistent store is planned.
3. **Batch issuance sends to issuer wallet** — Batch-issued credentials are all assigned to the connected (issuer) wallet address. Per-holder batch distribution requires a future CSV-import flow.
4. **Devnet only** — The Move package is published on IOTA devnet. Testnet and mainnet package IDs are not yet configured.
5. **No selective disclosure** — Verification is all-or-nothing against the on-chain record. ZK-based selective disclosure is on the roadmap.
6. **No on-chain revocation list** — Individual credentials can be revoked, but there is no aggregated on-chain revocation list or status-list mechanism (e.g. W3C StatusList2021). Revocation checks rely on per-object on-chain state.

---

## Standards Alignment

Credora's credential model is designed with alignment to emerging W3C and OpenID standards:

| Standard | Status | Notes |
|----------|--------|-------|
| **W3C Verifiable Credentials (VC)** | Aligned | Credential metadata follows the VC data model (issuer, holder, type, issuedAt, expiresAt). On-chain records use hash-first payloads. |
| **W3C DID Core** | Implemented | Each credential domain has a resolvable DID document. DID creation and resolution are exposed via REST endpoints. |
| **OID4VCI** | Architecture-ready | The backend issuance intent pattern maps to the OID4VCI credential offer flow. Full OID4VCI server endpoints are on the roadmap. |
| **OID4VP** | Architecture-ready | Ed25519-signed presentation tokens follow the VP token structure. A compliant OID4VP response profile is planned. |
| **W3C StatusList2021** | Planned | Per-object revocation is supported; aggregated status lists are on the roadmap. |

---

## Roadmap

- [ ] Selective disclosure with ZK proofs for verifier-minimized data sharing
- [ ] Persistent DID registry backed by on-chain or IPFS storage
- [ ] Per-holder batch issuance via CSV import
- [ ] AA wallet integration when browser wallets support AA transactions
- [ ] Multi-chain verification adapters with policy parity
- [ ] Mobile wallet-first holder UX and push notifications
- [ ] Testnet / mainnet deployment
- [ ] OID4VCI-compliant credential offer endpoint
- [ ] OID4VP-compliant verifiable presentation response profile
- [ ] W3C StatusList2021 aggregated revocation list
- [ ] Gas-sponsored holder transactions via IOTA sponsored TX

---

## License

MIT
