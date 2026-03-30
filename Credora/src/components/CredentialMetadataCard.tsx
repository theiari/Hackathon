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
    if (!metadata?.expiry_iso) return { label: "No expiry", cls: "text-obsidian-400" };
    const ms = new Date(metadata.expiry_iso).getTime() - Date.now();
    if (ms < 0) return { label: `Expires: ${new Date(metadata.expiry_iso).toLocaleDateString()}`, cls: "text-rose-300" };
    if (ms < 30 * 24 * 3600 * 1000) {
      return { label: `Expires: ${new Date(metadata.expiry_iso).toLocaleDateString()}`, cls: "text-gold-300" };
    }
    return { label: `Expires: ${new Date(metadata.expiry_iso).toLocaleDateString()}`, cls: "text-obsidian-300" };
  }, [metadata]);

  if (!metadata) {
    return <div className={`rounded-lg border border-obsidian-700 p-3 text-xs text-obsidian-400 ${className ?? ""}`}>No structured metadata</div>;
  }

  const publicFields = metadata.public_fields ?? {};
  const hashedFields = metadata.hashed_fields ?? {};

  return (
    <div className={`rounded-lg border border-obsidian-700 bg-obsidian-950/40 p-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-lg font-semibold text-obsidian-100">{metadata.credential_type || "Certificate"}</h4>
        <span className={`text-xs ${expiryInfo.cls}`}>{expiryInfo.label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-obsidian-400">
        <span>Issued: {metadata.issued_at ? new Date(metadata.issued_at).toLocaleDateString() : "Unknown"}</span>
        <span className={`rounded-full border px-2 py-0.5 ${metadata.transferable ? "border-gold-600 text-gold-300" : "border-obsidian-600 text-obsidian-300"}`}>
          {metadata.transferable ? "Transferable ♻" : "Non-transferable 🔒"}
        </span>
      </div>

      {Object.keys(publicFields).length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-obsidian-100">📋 Certificate Details</p>
          <div className="mt-2 space-y-1">
            {Object.entries(publicFields).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded border border-obsidian-700 px-2 py-1 text-sm">
                <span className="text-obsidian-400">{formatLabel(key)}</span>
                <span className="font-semibold text-obsidian-100">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(hashedFields).length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-obsidian-100">🔒 Private Fields</p>
          <div className="mt-2 space-y-2">
            {Object.entries(hashedFields).map(([key, hash]) => {
              const row = checks[key] ?? { open: false, value: "" };
              return (
                <div key={key} className="rounded border border-obsidian-700 p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-obsidian-400">{formatLabel(key)}</span>
                    <span className="text-rose-300">● ● ● ● ●</span>
                  </div>
                  <button
                    className="mt-1 text-xs text-gold-400"
                    onClick={() => setChecks((prev) => ({ ...prev, [key]: { ...row, open: !row.open } }))}
                  >
                    Verify
                  </button>
                  {row.open && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={row.value}
                        onChange={(e) => setChecks((prev) => ({ ...prev, [key]: { ...row, value: e.target.value } }))}
                        className="w-full rounded border border-obsidian-700 bg-obsidian-900 px-2 py-1 text-xs text-obsidian-100"
                        placeholder="Enter value to verify..."
                      />
                      <button
                        className="rounded bg-gold-500 px-2 py-1 text-xs text-obsidian-100"
                        onClick={async () => {
                          const computed = await hashField(row.value);
                          setChecks((prev) => ({ ...prev, [key]: { ...row, result: computed === hash } }));
                        }}
                      >
                        Check
                      </button>
                    </div>
                  )}
                  {row.result === true && <p className="mt-1 text-xs text-sage-300">✓ Verified</p>}
                  {row.result === false && <p className="mt-1 text-xs text-rose-300">✗ Does not match</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
