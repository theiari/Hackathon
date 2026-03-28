import { useIotaClient, useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { useEffect, useMemo, useState } from "react";
import {
  createCredentialRecordIntent,
  createDynamicIntent,
  createLockedIntent,
  fetchTemplateFields,
  type TemplateField,
  type TransactionIntentResponse,
} from "../notarizationApi";
import { getFlowValue, setFlowValue } from "../flowState";
import { FieldHelp } from "./FieldHelp";
import { TxButton, type TxState } from "./TxButton";

const PRESET_TAGS = ["education", "work", "language", "health", "certificate", "veterinary", "government"];

interface StructuredValue {
  value: string;
  privacy: "private" | "public";
}

interface DebugEntry {
  at: string;
  step: string;
  details?: unknown;
}

interface TxExecutionView {
  status?: string;
  error?: string;
}

interface TxResultView {
  digest?: string;
  effects?: {
    status?: TxExecutionView;
  };
  errors?: string[];
  events?: unknown[];
  objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }>;
}

function toErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause,
    };
  }

  if (typeof error === "object" && error !== null) {
    return error as Record<string, unknown>;
  }

  return { message: String(error) };
}

function summarizeIntentArgument(arg: TransactionIntentResponse["arguments"][number], index: number) {
  if (arg.kind === "pure_bytes") {
    return { index, kind: arg.kind, length: arg.value.length };
  }
  if (arg.kind === "object") {
    return { index, kind: arg.kind, object_id: arg.object_id };
  }
  return {
    index,
    kind: arg.kind,
    value_preview: typeof arg.value === "string" ? arg.value.slice(0, 120) : arg.value,
    value_length: typeof arg.value === "string" ? arg.value.length : undefined,
  };
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

function findCreatedNotarization(result: { objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> }) {
  const changes = result.objectChanges ?? [];
  for (const change of changes) {
    if (change.type !== "created" || !change.objectId) continue;
    const typ = change.objectType ?? "";
    if (typ.includes("AssetRecord") || typ.includes("Notarization")) {
      return change.objectId;
    }
  }
  return "";
}

function findCreatedObject(result: { objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> }) {
  const changes = result.objectChanges ?? [];
  for (const change of changes) {
    if (change.type !== "created" || !change.objectId) continue;
    const typ = change.objectType ?? "";
    if (typ.includes("AssetRecord") || typ.includes("Notarization")) {
      return { id: change.objectId, objectType: typ };
    }
  }
  return null;
}

export function IssuerPanel({ onIssued }: { onIssued?: () => void }) {
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [txState, setTxState] = useState<TxState>("idle");
  const [message, setMessage] = useState("Ready");
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);

  const [domainId, setDomainId] = useState(getFlowValue("lastDomainId"));
  const [templateId, setTemplateId] = useState(getFlowValue("lastTemplateId"));
  const [immutableDescription, setImmutableDescription] = useState("");
  const [transferable, setTransferable] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [templateType, setTemplateType] = useState("Credential");
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [values, setValues] = useState<Record<string, StructuredValue>>({});
  const [registrationIntent, setRegistrationIntent] = useState<{
    notarizationId: string;
    metadata: string;
    expiryUnix: number;
    transferable: boolean;
    tags: string[];
  } | null>(null);
  const [selectedPresetTags, setSelectedPresetTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [customTags, setCustomTags] = useState<string[]>([]);

  const selectedTags = useMemo(() => [...selectedPresetTags, ...customTags].slice(0, 6), [selectedPresetTags, customTags]);

  const pushDebug = (step: string, details?: unknown) => {
    const entry: DebugEntry = {
      at: new Date().toISOString(),
      step,
      details,
    };
    setDebugEntries((prev) => [entry, ...prev].slice(0, 20));
    console.debug("[IssuerPanel]", step, details);
  };

  const runIntent = (intent: TransactionIntentResponse) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${intent.package_id}::${intent.target_module}::${intent.target_function}`,
      arguments: intent.arguments.map((arg) => {
        if (arg.kind === "object") return tx.object(arg.object_id);
        if (arg.kind === "pure_u64") return tx.pure.u64(BigInt(arg.value));
        if (arg.kind === "pure_bool") return tx.pure.bool(arg.value);
        if (arg.kind === "pure_id") return tx.pure.address(arg.value);
        if (arg.kind === "pure_bytes") return tx.pure.vector("u8", arg.value.map((byte) => Number(byte)));
        if (arg.kind === "pure_string") return tx.pure.string(arg.value);
        if (arg.kind === "pure_string_vector") return tx.pure.vector("string", arg.value);
        throw new Error(`Unsupported transaction argument kind: ${String((arg as { kind?: string }).kind)}`);
      }),
    });
    return tx;
  };

  const hasLastDomain = useMemo(() => Boolean(getFlowValue("lastDomainId")), [message]);
  const hasLastTemplate = useMemo(() => Boolean(getFlowValue("lastTemplateId")), [message]);

  useEffect(() => {
    if (!templateId.trim()) {
      setTemplateFields([]);
      return;
    }
    void (async () => {
      try {
        const out = await fetchTemplateFields(templateId.trim());
        setTemplateFields(out.fields);
        setTemplateType(out.credential_type);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [templateId]);

  const executeIntent = async () => {
    setDebugEntries([]);
    if (!templateId.trim()) return setMessage("Template ID is required");
    pushDebug("issue.start", {
      transferable,
      template_id: templateId.trim(),
      domain_id: domainId.trim() || null,
      expiry_date: expiryDate || null,
      template_fields_count: templateFields.length,
    });
    setTxState("waiting_wallet");

    try {
      const publicFields: Record<string, string> = {};
      const hashedFields: Record<string, string> = {};
      for (const field of templateFields) {
        const selected = values[field.name];
        if (!selected?.value?.trim()) {
          if (field.required) {
            setTxState("failure");
            return setMessage(`Field '${field.name}' is required`);
          }
          continue;
        }
        if (selected.privacy === "public") {
          publicFields[field.name] = selected.value.trim();
        } else {
          hashedFields[field.name] = await hashField(selected.value.trim());
        }
      }

      if (selectedTags.length > 0) {
        publicFields.tags = selectedTags.join(",");
      }

      const metadata = JSON.stringify({
        schema_version: 1,
        credential_type: templateType,
        template_id: templateId.trim(),
        issuer_domain_id: domainId.trim() || null,
        issued_at: new Date().toISOString(),
        expiry_iso: expiryDate ? new Date(`${expiryDate}T00:00:00Z`).toISOString() : null,
        transferable,
        public_fields: publicFields,
        hashed_fields: hashedFields,
      });
      const expiryUnix = expiryDate ? Math.floor(new Date(`${expiryDate}T00:00:00Z`).getTime() / 1000) : 0;

      pushDebug("issue.metadata_built", {
        metadata_length: metadata.length,
        public_fields_count: Object.keys(publicFields).length,
        hashed_fields_count: Object.keys(hashedFields).length,
        expiry_unix: expiryUnix,
        tags_count: selectedTags.length,
      });

      const dynamicPayload = {
        data: "",
        payload_strategy: "hash" as const,
        transfer_lock: "none" as const,
        immutable_description: immutableDescription,
        state_metadata: metadata,
      };

      const lockedPayload = {
        data: "",
        payload_strategy: "hash" as const,
        delete_lock: "none" as const,
        immutable_description: immutableDescription,
        state_metadata: metadata,
      };

      pushDebug("issue.intent_request", {
        endpoint: transferable ? "/notarizations/dynamic" : "/notarizations/locked",
        payload: transferable ? dynamicPayload : lockedPayload,
      });

      const intent = transferable
        ? await createDynamicIntent(dynamicPayload)
        : await createLockedIntent(lockedPayload);

      pushDebug("issue.intent_response", {
        target: `${intent.package_id}::${intent.target_module}::${intent.target_function}`,
        arguments: intent.arguments.map(summarizeIntentArgument),
      });

      try {
        await client.getNormalizedMoveFunction({
          package: intent.package_id,
          module: intent.target_module,
          function: intent.target_function,
        });
        pushDebug("issue.target_verified", {
          package: intent.package_id,
          module: intent.target_module,
          function: intent.target_function,
        });
      } catch (verificationError) {
        const details = toErrorDetails(verificationError);
        pushDebug("issue.target_missing", details);
        setTxState("failure");
        setMessage("Target Move function not found on-chain. Check debug trace below for package/module/function details.");
        return;
      }

      const tx = runIntent(intent);
      pushDebug("issue.tx_built", {
        target: `${intent.package_id}::${intent.target_module}::${intent.target_function}`,
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            pushDebug("issue.wallet_submitted", { digest });
            setTxState("pending_chain");
            const txResult = (await client.waitForTransaction({
              digest,
              options: { showObjectChanges: true, showEffects: true, showEvents: true, showInput: true },
            })) as TxResultView;

            const executionStatus = txResult.effects?.status?.status;
            const executionError = txResult.effects?.status?.error ?? txResult.errors?.[0];
            pushDebug("issue.chain_result", {
              digest: txResult.digest,
              status: executionStatus,
              error: executionError,
              events_count: txResult.events?.length ?? 0,
              object_changes_count: txResult.objectChanges?.length ?? 0,
            });

            if (executionStatus && executionStatus !== "success") {
              setTxState("failure");
              setMessage(`On-chain execution failed: ${executionError ?? "Unknown error"}`);
              return;
            }

            const created = findCreatedObject(txResult);
            const id = created?.id ?? "";
            if (id) {
              if (created?.objectType.includes("Notarization")) {
                setFlowValue("lastNotarizationId", id);
                localStorage.setItem("passapawn:last_notarization_id", id);
                setRegistrationIntent({
                  notarizationId: id,
                  metadata,
                  expiryUnix,
                  transferable,
                  tags: selectedTags,
                });
              }
              if (created?.objectType.includes("AssetRecord")) {
                localStorage.setItem("passapawn:last_record_id", id);
                setRegistrationIntent(null);
              }
            } else {
              pushDebug("issue.no_notarization_created", {
                digest,
                note: "No created object with type containing AssetRecord/Notarization was found in objectChanges.",
              });
            }
            setTxState("success");
            onIssued?.();
            if (created?.objectType.includes("AssetRecord")) {
              setMessage(`✓ Credential issued on-chain! Record ID: ${id}`);
            } else {
              setMessage(`✓ Notarization created! ${id ? `ID: ${id}` : "Copy ID from the wallet transaction result."}`);
            }
            setTimeout(() => setTxState("idle"), 1200);
          },
          onError: (error) => {
            setTxState("failure");
            pushDebug("issue.wallet_error", toErrorDetails(error));
            setMessage(error.message);
          },
        },
      );
    } catch (error) {
      setTxState("failure");
      pushDebug("issue.exception", toErrorDetails(error));
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const registerCredential = async () => {
    if (!registrationIntent) return;
    if (!domainId.trim()) {
      setMessage("Domain ID is required to register credential record");
      return;
    }

    setTxState("waiting_wallet");
    try {
      pushDebug("record.start", {
        notarization_id: registrationIntent.notarizationId,
        domain_id: domainId.trim(),
        expiry_unix: registrationIntent.expiryUnix,
        transferable: registrationIntent.transferable,
        tags: registrationIntent.tags,
      });

      const intent = await createCredentialRecordIntent({
        notarization_id: registrationIntent.notarizationId,
        domain_id: domainId.trim(),
        meta: registrationIntent.metadata,
        expiry_unix: registrationIntent.expiryUnix,
        transferable: registrationIntent.transferable,
        tags: registrationIntent.tags,
      });

      pushDebug("record.intent_response", {
        target: `${intent.package_id}::${intent.target_module}::${intent.target_function}`,
        arguments: intent.arguments.map(summarizeIntentArgument),
      });

      const tx = runIntent(intent);
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            pushDebug("record.wallet_submitted", { digest });
            setTxState("pending_chain");
            const txResult = (await client.waitForTransaction({
              digest,
              options: { showObjectChanges: true, showEffects: true, showEvents: true, showInput: true },
            })) as TxResultView;

            const executionStatus = txResult.effects?.status?.status;
            const executionError = txResult.effects?.status?.error ?? txResult.errors?.[0];
            pushDebug("record.chain_result", {
              digest: txResult.digest,
              status: executionStatus,
              error: executionError,
              events_count: txResult.events?.length ?? 0,
              object_changes_count: txResult.objectChanges?.length ?? 0,
            });

            if (executionStatus && executionStatus !== "success") {
              setTxState("failure");
              setMessage(`Credential registration failed on-chain: ${executionError ?? "Unknown error"}`);
              return;
            }

            const recordId = findCreatedNotarization(txResult);
            if (recordId) {
              localStorage.setItem("passapawn:last_record_id", recordId);
            }
            setMessage("✓ Credential registered on-chain. Holder can now see it in their wallet.");
            setRegistrationIntent(null);
            setTxState("success");
            onIssued?.();
            setTimeout(() => setTxState("idle"), 1200);
          },
          onError: (error) => {
            setTxState("failure");
            pushDebug("record.wallet_error", toErrorDetails(error));
            setMessage(error.message);
          },
        },
      );
    } catch (error) {
      setTxState("failure");
      pushDebug("record.exception", toErrorDetails(error));
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <h3 className="text-xl font-semibold text-white">Issue Credential</h3>
      <p className="mb-4 mt-1 text-sm text-gray-400">Use the structured form below; private fields are hashed before submission.</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs text-gray-300">Domain ID <FieldHelp text="The ID of your credential domain. Click '↙ Use last' to fill automatically." /></label>
          <div className="mt-1 flex gap-2">
            <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Domain ID" value={domainId} onChange={(e) => setDomainId(e.target.value)} />
            <button disabled={!hasLastDomain} title={hasLastDomain ? "" : "No recent value"} className="rounded border border-gray-600 px-2 text-xs text-indigo-300 disabled:opacity-50" onClick={() => setDomainId(getFlowValue("lastDomainId"))}>↙ Use last</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-300">Template ID <FieldHelp text="The ID of the published template. Click '↙ Use last' to fill automatically." /></label>
          <div className="mt-1 flex gap-2">
            <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Template ID" value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
            <button disabled={!hasLastTemplate} title={hasLastTemplate ? "" : "No recent value"} className="rounded border border-gray-600 px-2 text-xs text-indigo-300 disabled:opacity-50" onClick={() => setTemplateId(getFlowValue("lastTemplateId"))}>↙ Use last</button>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-300">Immutable Description <FieldHelp text="Free text — a human description stored permanently on-chain alongside the notarization." /></label>
        <input className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Description" value={immutableDescription} onChange={(e) => setImmutableDescription(e.target.value)} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs text-gray-300">Credential expiry <FieldHelp text="Optional — leave empty for credentials with no expiry." /></label>
          <input type="date" className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
        <label className="mt-5 flex items-center gap-2 text-sm text-gray-200">
          <input type="checkbox" checked={transferable} onChange={(e) => setTransferable(e.target.checked)} />
          Transferable ownership?
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-gray-800 p-3">
        <p className="text-xs font-semibold text-gray-200">Tags</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESET_TAGS.map((tag) => {
            const active = selectedPresetTags.includes(tag);
            return (
              <button
                key={tag}
                className={`rounded-full px-3 py-1 text-xs ${active ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-300"}`}
                onClick={() => {
                  setSelectedPresetTags((prev) => {
                    if (prev.includes(tag)) {
                      return prev.filter((item) => item !== tag);
                    }
                    if (prev.length + customTags.length >= 6) {
                      return prev;
                    }
                    return [...prev, tag];
                  });
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-100"
            placeholder="Custom tag"
            maxLength={20}
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
          />
          <button
            className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-200"
            onClick={() => {
              const normalized = customTagInput.trim().toLowerCase();
              if (!normalized) return;
              if (customTags.length >= 3) return;
              if (selectedPresetTags.includes(normalized) || customTags.includes(normalized)) return;
              if (selectedPresetTags.length + customTags.length >= 6) return;
              setCustomTags((prev) => [...prev, normalized]);
              setCustomTagInput("");
            }}
          >
            Add custom tag
          </button>
          <p className="text-[11px] text-gray-500">Max 3 custom tags, max 6 tags total</p>
        </div>

        {customTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {customTags.map((tag) => (
              <span key={tag} className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-200">
                {tag}
                <button className="ml-2 text-gray-400" onClick={() => setCustomTags((prev) => prev.filter((item) => item !== tag))}>
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {templateFields.length > 0 && (
        <div className="mt-4 space-y-3 rounded-lg border border-gray-800 p-3">
          <p className="text-sm font-semibold text-gray-200">Template Fields ({templateType})</p>
          {templateFields.map((field) => {
            const current = values[field.name] ?? { value: "", privacy: "private" as const };
            return (
              <div key={field.name} className="rounded border border-gray-800 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-100">{field.name} {field.required && <span className="rounded bg-red-900/50 px-1 text-[10px] text-red-300">Required</span>}</p>
                  <button
                    className="rounded border border-gray-700 px-2 py-1 text-xs text-indigo-300"
                    onClick={() =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: { ...current, privacy: current.privacy === "private" ? "public" : "private" },
                      }))
                    }
                  >
                    {current.privacy === "private" ? "🔒 Private" : "🌐 Public"}
                  </button>
                </div>
                <p className="text-xs text-gray-400">{field.description || "No description"}</p>
                <input
                  type={field.field_type === 1 ? "number" : "text"}
                  placeholder={field.field_type === 3 ? "0x..." : "Value"}
                  className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100"
                  value={current.value}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: { ...current, value: e.target.value } }))}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <TxButton state={txState} onClick={() => void executeIntent()}>
          {transferable ? "Issue Dynamic" : "Issue Locked"}
        </TxButton>
      </div>

      {registrationIntent && (
        <div className="mt-4 rounded-lg border border-indigo-700/60 bg-indigo-900/30 p-3">
          <p className="text-sm text-indigo-100">
            ✓ Notarization created! Register it as a credential on-chain to enable expiry, revocation, and holder discovery.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
              onClick={() => void registerCredential()}
            >
              Register credential →
            </button>
            <button
              className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-gray-300"
              onClick={() => setRegistrationIntent(null)}
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">{message}</p>

      {debugEntries.length > 0 && (
        <details className="mt-3 rounded-lg border border-amber-700/50 bg-black/20 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-amber-300">
            Issuance debug trace ({debugEntries.length})
          </summary>
          <div className="mt-2 space-y-2">
            {debugEntries.map((entry, index) => (
              <pre key={`${entry.at}-${index}`} className="overflow-x-auto rounded border border-amber-900/40 bg-black/40 p-2 text-[11px] text-amber-100">
{JSON.stringify(entry, null, 2)}
              </pre>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
