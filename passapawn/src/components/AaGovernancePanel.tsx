import {
  useCurrentAccount,
  useIotaClient,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
} from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { useState } from "react";
import { getFlowValue, setFlowValue } from "../flowState";
import { createAaAccountIntent } from "../notarizationApi";
import { buildTxFromIntent } from "../utils/buildTxFromIntent";
import { InfoHint } from "./InfoHint";
import { TxButton, type TxState } from "./TxButton";

interface AaGovernancePanelProps {
  onAaAccountCreated?: (accountId: string, threshold: number, signerCount: number) => void;
}

interface SignerRow {
  label: string;
  pubkeyHex: string;
}

interface AaTxResult {
  objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }>;
}

export function AaGovernancePanel({ onAaAccountCreated }: AaGovernancePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [signerRows, setSignerRows] = useState<SignerRow[]>([{ label: "", pubkeyHex: "" }]);
  const [threshold, setThreshold] = useState(1);
  const [txState, setTxState] = useState<TxState>("idle");
  const [message, setMessage] = useState("");
  const [aaAccountId, setAaAccountId] = useState(() => getFlowValue("aaAccountId"));
  const [extractedKey, setExtractedKey] = useState("");

  // Transfer cap state
  const [capId, setCapId] = useState(() => getFlowValue("lastDomainCapId"));
  const [transferTxState, setTransferTxState] = useState<TxState>("idle");

  const account = useCurrentAccount();
  const client = useIotaClient();
  const { mutate: signPersonalMessage } = useSignPersonalMessage();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const packageMetadataId = import.meta.env.VITE_PACKAGE_METADATA_ID ?? "";

  const aaThreshold = getFlowValue("aaThreshold") || String(threshold);
  const aaSignerCount = getFlowValue("aaSignerCount") || String(signerRows.length);

  const extractPubkey = () => {
    if (!account) {
      setMessage("Connect wallet first.");
      return;
    }
    const encoder = new TextEncoder();
    signPersonalMessage(
      { message: encoder.encode("passapawn:pubkey-extract-v1") },
      {
        onSuccess: ({ signature }) => {
          const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
          const pubkeyBytes = sigBytes.slice(65, 97);
          const pubkeyHex = Array.from(pubkeyBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          // Auto-fill the last empty signer row
          setSignerRows((prev) => {
            const next = [...prev];
            let emptyIdx = -1;
            for (let i = next.length - 1; i >= 0; i--) {
              if (!next[i].pubkeyHex.trim()) { emptyIdx = i; break; }
            }
            if (emptyIdx >= 0) {
              next[emptyIdx] = { ...next[emptyIdx], pubkeyHex: pubkeyHex };
            }
            return next;
          });
          setExtractedKey(pubkeyHex);
          setMessage(`Extracted: ${pubkeyHex.slice(0, 16)}...`);
        },
        onError: (err) => setMessage(err.message),
      },
    );
  };

  const validate = (): string | null => {
    if (!packageMetadataId) {
      return "VITE_PACKAGE_METADATA_ID is not set in .env. Run redeploy and set this variable first.";
    }
    for (let i = 0; i < signerRows.length; i++) {
      const row = signerRows[i];
      if (!row.label.trim()) return `Signer ${i + 1}: label is required.`;
      if (row.pubkeyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(row.pubkeyHex)) {
        return `Signer ${i + 1}: public key must be 64 hex chars (32 bytes).`;
      }
    }
    if (threshold < 1 || threshold > signerRows.length) {
      return `Threshold must be between 1 and ${signerRows.length}.`;
    }
    return null;
  };

  const createAaAccount = async () => {
    const err = validate();
    if (err) {
      setMessage(err);
      return;
    }

    setTxState("waiting_wallet");
    setMessage("");

    try {
      const intent = await createAaAccountIntent({
        public_keys_hex: signerRows.map((r) => r.pubkeyHex),
        threshold,
        labels: signerRows.map((r) => r.label.trim()),
        package_metadata_id: packageMetadataId,
      });

      const tx = buildTxFromIntent(intent);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            setTxState("pending_chain");
            try {
              const txResult = (await client.waitForTransaction({
                digest,
                options: { showObjectChanges: true },
              })) as AaTxResult;

              const created = txResult.objectChanges?.find(
                (c) => c.type === "created" && (c.objectType ?? "").includes("PassapawnAaAccount"),
              );

              if (created?.objectId) {
                setFlowValue("aaAccountId", created.objectId);
                setFlowValue("aaThreshold", String(threshold));
                setFlowValue("aaSignerCount", String(signerRows.length));
                setAaAccountId(created.objectId);
                onAaAccountCreated?.(created.objectId, threshold, signerRows.length);
                setMessage("AA account created! Now transfer your DomainAdminCap to it.");
              } else {
                setMessage("Transaction succeeded but AA account not found in changes.");
              }
              setTxState("success");
              setTimeout(() => setTxState("idle"), 1200);
            } catch (e) {
              setTxState("failure");
              setMessage(e instanceof Error ? e.message : String(e));
            }
          },
          onError: (error) => {
            setTxState("failure");
            setMessage(error.message);
          },
        },
      );
    } catch (e) {
      setTxState("failure");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const transferCap = () => {
    if (!capId.trim() || !aaAccountId) {
      setMessage("DomainAdminCap ID and AA account required.");
      return;
    }
    setTransferTxState("waiting_wallet");

    const tx = new Transaction();
    tx.transferObjects([tx.object(capId.trim())], tx.pure.address(aaAccountId));

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async ({ digest }) => {
          setTransferTxState("pending_chain");
          try {
            await client.waitForTransaction({ digest, options: { showObjectChanges: true } });
            setTransferTxState("success");
            setMessage("DomainAdminCap transferred. The AA account now controls your domain.");
            setTimeout(() => setTransferTxState("idle"), 1200);
          } catch (e) {
            setTransferTxState("failure");
            setMessage(e instanceof Error ? e.message : String(e));
          }
        },
        onError: (error) => {
          setTransferTxState("failure");
          setMessage(error.message);
        },
      },
    );
  };

  const resetAa = () => {
    setFlowValue("aaAccountId", "");
    setFlowValue("aaThreshold", "");
    setFlowValue("aaSignerCount", "");
    setAaAccountId("");
    setMessage("");
  };

  const thresholdHint =
    threshold === 1
      ? "Fast — single signer. Good for demos."
      : threshold === signerRows.length
        ? "Full consensus — all signers required."
        : `${threshold}-of-${signerRows.length} multisig.`;

  return (
    <section className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <span className="text-lg font-semibold text-white">
            Advanced Governance (Account Abstraction) {expanded ? "▴" : "▾"}
          </span>
          <p className="text-sm text-gray-400">
            Enable k-of-n multisig for template publishing and revocation.
          </p>
        </div>
        {aaAccountId && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" /> AA active
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {aaAccountId ? (
            <>
              {/* AA Active State */}
              <div className="rounded-lg border border-green-700 bg-green-950/40 p-3 text-sm text-green-300">
                AA Governance Active
              </div>
              <div className="space-y-1 text-sm text-gray-300">
                <p>
                  Account:{" "}
                  <code className="rounded bg-gray-800 px-1 text-xs">
                    {aaAccountId.slice(0, 10)}...{aaAccountId.slice(-6)}
                  </code>
                  <button
                    className="ml-2 text-xs text-indigo-400 hover:text-indigo-300"
                    onClick={() => navigator.clipboard.writeText(aaAccountId)}
                  >
                    Copy
                  </button>
                </p>
                <p>
                  Threshold: {aaThreshold}-of-{aaSignerCount} signatures required.
                </p>
              </div>

              <hr className="border-gray-700" />

              {/* Transfer DomainAdminCap */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-indigo-300">
                  Step 2 — Transfer DomainAdminCap to AA Account
                </h4>
                <p className="text-xs text-gray-400">
                  Once transferred, all governance actions go through the AA account and require{" "}
                  {aaThreshold}-of-{aaSignerCount} approval.
                </p>
                <label className="block text-xs text-gray-300">
                  DomainAdminCap ID{" "}
                  <InfoHint text="Find your DomainAdminCap ID in the Issue tab after creating a domain, or in the IssuerDashboard." />
                </label>
                <input
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
                  placeholder="0x..."
                  value={capId}
                  onChange={(e) => setCapId(e.target.value)}
                />
                <span title="Requires AA wallet support — coming soon">
                  <TxButton state={transferTxState} onClick={transferCap}>
                    Transfer Cap →
                  </TxButton>
                </span>
              </div>

              <button
                className="mt-2 text-xs text-gray-500 hover:text-gray-300"
                onClick={resetAa}
              >
                Reset AA account
              </button>
            </>
          ) : (
            <>
              {/* Create AA Account */}
              <h4 className="text-sm font-semibold text-indigo-300">
                Create Multi-Signer Governance Account
              </h4>
              <div className="rounded-lg border border-indigo-800 bg-indigo-950 p-4 text-sm text-gray-300">
                An Account Abstraction account is a shared on-chain object that owns your
                DomainAdminCap. Template publishing and on-chain revocation require cryptographic
                approval from k-of-n registered signers — no backend trust needed.
              </div>

              {/* Signer table */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-300">Signers</label>
                {signerRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      className="w-40 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100"
                      placeholder={idx === 0 ? "Alice" : "Board Member"}
                      value={row.label}
                      onChange={(e) => {
                        const next = [...signerRows];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setSignerRows(next);
                      }}
                    />
                    <input
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-gray-100"
                      placeholder="32-byte Ed25519 key in hex (64 chars)"
                      value={row.pubkeyHex}
                      maxLength={64}
                      onChange={(e) => {
                        const next = [...signerRows];
                        next[idx] = { ...next[idx], pubkeyHex: e.target.value };
                        setSignerRows(next);
                      }}
                    />
                    <button
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30"
                      disabled={signerRows.length <= 1}
                      onClick={() => setSignerRows((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {signerRows.length < 5 && (
                  <button
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                    onClick={() => setSignerRows((prev) => [...prev, { label: "", pubkeyHex: "" }])}
                  >
                    + Add signer
                  </button>
                )}
              </div>

              {/* Extract from wallet helper */}
              <div className="space-y-1">
                <button
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
                  onClick={extractPubkey}
                >
                  Extract my public key →
                </button>
                {extractedKey && (
                  <p className="text-xs text-green-400">Extracted: {extractedKey.slice(0, 16)}...</p>
                )}
                <p className="text-xs text-gray-500">
                  Share this page with other signers and have them click &quot;Extract my public key
                  →&quot; with their wallets to fill in their keys.
                </p>
              </div>

              {/* Threshold selector */}
              <div className="space-y-1">
                <label className="block text-xs text-gray-300">
                  Signatures required (k of {signerRows.length})
                </label>
                <input
                  type="number"
                  className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100"
                  min={1}
                  max={signerRows.length}
                  step={1}
                  value={threshold}
                  onChange={(e) => setThreshold(Math.max(1, Math.min(signerRows.length, Number(e.target.value))))}
                />
                <p className="text-xs text-gray-400">{thresholdHint}</p>
              </div>

              {/* Validation warning for missing metadata ID */}
              {!packageMetadataId && (
                <div className="rounded-lg border border-yellow-700 bg-yellow-950/40 p-2 text-xs text-yellow-300">
                  VITE_PACKAGE_METADATA_ID is not set in .env. Run redeploy and set this variable
                  first.
                </div>
              )}

              {/* Create AA Account button */}
              <span title="Requires AA wallet support — coming soon">
                <TxButton state={txState} onClick={createAaAccount}>
                  Create AA Account
                </TxButton>
              </span>
              <p className="text-[10px] text-amber-300/60">Note: Browser wallets don't yet support AA transactions. The on-chain module is deployed and ready.</p>
            </>
          )}

          {message && (
            <p
              className={`mt-2 text-sm ${message.startsWith("AA account created") || message.startsWith("DomainAdminCap transferred") || message.startsWith("Extracted") ? "text-green-400" : "text-yellow-300"}`}
            >
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
