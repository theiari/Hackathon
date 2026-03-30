import { useIotaClient, useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { useEffect, useState } from "react";
import {
  createRevokeOnchainIntent,
  fetchIssuerCredentials,
  type IssuerCredential,
  type TransactionIntentResponse,
} from "../notarizationApi";
import { getFlowValue } from "../flowState";
import { StatusBadge } from "./StatusBadge";

function shortId(value: string) {
  if (value.length < 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function IssuerDashboard({ onNavigateToVerify }: { onNavigateToVerify: (id: string) => void }) {
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [domainId, setDomainId] = useState(getFlowValue("lastDomainId"));
  const [apiKey, setApiKey] = useState(
    localStorage.getItem("credora:verifier_api_key") ??
      localStorage.getItem("credora:policy_admin_api_key") ??
      localStorage.getItem("credora:admin_api_key") ??
      "",
  );
  const [rows, setRows] = useState<IssuerCredential[]>([]);
  const [showRevoked, setShowRevoked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revokingId, setRevokingId] = useState("");
  const [revokeError, setRevokeError] = useState("");

  useEffect(() => {
    localStorage.setItem("credora:verifier_api_key", apiKey);
  }, [apiKey]);

  const buildTx = (intent: TransactionIntentResponse) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${intent.package_id}::${intent.target_module}::${intent.target_function}`,
      arguments: intent.arguments.map((arg) => {
        if (arg.kind === "object") return tx.object(arg.object_id);
        if (arg.kind === "pure_u64") return tx.pure.u64(BigInt(arg.value));
        if (arg.kind === "pure_bool") return tx.pure.bool(arg.value);
        if (arg.kind === "pure_id") return tx.pure.id(arg.value);
        if (arg.kind === "pure_bytes") return tx.pure.vector("u8", arg.value.map((byte) => Number(byte)));
        return tx.pure.string(String(arg.value));
      }),
    });
    return tx;
  };

  const load = async () => {
    if (!domainId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const out = await fetchIssuerCredentials(domainId.trim(), apiKey.trim());
      setRows(out.credentials.slice().reverse());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/invalid role api key|role api key is not configured|missing x-api-key/i.test(message)) {
        setError("Issuer dashboard requires the verifier API key. Update the Verifier API key field and retry.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const revokeOnChain = async (recordId: string) => {
    const domainCapId = localStorage.getItem("credora:last_domain_cap_id") ?? "";
    if (!domainCapId.trim()) {
      setRevokeError("Revocation failed — ensure the DomainAdminCap ID is correct and belongs to this domain.");
      return;
    }

    setRevokeError("");
    setRevokingId(recordId);
    try {
      const intent = await createRevokeOnchainIntent(recordId, domainCapId.trim(), apiKey.trim());
      const tx = buildTx(intent);
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await client.waitForTransaction({ digest });
            await load();
            setRevokingId("");
          },
          onError: () => {
            setRevokingId("");
            setRevokeError("Revocation failed — ensure the DomainAdminCap ID is correct and belongs to this domain.");
          },
        },
      );
    } catch {
      setRevokingId("");
      setRevokeError("Revocation failed — ensure the DomainAdminCap ID is correct and belongs to this domain.");
    }
  };

  const hasDomainCap = Boolean((localStorage.getItem("credora:last_domain_cap_id") ?? "").trim());
  const displayedRows = showRevoked
    ? rows
    : rows.filter((row) => row.verdict.status !== "revoked_on_chain");

  return (
    <div className="panel animate-fade-in-up">
      <div className="panel-header">
        <h3 className="text-lg font-semibold text-obsidian-50">📊 Issued Certificates</h3>
      </div>
      <div className="panel-body">
      <div className="grid gap-4 md:grid-cols-3">
        <input className="credora-input text-sm" placeholder="Domain ID" value={domainId} onChange={(e) => setDomainId(e.target.value)} />
        <input className="credora-input text-sm" placeholder="Verifier API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <div className="flex items-center gap-3">
          <button className="btn-ghost text-xs disabled:opacity-50" disabled={!getFlowValue("lastDomainId")} onClick={() => setDomainId(getFlowValue("lastDomainId"))}>↙ Use last</button>
          <button className="btn-primary text-xs" onClick={() => void load()}>{loading ? "Loading..." : "Load credentials for domain"}</button>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      {revokeError && <p className="mt-3 text-xs text-rose-300">{revokeError}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-obsidian-400">Showing {displayedRows.length} of {rows.length} certificates</p>
        <label className="flex items-center gap-2 text-xs text-obsidian-300">
          <input
            type="checkbox"
            checked={showRevoked}
            onChange={(e) => setShowRevoked(e.target.checked)}
          />
          Show revoked
        </label>
      </div>

      {displayedRows.length === 0 ? (
        <p className="mt-4 text-sm text-obsidian-400">No certificates issued by this domain yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-obsidian-400">
              <tr>
                <th className="py-2">Record ID</th>
                <th>Status</th>
                <th>Certificate type</th>
                <th>Issued at</th>
                <th>Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row) => {
                const md = row.verdict.credential_metadata;
                return (
                  <tr key={row.record_id} className="border-t border-obsidian-700">
                    <td className="py-2 font-mono text-obsidian-300">{shortId(row.record_id)}</td>
                    <td><StatusBadge status={row.verdict.status} /></td>
                    <td className="text-obsidian-200">{md?.credential_type ?? "Certificate"}</td>
                    <td className="text-obsidian-400">{md?.issued_at ? new Date(md.issued_at).toLocaleDateString() : "-"}</td>
                    <td className="text-obsidian-400">{md?.expiry_iso ? new Date(md.expiry_iso).toLocaleDateString() : "No expiry"}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="text-gold-400" onClick={() => onNavigateToVerify(row.record_id)}>Verify →</button>
                        <button className="text-gold-400" onClick={() => void navigator.clipboard.writeText(row.record_id)}>Copy ID</button>
                        <button className="text-gold-400" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}?verify=${encodeURIComponent(row.record_id)}`)}>Share 🔗</button>
                        {hasDomainCap && row.verdict.status !== "revoked_on_chain" && (
                          <button
                            className="text-rose-400 hover:text-rose-300 transition-colors"
                            onClick={() => {
                              if (window.confirm(`Revoke certificate ${row.record_id.slice(0, 10)}…? This action is irreversible.`)) {
                                void revokeOnChain(row.record_id);
                              }
                            }}
                            disabled={revokingId === row.record_id}
                          >
                            {revokingId === row.record_id ? "Revoking..." : "Revoke on-chain ⛔"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
