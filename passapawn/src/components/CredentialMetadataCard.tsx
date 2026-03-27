import { useMemo, useState } from "react";
import type { VerifyResponse } from "../notarizationApi";

function formatLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

async function hashField(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return (
    "sha256:" +
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function CredentialMetadataCard({
  metadata,
  className,
}: {
  metadata: VerifyResponse["credential_metadata"];
  className?: string;
}) {
  const [checks, setChecks] = useState<Record<string, { open: boolean; value: string; result?: boolean }>>({});

  const expiryInfo = useMemo(() => {
    if (!metadata?.expiry_iso) return { label: "No expiry", cls: "text-gray-400" };
    const ms = new Date(metadata.expiry_iso).getTime() - Date.now();
    if (ms < 0) return { label: `Expires: ${new Date(metadata.expiry_iso).toLocaleDateString()}`, cls: "text-red-300" };
    if (ms < 30 * 24 * 3600 * 1000) {
      return { label: `Expires: ${new Date(metadata.expiry_iso).toLocaleDateString()}`, cls: "text-yellow-300" };
    }
    return { label: `Expires: ${new Date(metadata.expiry_iso).toLocaleDateString()}`, cls: "text-gray-300" };
  }, [metadata]);

  if (!metadata) {
    return <div className={`rounded-lg border border-gray-700 p-3 text-xs text-gray-400 ${className ?? ""}`}>No structured metadata</div>;
  }

  const publicFields = metadata.public_fields ?? {};
  const hashedFields = metadata.hashed_fields ?? {};

  return (
    <div className={`rounded-lg border border-gray-700 bg-gray-950/40 p-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-lg font-semibold text-white">{metadata.credential_type || "Credential"}</h4>
        <span className={`text-xs ${expiryInfo.cls}`}>{expiryInfo.label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>Issued: {metadata.issued_at ? new Date(metadata.issued_at).toLocaleDateString() : "Unknown"}</span>
        <span className={`rounded-full border px-2 py-0.5 ${metadata.transferable ? "border-blue-600 text-blue-300" : "border-gray-600 text-gray-300"}`}>
          {metadata.transferable ? "Transferable ♻" : "Non-transferable 🔒"}
        </span>
      </div>

      {Object.keys(publicFields).length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-100">📋 Credential Details</p>
          <div className="mt-2 space-y-1">
            {Object.entries(publicFields).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded border border-gray-800 px-2 py-1 text-sm">
                <span className="text-gray-400">{formatLabel(key)}</span>
                <span className="font-semibold text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(hashedFields).length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-100">🔒 Private Fields</p>
          <div className="mt-2 space-y-2">
            {Object.entries(hashedFields).map(([key, hash]) => {
              const row = checks[key] ?? { open: false, value: "" };
              return (
                <div key={key} className="rounded border border-gray-800 p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">{formatLabel(key)}</span>
                    <span className="text-red-300">● ● ● ● ●</span>
                  </div>
                  <button
                    className="mt-1 text-xs text-indigo-300"
                    onClick={() => setChecks((prev) => ({ ...prev, [key]: { ...row, open: !row.open } }))}
                  >
                    Verify
                  </button>
                  {row.open && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={row.value}
                        onChange={(e) => setChecks((prev) => ({ ...prev, [key]: { ...row, value: e.target.value } }))}
                        className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100"
                        placeholder="Enter value to verify..."
                      />
                      <button
                        className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                        onClick={async () => {
                          const computed = await hashField(row.value);
                          setChecks((prev) => ({ ...prev, [key]: { ...row, result: computed === hash } }));
                        }}
                      >
                        Check
                      </button>
                    </div>
                  )}
                  {row.result === true && <p className="mt-1 text-xs text-green-300">✓ Verified</p>}
                  {row.result === false && <p className="mt-1 text-xs text-red-300">✗ Does not match</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
