import { useEffect, useRef, useState } from "react";
import { verifyOnChain, verifyPublic, type VerifyResponse } from "../notarizationApi";
import { getFlowValue } from "../flowState";
import { CredentialMetadataCard } from "./CredentialMetadataCard";
import { FieldHelp } from "./FieldHelp";
import { InfoHint } from "./InfoHint";
import { StatusBadge } from "./StatusBadge";
import type { VerifyTimelineEntry } from "./VerifierHistory";

export function VerifierPanel({
  prefillVerifyId,
  onPrefillConsumed,
  autoTrigger,
  onVerified,
  minimal,
}: {
  prefillVerifyId: string;
  onPrefillConsumed: () => void;
  autoTrigger: number;
  onVerified: (entry: VerifyTimelineEntry) => void;
  minimal?: boolean;
}) {
  const [id, setId] = useState("");
  const [data, setData] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const verdictRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!prefillVerifyId) return;
    setId(prefillVerifyId);
    onPrefillConsumed();
  }, [prefillVerifyId, onPrefillConsumed]);

  useEffect(() => {
    if (!id || autoTrigger <= 0) return;
    const timer = setTimeout(() => {
      void verifyNow();
    }, 300);
    return () => clearTimeout(timer);
  }, [autoTrigger]);

  useEffect(() => {
    if (!result) return;
    verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const verifyNow = async () => {
    if (!id.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = data.trim() ? await verifyOnChain(id.trim(), data.trim()) : await verifyPublic(id.trim());
      setResult(response);
      onVerified({ capturedAt: new Date().toISOString(), response });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!id.trim()) return;
    await navigator.clipboard.writeText(`${window.location.origin}?verify=${encodeURIComponent(id.trim())}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <div className="flex items-center gap-2">
        <h3 className="text-xl font-semibold text-white">Verify Credential</h3>
        <InfoHint text="ID-only verify uses the public endpoint and evaluates trust policy without requiring wallet or API key." />
      </div>
      <p className="mt-1 text-sm text-gray-400">Verify by ID only (public) or include payload for strict match checks.</p>
      <div className="mt-2 rounded-lg border border-gray-700 bg-gray-950/60 p-3 text-xs text-gray-300">Tip: paste only the notarization object ID for the shareable-link experience.</div>
      <div className="mt-4 grid gap-3">
        <label className="text-xs text-gray-300">Notarization ID <FieldHelp text="The on-chain ID of the notarization object (starts with 0x). Get it from the Issue tab result or the holder credential list." /></label>
        <div className="flex gap-2">
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Notarization object ID (0x...)" value={id} onChange={(e) => setId(e.target.value)} />
          <button disabled={!getFlowValue("lastNotarizationId")} title={getFlowValue("lastNotarizationId") ? "" : "No recent value"} className="rounded border border-gray-600 px-2 text-xs text-indigo-300 disabled:opacity-50" onClick={() => setId(getFlowValue("lastNotarizationId"))}>↙ Use last</button>
        </div>
        <input className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Optional payload data for strict verify" value={data} onChange={(e) => setData(e.target.value)} />
        <div className="flex gap-2">
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60" disabled={loading || !id.trim()} onClick={() => void verifyNow()}>
            {loading ? "Verifying..." : "Verify now"}
          </button>
          {result && (
            <button className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => void copyLink()}>
              {copied ? "Copied! ✓" : "Copy verify link 🔗"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</p>}

      {result && (
        <div ref={verdictRef} className="mt-4 rounded-lg border border-gray-700 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge status={result.status} />
            <p className="text-xs text-gray-400">Checked: {result.checked_at}</p>
          </div>
          <p className="mt-2 text-gray-100">{result.summary}</p>
          <CredentialMetadataCard metadata={result.credential_metadata} className="mt-3" />
          <p className="mt-1 text-xs text-gray-400">ID: {result.id} • Request: {result.request_id} • Latency: {result.latency_ms}ms • Cache: {result.cache_hit ? "hit" : "miss"}</p>
          {result.reasons.length > 0 && <p className="mt-1 text-xs text-gray-400">Reasons: {result.reasons.join(", ")}</p>}
        </div>
      )}

      {minimal && <p className="mt-4 text-sm text-gray-300">Connect your wallet to issue credentials or view your own.</p>}
    </div>
  );
}
