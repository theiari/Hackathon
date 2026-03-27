import { useCurrentAccount, useSignPersonalMessage } from "@iota/dapp-kit";
import { useEffect, useMemo, useState } from "react";
import { fetchHolderCredentials, type HolderCredential } from "../notarizationApi";
import { CredentialMetadataCard } from "./CredentialMetadataCard";
import { InfoHint } from "./InfoHint";
import { StatusBadge } from "./StatusBadge";

const MAX_VISIBLE_CREDENTIALS = 10;

type ViewMode = "grid" | "list";
type VisibilityFilter = "all" | "public" | "private";
type ValidityFilter = "all" | "valid" | "invalid";
type SortBy =
  | "issued_desc"
  | "issued_asc"
  | "type_asc"
  | "type_desc"
  | "status_asc"
  | "status_desc"
  | "fetched_desc"
  | "fetched_asc";

function truncateId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function HolderView({
  address,
  onNavigateToVerify,
  onLoaded,
}: {
  address?: string;
  onNavigateToVerify: (id: string) => void;
  onLoaded?: (count: number) => void;
}) {
  const account = useCurrentAccount();
  const { mutate: signPersonalMessage } = useSignPersonalMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<HolderCredential[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState("");
  const [presentationError, setPresentationError] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [validityFilter, setValidityFilter] = useState<ValidityFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("issued_desc");

  const refresh = async () => {
    if (!address) return;
    setLoading(true);
    setError("");
    try {
      const result = await fetchHolderCredentials(address);
      setCredentials(result.credentials.slice(0, MAX_VISIBLE_CREDENTIALS));
      setTruncated(result.truncated || result.credentials.length > MAX_VISIBLE_CREDENTIALS);
      setFetchedAt(result.fetched_at);
      setExpanded({});
      onLoaded?.(result.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCredentials([]);
      setFetchedAt("");
      setExpanded({});
      onLoaded?.(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [address]);

  const addressLabel = useMemo(() => (address ? truncateId(address) : "n/a"), [address]);

  const typeOptions = useMemo(() => {
    const options = new Set<string>();
    for (const credential of credentials) {
      const typ = credential.verdict.credential_metadata?.credential_type?.trim();
      if (typ) {
        options.add(typ);
      }
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [credentials]);

  const filteredCredentials = useMemo(() => {
    const toTimestamp = (value?: string | null) => {
      if (!value) return 0;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const dayStart = (value: string) => (value ? new Date(`${value}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY);
    const dayEnd = (value: string) => (value ? new Date(`${value}T23:59:59`).getTime() : Number.POSITIVE_INFINITY);

    const from = dayStart(dateFrom);
    const to = dayEnd(dateTo);

    const filtered = credentials.filter((credential) => {
      const metadata = credential.verdict.credential_metadata;
      const issuedAt = metadata?.issued_at;
      const issuedTs = toTimestamp(issuedAt);
      const credentialType = metadata?.credential_type ?? "Credential";

      const hasPublic = Object.keys(metadata?.public_fields ?? {}).length > 0;
      const hasPrivate = Object.keys(metadata?.hashed_fields ?? {}).length > 0;

      if (typeFilter !== "all" && credentialType !== typeFilter) {
        return false;
      }

      if (validityFilter === "valid" && credential.verdict.status !== "valid") {
        return false;
      }
      if (validityFilter === "invalid" && credential.verdict.status === "valid") {
        return false;
      }

      if (visibilityFilter === "public" && !hasPublic) {
        return false;
      }
      if (visibilityFilter === "private" && !hasPrivate) {
        return false;
      }

      if (dateFrom || dateTo) {
        if (!issuedAt) {
          return false;
        }
        if (issuedTs < from || issuedTs > to) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((a, b) => {
      const metadataA = a.verdict.credential_metadata;
      const metadataB = b.verdict.credential_metadata;

      const issuedA = toTimestamp(metadataA?.issued_at);
      const issuedB = toTimestamp(metadataB?.issued_at);
      const fetchedA = toTimestamp(a.fetched_at);
      const fetchedB = toTimestamp(b.fetched_at);
      const typeA = (metadataA?.credential_type ?? "Credential").toLowerCase();
      const typeB = (metadataB?.credential_type ?? "Credential").toLowerCase();
      const statusA = a.verdict.status.toLowerCase();
      const statusB = b.verdict.status.toLowerCase();

      switch (sortBy) {
        case "issued_asc":
          return issuedA - issuedB;
        case "issued_desc":
          return issuedB - issuedA;
        case "type_asc":
          return typeA.localeCompare(typeB);
        case "type_desc":
          return typeB.localeCompare(typeA);
        case "status_asc":
          return statusA.localeCompare(statusB);
        case "status_desc":
          return statusB.localeCompare(statusA);
        case "fetched_asc":
          return fetchedA - fetchedB;
        case "fetched_desc":
          return fetchedB - fetchedA;
        default:
          return 0;
      }
    });

    return filtered;
  }, [credentials, dateFrom, dateTo, sortBy, typeFilter, validityFilter, visibilityFilter]);

  const expandAll = () => {
    setExpanded(Object.fromEntries(filteredCredentials.map((credential) => [credential.id, true])));
  };

  const collapseAll = () => {
    setExpanded({});
  };

  const buildPresentationMessage = (credentialId: string, holderAddress: string, timestamp: string, nonce: string) =>
    [
      "Passapawn Credential Presentation",
      `credential_id: ${credentialId}`,
      `holder: ${holderAddress}`,
      `timestamp: ${timestamp}`,
      `nonce: ${nonce}`,
    ].join("\n");

  const toBase64 = (value: string | Uint8Array) => {
    if (typeof value === "string") return value;
    let binary = "";
    value.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  };

  const presentCredential = (credential: HolderCredential) => {
    if (!account?.address) {
      setPresentationError("Signing failed — wallet rejected the request.");
      return;
    }

    setPresentationError("");
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const message = buildPresentationMessage(credential.id, account.address, timestamp, nonce);

    signPersonalMessage(
      { message: new TextEncoder().encode(message) },
      {
        onSuccess: async ({ bytes, signature }) => {
          const tokenPayload = {
            credential_id: credential.id,
            holder: account.address,
            timestamp,
            nonce,
            signature: typeof signature === "string" ? signature : toBase64(signature),
            message_bytes: toBase64(bytes),
          };
          const token = btoa(JSON.stringify(tokenPayload));
          const url = `${window.location.origin}?present=${encodeURIComponent(token)}`;
          await navigator.clipboard.writeText(url);
          setCopiedId(`present:${credential.id}`);
          setTimeout(() => setCopiedId(""), 3000);
        },
        onError: () => {
          setPresentationError("Signing failed — wallet rejected the request.");
        },
      },
    );
  };

  if (!address) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
        <h3 className="text-xl font-semibold text-white">My Credentials</h3>
        <p className="mt-2 text-sm text-gray-400">Connect your wallet to load your credential dashboard.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-white">My Credentials</h3>
            <InfoHint text="This view loads notarization objects owned by your wallet and enriches them with live trust verdicts." />
          </div>
          <p className="text-xs text-gray-400">Wallet: {addressLabel}</p>
        </div>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {loading && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg border border-gray-700 bg-gray-800/40" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="mt-4 rounded-lg border border-red-700 bg-red-900/30 p-4 text-sm text-red-200">
          <p>⚠️ Could not load credentials — check your connection.</p>
          <button className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && credentials.length === 0 && (
        <div className="mt-6 rounded-lg border border-gray-700 p-6 text-center">
          <p className="text-3xl">📭</p>
          <p className="mt-2 font-semibold text-white">No credentials found</p>
          <p className="mt-1 text-sm text-gray-400">Ask your institution to issue a credential to your address.</p>
          <p className="mt-1 text-xs font-mono text-gray-500">Address queried: {addressLabel}</p>
        </div>
      )}

      {!loading && !error && credentials.length > 0 && (
        <>
          {truncated && <p className="mt-3 text-xs text-yellow-300">Showing first {MAX_VISIBLE_CREDENTIALS} credentials.</p>}
          {presentationError && <p className="mt-3 text-xs text-red-300">{presentationError}</p>}
          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <select
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100"
                value={validityFilter}
                onChange={(e) => setValidityFilter(e.target.value as ValidityFilter)}
              >
                <option value="all">All validity</option>
                <option value="valid">Valid only</option>
                <option value="invalid">Invalid only</option>
              </select>
              <select
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100"
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
              >
                <option value="all">All visibility</option>
                <option value="public">Has public fields</option>
                <option value="private">Has private fields</option>
              </select>
              <select
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
              >
                <option value="issued_desc">Issued date: newest</option>
                <option value="issued_asc">Issued date: oldest</option>
                <option value="type_asc">Type: A to Z</option>
                <option value="type_desc">Type: Z to A</option>
                <option value="status_asc">Status: A to Z</option>
                <option value="status_desc">Status: Z to A</option>
                <option value="fetched_desc">Fetched: newest</option>
                <option value="fetched_asc">Fetched: oldest</option>
              </select>
              <input
                type="date"
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Issued from"
              />
              <input
                type="date"
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Issued to"
              />
              <div className="flex items-center gap-2">
                <button
                  className={`rounded border px-3 py-2 text-xs ${viewMode === "grid" ? "border-indigo-500 text-indigo-300" : "border-gray-700 text-gray-300"}`}
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </button>
                <button
                  className={`rounded border px-3 py-2 text-xs ${viewMode === "list" ? "border-indigo-500 text-indigo-300" : "border-gray-700 text-gray-300"}`}
                  onClick={() => setViewMode("list")}
                >
                  List
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-200" onClick={expandAll}>
                  Expand all
                </button>
                <button className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-200" onClick={collapseAll}>
                  Collapse all
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-400">
                Showing {filteredCredentials.length} of {credentials.length} loaded credentials
              </p>
              {fetchedAt && (
                <p className="text-xs text-gray-500">Last refresh: {new Date(fetchedAt).toLocaleString()}</p>
              )}
            </div>
          </div>
          <div className={`mt-4 ${viewMode === "grid" ? "grid gap-4 md:grid-cols-2" : "space-y-3"}`}>
            {filteredCredentials.map((credential) => (
              <div key={credential.id} className={`rounded-xl border border-gray-800 bg-gray-900 p-4 ${viewMode === "list" ? "flex flex-col gap-2" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-gray-300">{truncateId(credential.id)}</span>
                  <StatusBadge status={credential.verdict.status} />
                </div>
                <p className="mt-2 text-xs text-gray-400">Domain: {credential.domain_id ? truncateId(credential.domain_id) : "n/a"}</p>
                <p className="mt-2 text-xs italic text-gray-400">Preview: {credential.asset_meta_preview || "(empty)"}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Type: {credential.verdict.credential_metadata?.credential_type ?? "Credential"}
                  {credential.verdict.credential_metadata?.issued_at
                    ? ` • Issued: ${new Date(credential.verdict.credential_metadata.issued_at).toLocaleDateString()}`
                    : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-white"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}?verify=${encodeURIComponent(credential.id)}`);
                      setCopiedId(`share:${credential.id}`);
                      setTimeout(() => setCopiedId(""), 2000);
                    }}
                  >
                    {copiedId === `share:${credential.id}` ? "Copied! ✓" : "Share 🔗"}
                  </button>
                  <button
                    className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-white"
                    onClick={() => presentCredential(credential)}
                  >
                    {copiedId === `present:${credential.id}` ? "Copied presentation! ✓" : "Present 🔏"}
                  </button>
                  <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => onNavigateToVerify(credential.id)}>
                    Verify →
                  </button>
                  <button
                    className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-white"
                    onClick={async () => {
                      await navigator.clipboard.writeText(credential.id);
                      setCopiedId(`id:${credential.id}`);
                      setTimeout(() => setCopiedId(""), 2000);
                    }}
                  >
                    {copiedId === `id:${credential.id}` ? "Copied!" : "Copy ID"}
                  </button>
                  <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => setExpanded((prev) => ({ ...prev, [credential.id]: !prev[credential.id] }))}>
                    {expanded[credential.id] ? "Hide details" : "Expand"}
                  </button>
                </div>
                {expanded[credential.id] && <CredentialMetadataCard metadata={credential.verdict.credential_metadata} className="mt-3" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
