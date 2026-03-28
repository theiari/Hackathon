import { useEffect, useMemo, useState } from "react";
import { fetchExplorer, type ExplorerCredentialItem } from "../notarizationApi";
import { StatusBadge } from "./StatusBadge";

const TAG_CATEGORIES = [
  { label: "All", value: "" },
  { label: "🎓 Education", value: "education" },
  { label: "💼 Work", value: "work" },
  { label: "🌍 Language", value: "language" },
  { label: "🏥 Health", value: "health" },
  { label: "🎖 Certificate", value: "certificate" },
  { label: "🐾 Pet / Vet", value: "veterinary" },
  { label: "🏛 Government", value: "government" },
] as const;

function truncateId(value?: string | null) {
  if (!value) return "n/a";
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function ExplorerCard({
  item,
  onVerify,
}: {
  item: ExplorerCredentialItem;
  onVerify: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-900 p-4 ${item.revoked ? "border-l-4 border-l-red-700" : ""} ${item.status === "expired" ? "opacity-60 grayscale" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-100">{item.credential_type || "Credential"}</p>
        <StatusBadge status={item.status} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {item.tags.length > 0 ? (
          item.tags.map((tag) => (
            <span key={`${item.record_id}-${tag}`} className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-gray-600">no tags</span>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">Issued: {formatDate(item.issued_at)} | Expires: {item.expiry_iso ? formatDate(item.expiry_iso) : "Never"}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
        <span>Domain: {truncateId(item.domain_id)}</span>
        {item.domain_id && (
          <button
            className="rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300"
            onClick={async () => {
              await navigator.clipboard.writeText(item.domain_id ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      <div className="mt-3">
        <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white" onClick={onVerify}>
          View & Verify →
        </button>
      </div>
    </div>
  );
}

export function CredentialExplorer({ onNavigateToVerify }: { onNavigateToVerify: (id: string) => void }) {
  const [activeTag, setActiveTag] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [debouncedDomainFilter, setDebouncedDomainFilter] = useState("");
  const [debouncedTypeFilter, setDebouncedTypeFilter] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [results, setResults] = useState<ExplorerCredentialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedDomainFilter(domainFilter), 400);
    return () => clearTimeout(id);
  }, [domainFilter]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedTypeFilter(typeFilter), 400);
    return () => clearTimeout(id);
  }, [typeFilter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetchExplorer({
          tag: activeTag || undefined,
          domain_id: debouncedDomainFilter.trim() || undefined,
          credential_type: debouncedTypeFilter.trim() || undefined,
          limit: 20,
        });
        if (cancelled) return;
        setResults(response.items);
        setTruncated(response.truncated);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setResults([]);
        setTruncated(false);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTag, debouncedDomainFilter, debouncedTypeFilter]);

  const subtitle = useMemo(
    () => "Browse all on-chain credentials. All data is read directly from the IOTA devnet.",
    [],
  );

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <h3 className="text-xl font-semibold text-white">🔍 Credential Explorer</h3>
      <p className="mt-1 text-sm text-gray-400">{subtitle}</p>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {TAG_CATEGORIES.map((tag) => (
          <button
            key={tag.value || "all"}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${activeTag === tag.value ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-300"}`}
            onClick={() => setActiveTag(tag.value)}
          >
            {tag.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <button className="text-xs text-gray-400 underline" onClick={() => setShowAdvanced((v) => !v)}>
          Advanced filters ▾
        </button>
        {showAdvanced && (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <input
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              placeholder="0x... paste domain ID"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
            />
            <input
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              placeholder="B2 Language, Vaccination..."
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-700 bg-red-900/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && <p className="mt-4 text-sm text-gray-400">Loading explorer data...</p>}

      {!loading && !error && results.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">No credentials found matching these filters.</p>
      )}

      {!loading && !error && results.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {results.map((item) => (
              <ExplorerCard key={item.record_id} item={item} onVerify={() => onNavigateToVerify(item.record_id)} />
            ))}
          </div>
          {truncated && (
            <p className="mt-3 text-xs text-gray-500">Showing first 20 results. Refine filters to narrow down.</p>
          )}
        </>
      )}
    </div>
  );
}
