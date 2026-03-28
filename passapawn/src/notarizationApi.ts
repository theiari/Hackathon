export type PayloadStrategy = "raw" | "hash";
export type DeleteLock = "none" | { unlock_at: number } | "until_destroyed";
export type TransferLock = "none" | { unlock_at: number } | "until_destroyed";

export type TransactionArg =
  | { kind: "object"; object_id: string }
  | { kind: "pure_id"; value: string }
  | { kind: "pure_bytes"; value: number[] }
  | { kind: "pure_bcs_bytes"; value: number[] }
  | { kind: "pure_string"; value: string }
  | { kind: "pure_string_vector"; value: string[] }
  | { kind: "pure_u64"; value: number }
  | { kind: "pure_bool"; value: boolean };

export interface TransactionIntentResponse {
  package_id: string;
  target_module: string;
  target_function: string;
  arguments: TransactionArg[];
}

export interface VerifyResponse {
  id: string;
  verified: boolean;
  status:
    | "valid"
    | "not_found"
    | "revoked_on_chain"
    | "expired"
    | "revoked"
    | "unknown_issuer"
    | "unknown_domain"
    | "invalid_template"
    | "stale_template"
    | "policy_error"
    | "disputed";
  summary: string;
  reasons: string[];
  issuer?: unknown;
  domain?: unknown;
  template?: unknown;
  revocation?: unknown;
  dispute?: unknown;
  policy_version: string;
  checked_at: string;
  request_id: string;
  evidence?: unknown;
  credential_metadata?: {
    schema_version: number;
    credential_type?: string;
    template_id?: string;
    issuer_domain_id?: string;
    issued_at?: string;
    expiry_iso?: string | null;
    transferable?: boolean;
    public_fields?: Record<string, string>;
    hashed_fields?: Record<string, string>;
  } | null;
  on_chain_transferable?: boolean | null;
  latency_ms: number;
  cache_hit: boolean;
  compat_notice?: string;
}

export interface CreateCredentialRecordPayload {
  notarization_id: string;
  domain_id: string;
  meta: string;
  expiry_unix: number;
  transferable: boolean;
  tags: string[];
}

export interface ExplorerCredentialItem {
  record_id: string;
  domain_id: string | null;
  tags: string[];
  credential_type: string | null;
  issued_at: string | null;
  expiry_iso: string | null;
  revoked: boolean;
  transferable: boolean;
  status: "valid" | "expired" | "revoked_on_chain";
}

export interface ExplorerResponse {
  items: ExplorerCredentialItem[];
  total: number;
  truncated: boolean;
  next_cursor: string | null;
  fetched_at: string;
}

export interface PresentationResponse {
  credential_id: string;
  holder_address: string;
  presentation_valid: boolean;
  presentation_verified_at: string;
  signature_valid: boolean;
  holder_owns_credential: boolean;
  nonce: string;
  timestamp: string;
  reason?: string | null;
  verdict: VerifyResponse;
}

export interface HolderCredential {
  id: string;
  object_type: "AssetRecord" | "Notarization";
  domain_id: string | null;
  asset_meta_preview: string | null;
  verdict: VerifyResponse;
  fetched_at: string;
}

export interface HolderCredentialsResponse {
  address: string;
  credentials: HolderCredential[];
  count: number;
  truncated: boolean;
  fetched_at: string;
}

export interface TemplateField {
  name: string;
  field_type: number;
  required: boolean;
  description: string;
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  pattern_hint?: string;
}

export interface TemplateFieldsResponse {
  template_id: string;
  credential_type: string;
  fields: TemplateField[];
}

export interface IssuerCredential {
  record_id: string;
  notarization_id: string;
  verdict: VerifyResponse;
  fetched_at: string;
}

export interface IssuerCredentialsResponse {
  domain_id: string;
  credentials: IssuerCredential[];
  total: number;
  truncated: boolean;
  fetched_at: string;
}

const API_BASE = import.meta.env.VITE_NOTARIZATION_API_URL ?? "http://127.0.0.1:8080";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function createLockedIntent(payload: {
  data: string;
  payload_strategy: PayloadStrategy;
  delete_lock: DeleteLock;
  immutable_description: string;
  state_metadata: string;
}) {
  return postJson<TransactionIntentResponse>("/notarizations/locked", payload);
}

export function createDynamicIntent(payload: {
  data: string;
  payload_strategy: PayloadStrategy;
  transfer_lock: TransferLock;
  immutable_description: string;
  state_metadata: string;
  updatable_metadata?: string;
}) {
  return postJson<TransactionIntentResponse>("/notarizations/dynamic", payload);
}

export function verifyOnChain(id: string, data: string) {
  return postJson<VerifyResponse>(`/api/v2/notarizations/${id}/verify`, { data });
}

export function verifyPublic(id: string) {
  return getJson<VerifyResponse>(`/api/v1/public/verify/${id}`);
}

export function createCredentialRecordIntent(payload: CreateCredentialRecordPayload) {
  return postJson<TransactionIntentResponse>("/api/v2/credential-record/intent", payload);
}

export function createRevokeOnchainIntent(recordId: string, domainCapId: string, apiKey: string) {
  return fetch(`${API_BASE}/api/v2/credentials/${encodeURIComponent(recordId)}/revoke-onchain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-role": "policy-admin",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ domain_cap_id: domainCapId }),
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed: ${response.status}`);
    }
    return response.json() as Promise<TransactionIntentResponse>;
  });
}

export async function verifyPresentation(token: string): Promise<PresentationResponse> {
  const response = await fetch(`${API_BASE}/api/v1/public/present?token=${encodeURIComponent(token)}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }
  return (await response.json()) as PresentationResponse;
}

export function getHolderCredentials(address: string) {
  return getJson<HolderCredentialsResponse>(
    `/api/v1/holder/${encodeURIComponent(address)}/credentials`,
  );
}

export function fetchHolderCredentials(address: string) {
  return getHolderCredentials(address);
}

export function fetchTemplateFields(templateId: string) {
  return getJson<TemplateFieldsResponse>(
    `/api/v1/templates/${encodeURIComponent(templateId)}/fields`,
  );
}

export function fetchIssuerCredentials(domainId: string, apiKey: string) {
  return fetch(`${API_BASE}/api/v2/issuer/${encodeURIComponent(domainId)}/credentials`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-role": "verifier",
      "x-api-key": apiKey,
    },
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed: ${response.status}`);
    }
    return response.json() as Promise<IssuerCredentialsResponse>;
  });
}

export async function fetchExplorer(params: {
  tag?: string;
  domain_id?: string;
  credential_type?: string;
  limit?: number;
  cursor?: string;
}): Promise<ExplorerResponse> {
  const qs = new URLSearchParams();
  if (params.tag) qs.set("tag", params.tag);
  if (params.domain_id) qs.set("domain_id", params.domain_id);
  if (params.credential_type) qs.set("credential_type", params.credential_type);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  const response = await fetch(`${API_BASE}/api/v1/explorer/credentials?${qs.toString()}`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as ExplorerResponse;
}

// === AA (Account Abstraction) types and functions ===

export interface CreateAaAccountIntentRequest {
  public_keys_hex: string[];
  threshold: number;
  labels: string[];
  package_metadata_id: string;
}

export interface AaSigningRequest {
  tx_bytes_b64: string;
  aa_account_id: string;
  threshold: number;
  signer_count: number;
  action_description: string;
}

export interface AaGovernanceIntentRequest {
  aa_account_id: string;
  domain_id: string;
  proposal_id: number;
  template_version: number;
}

export interface AaSubmitRequest {
  tx_bytes_b64: string;
  signatures_hex: string[];
}

export interface AaSubmitResponse {
  submitted: boolean;
  digest?: string | null;
  error?: string | null;
  proof_bytes_b64?: string | null;
}

export async function createAaAccountIntent(
  req: CreateAaAccountIntentRequest,
): Promise<TransactionIntentResponse> {
  return postJson<TransactionIntentResponse>("/api/v2/aa/create-account-intent", req);
}

export async function createAaGovernanceIntent(
  req: AaGovernanceIntentRequest,
): Promise<AaSigningRequest> {
  return postJson<AaSigningRequest>("/api/v2/aa/governance-intent", req);
}

export async function submitAaTransaction(
  req: AaSubmitRequest,
): Promise<AaSubmitResponse> {
  return postJson<AaSubmitResponse>("/api/v2/aa/submit", req);
}

// ── DID (IOTA Identity) ──

export interface DidDocument {
  "@context": string[];
  id: string;
  controller?: string;
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase?: string;
  }>;
  authentication: string[];
  assertionMethod: string[];
  service: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
  created?: string;
  updated?: string;
}

export interface DidCreateRequest {
  domain_object_id: string;
  controller_address: string;
  domain_name: string;
}

export function createDid(req: DidCreateRequest) {
  return postJson<DidDocument>("/api/v1/did/create", req);
}

export function resolveDid(didId: string) {
  return getJson<DidDocument>(`/api/v1/did/resolve/${encodeURIComponent(didId)}`);
}

export { API_BASE };
