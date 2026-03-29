import { useCurrentAccount, useSignPersonalMessage } from "@iota/dapp-kit";
import { useEffect, useMemo, useState } from "react";
import { Wallet, RefreshCw, Share2, FileSignature, ExternalLink, Copy, ChevronDown, ChevronRight, LayoutGrid, List, QrCode } from "lucide-react";
import { fetchHolderCredentials, type HolderCredential } from "../notarizationApi";
import { CredentialMetadataCard } from "./CredentialMetadataCard";
import { StatusBadge } from "./StatusBadge";
import { QrModal } from "./QrModal";

const MAX_VISIBLE_CREDENTIALS = 10;

type ViewMode = "grid" | "list";
type VisibilityFilter = "all" | "public" | "private";
type ValidityFilter = "all" | "valid" | "invalid";
type SortBy = "issued_desc" | "issued_asc" | "type_asc" | "type_desc" | "status_asc" | "status_desc" | "fetched_desc" | "fetched_asc";

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
  const [presentationUrls, setPresentationUrls] = useState<Record<string, string>>({});
  const [fetchedAt, setFetchedAt] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [validityFilter, setValidityFilter] = useState<ValidityFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("issued_desc");
  const [showFilters, setShowFilters] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

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

  useEffect(() => { void refresh(); }, [address]);

  const addressLabel = useMemo(() => (address ? truncateId(address) : "n/a"), [address]);

  const typeOptions = useMemo(() => {
    const options = new Set<string>();
    for (const cred of credentials) {
      const typ = cred.verdict.credential_metadata?.credential_type?.trim();
      if (typ) options.add(typ);
    }
    return Array.from(options).sort();
  }, [credentials]);

  const filteredCredentials = useMemo(() => {
    const toTs = (v?: string | null) => { if (!v) return 0; const p = Date.parse(v); return Number.isFinite(p) ? p : 0; };
    const dayStart = (v: string) => (v ? new Date(`${v}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY);
    const dayEnd = (v: string) => (v ? new Date(`${v}T23:59:59`).getTime() : Number.POSITIVE_INFINITY);
    const from = dayStart(dateFrom);
    const to = dayEnd(dateTo);

    const filtered = credentials.filter((c) => {
      const meta = c.verdict.credential_metadata;
      const issuedTs = toTs(meta?.issued_at);
      const credType = meta?.credential_type ?? "Credential";
      const hasPub = Object.keys(meta?.public_fields ?? {}).length > 0;
      const hasPriv = Object.keys(meta?.hashed_fields ?? {}).length > 0;

      if (typeFilter !== "all" && credType !== typeFilter) return false;
      if (validityFilter === "valid" && c.verdict.status !== "valid") return false;
      if (validityFilter === "invalid" && c.verdict.status === "valid") return false;
      if (visibilityFilter === "public" && !hasPub) return false;
      if (visibilityFilter === "private" && !hasPriv) return false;
      if ((dateFrom || dateTo) && (!meta?.issued_at || issuedTs < from || issuedTs > to)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const mA = a.verdict.credential_metadata;
      const mB = b.verdict.credential_metadata;
      const iA = toTs(mA?.issued_at), iB = toTs(mB?.issued_at);
      const fA = toTs(a.fetched_at), fB = toTs(b.fetched_at);
      const tA = (mA?.credential_type ?? "").toLowerCase(), tB = (mB?.credential_type ?? "").toLowerCase();
      const sA = a.verdict.status.toLowerCase(), sB = b.verdict.status.toLowerCase();

      switch (sortBy) {
        case "issued_asc": return iA - iB;
        case "issued_desc": return iB - iA;
        case "type_asc": return tA.localeCompare(tB);
        case "type_desc": return tB.localeCompare(tA);
        case "status_asc": return sA.localeCompare(sB);
        case "status_desc": return sB.localeCompare(sA);
        case "fetched_asc": return fA - fB;
        case "fetched_desc": return fB - fA;
        default: return 0;
      }
    });

    return filtered;
  }, [credentials, dateFrom, dateTo, sortBy, typeFilter, validityFilter, visibilityFilter]);

  const buildPresentationMessage = (credId: string, holder: string, ts: string, nonce: string) =>
    ["Credora Certificate Presentation", `credential_id: ${credId}`, `holder: ${holder}`, `timestamp: ${ts}`, `nonce: ${nonce}`].join("\n");

  const toBase64 = (v: string | Uint8Array) => {
    if (typeof v === "string") return v;
    let bin = "";
    v.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };

  const presentCredential = (credential: HolderCredential) => {
    if (!account?.address) { setPresentationError("Connect your wallet to sign certificate proofs."); return; }
    setPresentationError("");
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const message = buildPresentationMessage(credential.id, account.address, timestamp, nonce);

    try {
      signPersonalMessage(
        { message: new TextEncoder().encode(message) },
        {
          onSuccess: ({ bytes, signature }) => {
            const token = btoa(JSON.stringify({
              credential_id: credential.id,
              holder: account.address,
              timestamp,
              nonce,
              signature: typeof signature === "string" ? signature : toBase64(signature),
              message_bytes: toBase64(bytes),
            }));
            const url = `${window.location.origin}?present=${encodeURIComponent(token)}`;
            // Store URL in state — clipboard.writeText here would fail because the
            // wallet popup stole document focus. The user copies via the inline button.
            setPresentationUrls((prev) => ({ ...prev, [credential.id]: url }));
          },
          onError: (err: Error) => {
            const msg = err?.message ?? String(err);
            if (/notAllowed|rejected|denied|cancel/i.test(msg)) {
              setPresentationError("Wallet declined the signature. You can still share a verification link instead.");
            } else {
              setPresentationError(`Proof signing failed: ${msg}`);
            }
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/notAllowed|rejected|denied|cancel/i.test(msg)) {
        setPresentationError("Wallet declined the signature. You can still share a verification link instead.");
      } else {
        setPresentationError(`Proof signing failed: ${msg}`);
      }
    }
  };

  if (!address) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-700/50 bg-gray-900/60 px-8 py-12 text-center">
        <Wallet className="h-10 w-10 text-gray-500" />
        <p className="text-lg font-medium text-gray-300">My Certificates</p>
        <p className="text-sm text-gray-500">Connect your wallet to see certificates issued to you.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/40 px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Wallet className="h-4 w-4 text-indigo-400" />
            My Certificates
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-500">Copy a verification link for employers or generate a holder-signed proof.</p>
          <p className="mt-0.5 text-[11px] text-gray-500">Wallet: {addressLabel}</p>
        </div>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-gray-700/50 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-800/60 hover:text-white"
          onClick={() => void refresh()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="px-5 py-5">
        {/* Loading skeletons */}
        {loading && !credentials.length && (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-800/30 bg-gray-800/20" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-xl border border-red-800/40 bg-red-900/10 p-4">
            <p className="text-sm text-red-300">Could not load credentials. Check your connection.</p>
            <button className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && credentials.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Wallet className="h-10 w-10 text-gray-600" />
            <p className="font-medium text-gray-300">No certificates found</p>
            <p className="text-sm text-gray-500">Ask your university or training provider to issue a certificate to your address.</p>
          </div>
        )}

        {/* Credentials list */}
        {!loading && !error && credentials.length > 0 && (
          <div className="space-y-4">
            {truncated && <p className="text-xs text-yellow-400/80">Showing first {MAX_VISIBLE_CREDENTIALS} credentials.</p>}
            {presentationError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2">
                <FileSignature className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-300">{presentationError}</p>
              </div>
            )}

            {/* Filters */}
            <div>
              <button
                className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300"
                onClick={() => setShowFilters((v) => !v)}
              >
                {showFilters ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Filters & sorting
              </button>
              {showFilters && (
                <div className="mt-2 grid gap-2 rounded-xl border border-gray-800/40 bg-gray-800/10 p-3 sm:grid-cols-2 md:grid-cols-3">
                  <select className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-100" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="all">All types</option>
                    {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-100" value={validityFilter} onChange={(e) => setValidityFilter(e.target.value as ValidityFilter)}>
                    <option value="all">All validity</option>
                    <option value="valid">Valid only</option>
                    <option value="invalid">Invalid only</option>
                  </select>
                  <select className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-100" value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}>
                    <option value="all">All visibility</option>
                    <option value="public">Has public fields</option>
                    <option value="private">Has private fields</option>
                  </select>
                  <select className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-100" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                    <option value="issued_desc">Newest first</option>
                    <option value="issued_asc">Oldest first</option>
                    <option value="type_asc">Type A-Z</option>
                    <option value="type_desc">Type Z-A</option>
                    <option value="status_asc">Status A-Z</option>
                    <option value="status_desc">Status Z-A</option>
                  </select>
                  <input type="date" className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-100" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
                  <input type="date" className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-100" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
                </div>
              )}
            </div>

            {/* View mode + count */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-gray-500">
                {filteredCredentials.length} of {credentials.length} credentials
                {fetchedAt && <span className="ml-2">· Refreshed: {new Date(fetchedAt).toLocaleTimeString()}</span>}
              </p>
              <div className="flex gap-1">
                <button className={`rounded-lg p-1.5 ${viewMode === "grid" ? "bg-indigo-600/20 text-indigo-300" : "text-gray-500"}`} onClick={() => setViewMode("grid")} title="Grid view">
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button className={`rounded-lg p-1.5 ${viewMode === "list" ? "bg-indigo-600/20 text-indigo-300" : "text-gray-500"}`} onClick={() => setViewMode("list")} title="List view">
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Credential cards */}
            <div className={viewMode === "grid" ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
              {filteredCredentials.map((credential) => {
                const meta = credential.verdict.credential_metadata;
                const credType = meta?.credential_type ?? "Credential";
                const issuedAt = meta?.issued_at;
                const isExpanded = expanded[credential.id];

                return (
                  <div key={credential.id} className="rounded-xl border border-gray-800/40 bg-gray-800/10 p-4 transition-colors hover:border-gray-700/60">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-100">{credType}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-gray-500">{truncateId(credential.id)}</p>
                      </div>
                      <StatusBadge status={credential.verdict.status} />
                    </div>

                    {credential.domain_id && (
                      <p className="mt-1.5 text-[11px] text-gray-500">Domain: {truncateId(credential.domain_id)}</p>
                    )}
                    {issuedAt && (
                      <p className="text-[11px] text-gray-500">Issued: {new Date(issuedAt).toLocaleDateString()}</p>
                    )}
                    {credential.asset_meta_preview && (
                      <p className="mt-1 text-xs italic text-gray-400">{credential.asset_meta_preview}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button
                        className="flex items-center gap-1 rounded-lg border border-gray-700/50 px-2.5 py-1.5 text-[11px] text-gray-300 transition-colors hover:text-white"
                        onClick={async () => {
                          await navigator.clipboard.writeText(`${window.location.origin}?verify=${encodeURIComponent(credential.id)}`);
                          setCopiedId(`share:${credential.id}`);
                          setTimeout(() => setCopiedId(""), 2000);
                        }}
                      >
                        <Share2 className="h-3 w-3" />
                        {copiedId === `share:${credential.id}` ? "Copied!" : "Copy verification link"}
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg border border-gray-700/50 px-2.5 py-1.5 text-[11px] text-gray-300 transition-colors hover:text-white"
                        onClick={() => setQrUrl(`${window.location.origin}?verify=${encodeURIComponent(credential.id)}`)}
                      >
                        <QrCode className="h-3 w-3" />
                        QR
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg border border-gray-700/50 px-2.5 py-1.5 text-[11px] text-gray-300 transition-colors hover:text-white"
                        onClick={() => { setPresentationUrls((prev) => { const n = { ...prev }; delete n[credential.id]; return n; }); presentCredential(credential); }}
                      >
                        <FileSignature className="h-3 w-3" />
                        Create signed proof
                      </button>
                      {presentationUrls[credential.id] && (
                        <button
                          className="flex items-center gap-1 rounded-lg border border-indigo-600/50 bg-indigo-950/30 px-2.5 py-1.5 text-[11px] text-indigo-300 transition-colors hover:bg-indigo-600/20"
                          onClick={async () => {
                            await navigator.clipboard.writeText(presentationUrls[credential.id]);
                            setCopiedId(`present:${credential.id}`);
                            setTimeout(() => setCopiedId(""), 3000);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          {copiedId === `present:${credential.id}` ? "Copied!" : "Copy signed proof link"}
                        </button>
                      )}
                      <button
                        className="flex items-center gap-1 rounded-lg bg-indigo-600/20 px-2.5 py-1.5 text-[11px] text-indigo-300 transition-colors hover:bg-indigo-600/30"
                        onClick={() => onNavigateToVerify(credential.id)}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Verify
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg border border-gray-700/50 px-2.5 py-1.5 text-[11px] text-gray-300 transition-colors hover:text-white"
                        onClick={async () => {
                          await navigator.clipboard.writeText(credential.id);
                          setCopiedId(`id:${credential.id}`);
                          setTimeout(() => setCopiedId(""), 2000);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                        {copiedId === `id:${credential.id}` ? "Copied!" : "Copy ID"}
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg border border-gray-700/50 px-2.5 py-1.5 text-[11px] text-gray-300 transition-colors hover:text-white"
                        onClick={() => setExpanded((prev) => ({ ...prev, [credential.id]: !prev[credential.id] }))}
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        Details
                      </button>
                    </div>

                    {isExpanded && (
                      <CredentialMetadataCard metadata={meta} className="mt-3" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {qrUrl && <QrModal url={qrUrl} title="Certificate Verification Link" onClose={() => setQrUrl("")} />}
    </div>
  );
}
