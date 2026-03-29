import { useCurrentAccount, useSignPersonalMessage } from "@iota/dapp-kit";
import { useEffect, useState } from "react";
import {
  createAaGovernanceIntent,
  submitAaTransaction,
  type AaSubmitResponse,
} from "../notarizationApi";
import { TxButton, type TxState } from "./TxButton";

interface AaProposalSignerProps {
  domainId: string;
  proposalId: number;
  templateVersion: number;
  aaAccountId: string;
  threshold: number;
  signerCount: number;
  onSubmitted?: (digest: string) => void;
  onFallbackToManual?: () => void;
}

export function AaProposalSigner({
  domainId,
  proposalId,
  templateVersion,
  aaAccountId,
  threshold,
  signerCount,
  onSubmitted,
  onFallbackToManual,
}: AaProposalSignerProps) {
  const storageKey = `credora:aa_proposal_sigs:${domainId}:${proposalId}`;

  const [txBytesB64, setTxBytesB64] = useState(() => {
    return localStorage.getItem(storageKey + ":txbytes") ?? "";
  });
  const [sigsHex, setSigsHex] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [signing, setSigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AaSubmitResponse | null>(null);
  const [error, setError] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  const account = useCurrentAccount();
  // TODO(iota-aa-rpc): useSignTransaction may not accept raw base64 tx bytes in dapp-kit 0.9.0.
  // Using useSignPersonalMessage as fallback to collect Ed25519 signatures.
  const { mutate: signPersonalMessage } = useSignPersonalMessage();

  useEffect(() => {
    if (txBytesB64) return;
    setLoadingIntent(true);
    createAaGovernanceIntent({
      aa_account_id: aaAccountId,
      domain_id: domainId,
      proposal_id: proposalId,
      template_version: templateVersion,
    })
      .then((res) => {
        setTxBytesB64(res.tx_bytes_b64);
        setActionDescription(res.action_description);
        localStorage.setItem(storageKey + ":txbytes", res.tx_bytes_b64);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingIntent(false));
  }, [aaAccountId, domainId, proposalId, templateVersion, txBytesB64, storageKey]);

  const handleSign = () => {
    if (!account || !txBytesB64) return;
    setSigning(true);
    setError("");

    // Sign the tx bytes as a personal message to collect the Ed25519 signature
    // The raw 64-byte sig is extracted from the IOTA serialized signature format
    const txBytes = Uint8Array.from(atob(txBytesB64), (c) => c.charCodeAt(0));
    signPersonalMessage(
      { message: txBytes },
      {
        onSuccess: ({ signature }) => {
          const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
          if (sigBytes[0] !== 0x00) {
            setError("Only Ed25519 wallets are supported for AA signing.");
            setSigning(false);
            return;
          }
          const rawSig = sigBytes.slice(1, 65);
          const rawSigHex = Array.from(rawSig)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (!sigsHex.includes(rawSigHex)) {
            const next = [...sigsHex, rawSigHex];
            setSigsHex(next);
            localStorage.setItem(storageKey, JSON.stringify(next));
          }
          setSigning(false);
        },
        onError: (err) => {
          setError(err.message);
          setSigning(false);
        },
      },
    );
  };

  const handleSubmit = async () => {
    if (sigsHex.length < threshold || !txBytesB64) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await submitAaTransaction({
        tx_bytes_b64: txBytesB64,
        signatures_hex: sigsHex,
      });
      setResult(res);
      if (res.submitted && res.digest) {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(storageKey + ":txbytes");
        onSubmitted?.(res.digest);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const shareUrl = `${location.origin}?aa_proposal=${encodeURIComponent(domainId)}:${proposalId}`;

  const displayCount = Math.min(signerCount, 5);

  const submitTxState: TxState = submitting ? "pending_chain" : result?.submitted ? "success" : "idle";

  return (
    <div className="space-y-4 rounded-xl border border-indigo-800 bg-indigo-950/30 p-4">
      <div>
        <h4 className="text-sm font-semibold text-white">
          AA Governance — {threshold}-of-{signerCount} required
        </h4>
        {actionDescription && <p className="text-xs text-gray-400">{actionDescription}</p>}
      </div>

      {loadingIntent && <p className="text-xs text-gray-400">Loading governance intent...</p>}

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {Array.from({ length: displayCount }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border ${i < sigsHex.length ? "border-indigo-500 bg-indigo-500" : "border-gray-600 bg-gray-800"}`}
          />
        ))}
        <span className="text-xs text-gray-400">
          {sigsHex.length} / {threshold} required collected
        </span>
      </div>

      {/* Signing area */}
      {!account ? (
        <p className="text-xs text-gray-400">Connect your wallet to sign.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-300">
            Connected: {account.address.slice(0, 8)}...{account.address.slice(-4)}
          </p>
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            disabled={signing || !txBytesB64 || result?.submitted === true}
            onClick={handleSign}
          >
            {signing ? "Signing..." : "Sign this proposal →"}
          </button>
        </div>
      )}

      {/* Share link */}
      {sigsHex.length < threshold && txBytesB64 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-400">Share with co-signers:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-hidden text-ellipsis rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">
              {shareUrl}
            </code>
            <button
              className="rounded border border-gray-600 px-2 py-1 text-xs text-indigo-300"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Other signers open this link, connect their wallet, and sign.
          </p>
        </div>
      )}

      {/* Submit section */}
      {sigsHex.length >= threshold && (
        <div className="space-y-2">
          <div className="rounded-lg border border-green-700 bg-green-950/40 p-2 text-sm text-green-300">
            Threshold reached ({sigsHex.length}/{threshold})
          </div>
          <TxButton state={submitTxState} onClick={() => void handleSubmit()}>
            Submit AA Transaction →
          </TxButton>

          {result?.submitted && result.digest && (
            <p className="text-sm text-green-400">Submitted! Digest: {result.digest}</p>
          )}

          {result?.submitted === false && (
            <div className="space-y-2">
              <p className="text-sm text-red-400">Submission failed: {result.error}</p>
              <button
                className="text-xs text-gray-400 underline"
                onClick={() => setShowDebug((v) => !v)}
              >
                Debug info {showDebug ? "▴" : "▾"}
              </button>
              {showDebug && result.proof_bytes_b64 && (
                <div className="space-y-2">
                  <pre className="overflow-x-auto rounded bg-gray-950 p-2 text-[10px] text-gray-400">
                    {result.proof_bytes_b64}
                  </pre>
                  <p className="text-xs text-gray-400">You can submit manually with the IOTA CLI:</p>
                  <pre className="overflow-x-auto rounded bg-gray-950 p-2 text-[10px] text-gray-400">
{`iota client execute-signed-tx \\
  --tx-bytes ${txBytesB64} \\
  --signatures ${result.proof_bytes_b64}`}
                  </pre>
                </div>
              )}
              <button
                className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                onClick={() => onFallbackToManual?.()}
              >
                Use manual decree instead →
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
