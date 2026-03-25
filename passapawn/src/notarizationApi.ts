export type PayloadStrategy = "raw" | "hash";
export type DeleteLock = "none" | { unlock_at: number } | "until_destroyed";
export type TransferLock = "none" | { unlock_at: number } | "until_destroyed";

export type TransactionArg =
  | { kind: "object"; object_id: string }
  | { kind: "pure_string"; value: string }
  | { kind: "pure_u64"; value: number };

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
  latency_ms: number;
  cache_hit: boolean;
  compat_notice?: string;
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
