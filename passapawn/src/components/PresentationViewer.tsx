import { useEffect, useMemo, useState } from "react";
import { verifyPresentation, type PresentationResponse } from "../notarizationApi";
import { CredentialMetadataCard } from "./CredentialMetadataCard";
import { StatusBadge } from "./StatusBadge";

function truncateAddress(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function PresentationViewer({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<PresentationResponse | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const out = await verifyPresentation(token);
        if (active) {
          setPayload(out);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
          setPayload(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const signedAt = useMemo(() => {
    if (!payload?.timestamp) return "n/a";
    const date = new Date(payload.timestamp);
    return Number.isNaN(date.getTime()) ? payload.timestamp : date.toLocaleString();
  }, [payload?.timestamp]);

  if (loading) {
    return <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-300">Loading presentation...</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-700 bg-red-900/30 p-6 text-sm text-red-200">
        <p>Failed to verify presentation: {error}</p>
        <button className="mt-3 rounded-lg border border-red-500 px-3 py-2 text-xs" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    );
  }

  if (!payload) {
    return null;
  }

  const bannerClass = payload.presentation_valid
    ? "border-green-700 bg-green-900/30 text-green-200"
    : "border-red-700 bg-red-900/30 text-red-200";

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <div className={`rounded-lg border p-4 ${bannerClass}`}>
        <p className="text-sm font-semibold">🔏 Holder-Verified Presentation</p>
        <p className="mt-1 text-xs">
          {payload.presentation_valid
            ? "✓ The holder cryptographically attests ownership of this credential."
            : `✗ Presentation invalid — ${payload.reason ?? "unknown_reason"}`}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-300">
        <span>Holder: {truncateAddress(payload.holder_address)}</span>
        <span>Signed: {signedAt}</span>
      </div>

      <CredentialMetadataCard metadata={payload.verdict.credential_metadata} className="mt-4" />

      <div className="mt-3 flex items-center justify-between gap-3">
        <StatusBadge status={payload.verdict.status} />
        <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-gray-200" onClick={onDismiss}>
          Close presentation
        </button>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        This presentation was signed by the holder's IOTA wallet and cannot be forged without the wallet key.
      </p>
    </div>
  );
}
