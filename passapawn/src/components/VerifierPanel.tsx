import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Link2, ChevronDown, ChevronRight, ArrowDownLeft, QrCode } from "lucide-react";
import { verifyOnChain, verifyPublic, type VerifyResponse } from "../notarizationApi";
import { getFlowValue } from "../flowState";
import { CredentialMetadataCard } from "./CredentialMetadataCard";
import { StatusBadge } from "./StatusBadge";
import { QrModal } from "./QrModal";
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
  const [showPayload, setShowPayload] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const verdictRef = useRef<HTMLDivElement | null>(null);

  const hasLastNotarization = Boolean(getFlowValue("lastNotarizationId"));

  useEffect(() => {
    if (!prefillVerifyId) return;
    setId(prefillVerifyId);
    onPrefillConsumed();
  }, [prefillVerifyId, onPrefillConsumed]);

  useEffect(() => {
    if (!id || autoTrigger <= 0) return;
    const timer = setTimeout(() => { void verifyNow(); }, 300);
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
    <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60">
      <div className="border-b border-gray-800/40 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-indigo-400" />
          Verify a Credential
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Paste a notarization ID to verify its authenticity. No wallet required.
        </p>
      </div>

      <div className="space-y-4 px-5 py-5">
        {/* Notarization ID */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Notarization ID</label>
          <p className="mb-1.5 text-[11px] text-gray-500">
            The on-chain object ID (starts with 0x). Get it from the Issue tab or a shared link.
          </p>
          <div className="flex gap-2">
            <input
              className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              placeholder="0x..."
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
            {hasLastNotarization && (
              <button
                className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-700/50 px-2 text-[11px] text-indigo-400 transition-colors hover:bg-indigo-600/10"
                onClick={() => setId(getFlowValue("lastNotarizationId"))}
                title="Auto-fill from last issuance"
              >
                <ArrowDownLeft className="h-3 w-3" />
                Auto
              </button>
            )}
          </div>
        </div>

        {/* Optional payload (collapsed) */}
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300"
            onClick={() => setShowPayload((v) => !v)}
          >
            {showPayload ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Advanced: include payload for strict match
          </button>
          {showPayload && (
            <div className="mt-2">
              <input
                className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                placeholder="Payload data for strict verification"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Verify button */}
        <div className="flex gap-2">
          <button
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            disabled={loading || !id.trim()}
            onClick={() => void verifyNow()}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          {result && (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-gray-700/50 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:text-white"
              onClick={() => void copyLink()}
            >
              <Link2 className="h-4 w-4" />
              {copied ? "Copied!" : "Copy link"}
            </button>
          )}
          {result && (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-gray-700/50 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:text-white"
              onClick={() => setQrUrl(`${window.location.origin}?verify=${encodeURIComponent(id.trim())}`)}
            >
              <QrCode className="h-4 w-4" />
              QR
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800/40 bg-red-900/10 px-4 py-2.5 text-sm text-red-300">{error}</div>
        )}

        {/* Result */}
        {result && (
          <div ref={verdictRef} className="rounded-xl border border-gray-800/40 bg-gray-800/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={result.status} />
              <p className="text-[11px] text-gray-500">Checked: {result.checked_at}</p>
            </div>
            <p className="mt-2 text-sm text-gray-100">{result.summary}</p>
            <CredentialMetadataCard metadata={result.credential_metadata} className="mt-3" />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
              <span>ID: {result.id}</span>
              <span>Request: {result.request_id}</span>
              <span>Latency: {result.latency_ms}ms</span>
              <span>Cache: {result.cache_hit ? "hit" : "miss"}</span>
            </div>
            {result.reasons.length > 0 && (
              <p className="mt-1 text-[11px] text-gray-500">Reasons: {result.reasons.join(", ")}</p>
            )}
          </div>
        )}

        {minimal && (
          <p className="text-sm text-gray-500">Connect your wallet to issue credentials or view your own.</p>
        )}
      </div>
      {qrUrl && <QrModal url={qrUrl} title="Verification Link" onClose={() => setQrUrl("")} />}
    </div>
  );
}
