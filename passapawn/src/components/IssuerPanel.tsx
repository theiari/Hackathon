import { useIotaClient, useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { useEffect, useMemo, useState } from "react";
import { Send, ChevronDown, ChevronRight, Lock, Globe, ArrowDownLeft, Bug, Plus, X, Users, User, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import {
  createCredentialRecordIntent,
  createDynamicIntent,
  createLockedIntent,
  fetchTemplateFields,
  type TemplateField,
  type TransactionIntentResponse,
} from "../notarizationApi";
import { getFlowValue, setFlowValue } from "../flowState";
import { buildTxFromIntent } from "../utils/buildTxFromIntent";
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
    return { name: error.name, message: error.message, stack: error.stack, cause };
  }
  if (typeof error === "object" && error !== null) return error as Record<string, unknown>;
  return { message: String(error) };
}

function summarizeIntentArgument(arg: TransactionIntentResponse["arguments"][number], index: number) {
  if (arg.kind === "pure_bytes") return { index, kind: arg.kind, length: arg.value.length };
  if (arg.kind === "object") return { index, kind: arg.kind, object_id: arg.object_id };
  return {
    index,
    kind: arg.kind,
    value_preview: typeof arg.value === "string" ? arg.value.slice(0, 120) : arg.value,
    value_length: typeof arg.value === "string" ? arg.value.length : undefined,
  };
}

async function hashField(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return "sha256:" + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function findCreatedNotarization(result: { objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> }) {
  for (const change of result.objectChanges ?? []) {
    if (change.type !== "created" || !change.objectId) continue;
    const typ = change.objectType ?? "";
    if (typ.includes("AssetRecord") || typ.includes("Notarization")) return change.objectId;
  }
  return "";
}

function findCreatedObject(result: { objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> }) {
  for (const change of result.objectChanges ?? []) {
    if (change.type !== "created" || !change.objectId) continue;
    const typ = change.objectType ?? "";
    if (typ.includes("AssetRecord") || typ.includes("Notarization")) return { id: change.objectId, objectType: typ };
  }
  return null;
}

function truncateId(id: string, chars = 8): string {
  if (id.length <= chars * 2 + 3) return id;
  return `${id.slice(0, chars)}...${id.slice(-chars)}`;
}

export function IssuerPanel({ onIssued }: { onIssued?: () => void }) {
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [txState, setTxState] = useState<TxState>("idle");
  const [message, setMessage] = useState("");
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const [domainId, setDomainId] = useState(() => getFlowValue("lastDomainId"));
  const [templateId, setTemplateId] = useState(() => getFlowValue("lastTemplateId"));
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
  const [batchMode, setBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; results: Array<{ status: "success" | "error"; id?: string; error?: string }> } | null>(null);

  const selectedTags = useMemo(() => [...selectedPresetTags, ...customTags].slice(0, 6), [selectedPresetTags, customTags]);

  const pushDebug = (step: string, details?: unknown) => {
    const entry: DebugEntry = { at: new Date().toISOString(), step, details };
    setDebugEntries((prev) => [entry, ...prev].slice(0, 20));
    console.debug("[IssuerPanel]", step, details);
  };

  const runIntent = (intent: TransactionIntentResponse) => buildTxFromIntent(intent);

  const hasLastDomain = useMemo(() => Boolean(getFlowValue("lastDomainId")), [message]);
  const hasLastTemplate = useMemo(() => Boolean(getFlowValue("lastTemplateId")), [message]);
  const hasDomain = Boolean(domainId.trim());
  const hasTemplate = Boolean(templateId.trim());

  useEffect(() => {
    if (!templateId.trim()) { setTemplateFields([]); return; }
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
          if (field.required) { setTxState("failure"); return setMessage(`Field '${field.name}' is required`); }
          continue;
        }
        const val = selected.value.trim();

        // Constraint validation
        if (field.field_type === 0 || field.field_type === 4) {
          if (field.min_length && val.length < field.min_length) {
            setTxState("failure");
            return setMessage(`'${field.name}' must be at least ${field.min_length} characters`);
          }
          if (field.max_length && val.length > field.max_length) {
            setTxState("failure");
            return setMessage(`'${field.name}' must be at most ${field.max_length} characters`);
          }
        }
        if (field.field_type === 1) {
          const numVal = Number(val);
          if (field.min_value && numVal < field.min_value) {
            setTxState("failure");
            return setMessage(`'${field.name}' must be ≥ ${field.min_value}`);
          }
          if (field.max_value && numVal > field.max_value) {
            setTxState("failure");
            return setMessage(`'${field.name}' must be ≤ ${field.max_value}`);
          }
        }
        if (field.pattern_hint) {
          const patterns: Record<string, RegExp> = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            phone: /^\+?[\d\s()-]{7,20}$/,
            date: /^\d{4}-\d{2}-\d{2}$/,
            url: /^https?:\/\/.+/,
            "iso3166-alpha2": /^[A-Z]{2}$/,
            iso8601: /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/,
          };
          const re = patterns[field.pattern_hint];
          if (re && !re.test(val)) {
            setTxState("failure");
            return setMessage(`'${field.name}' must match pattern: ${field.pattern_hint}`);
          }
        }

        if (selected.privacy === "public") {
          publicFields[field.name] = selected.value.trim();
        } else {
          hashedFields[field.name] = await hashField(selected.value.trim());
        }
      }

      if (selectedTags.length > 0) publicFields.tags = selectedTags.join(",");

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
        pushDebug("issue.target_missing", toErrorDetails(verificationError));
        setTxState("failure");
        setMessage("Target Move function not found on-chain. Check debug trace below for details.");
        setShowDebug(true);
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
                setRegistrationIntent({ notarizationId: id, metadata, expiryUnix, transferable, tags: selectedTags });
              }
              if (created?.objectType.includes("AssetRecord")) {
                localStorage.setItem("passapawn:last_record_id", id);
                setRegistrationIntent(null);
              }
            } else {
              pushDebug("issue.no_notarization_created", {
                digest,
                note: "No AssetRecord/Notarization found in objectChanges.",
              });
            }
            setTxState("success");
            onIssued?.();
            if (created?.objectType.includes("AssetRecord")) {
              setMessage(`Credential issued! Record: ${truncateId(id)}`);
            } else {
              setMessage(`Notarization created! ${id ? `ID: ${truncateId(id)}` : "Check wallet for details."}`);
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
    if (!domainId.trim()) { setMessage("Domain ID is required to register credential record"); return; }

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
            });

            if (executionStatus && executionStatus !== "success") {
              setTxState("failure");
              setMessage(`Registration failed: ${executionError ?? "Unknown error"}`);
              return;
            }

            const recordId = findCreatedNotarization(txResult);
            if (recordId) localStorage.setItem("passapawn:last_record_id", recordId);
            setMessage("Credential registered! The holder can now see it in their wallet.");
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

  const executeBatch = async () => {
    if (batchCount < 1 || batchCount > 20) return setMessage("Batch count must be between 1 and 20");
    if (!templateId.trim()) return setMessage("Template ID is required");

    const total = batchCount;
    const results: Array<{ status: "success" | "error"; id?: string; error?: string }> = [];
    setBatchProgress({ current: 0, total, results });

    for (let idx = 0; idx < total; idx++) {
      setBatchProgress({ current: idx, total, results: [...results] });

      try {
        // Build metadata (same logic as single mode)
        const publicFields: Record<string, string> = {};
        const hashedFields: Record<string, string> = {};
        let validationFailed = false;
        for (const field of templateFields) {
          const selected = values[field.name];
          if (!selected?.value?.trim()) {
            if (field.required) {
              results.push({ status: "error", error: `Field '${field.name}' is required` });
              validationFailed = true;
              break;
            }
            continue;
          }
          if (selected.privacy === "public") {
            publicFields[field.name] = selected.value.trim();
          } else {
            hashedFields[field.name] = await hashField(selected.value.trim());
          }
        }
        if (validationFailed) {
          setBatchProgress({ current: idx + 1, total, results: [...results] });
          continue;
        }

        if (selectedTags.length > 0) publicFields.tags = selectedTags.join(",");
        publicFields.batch_index = String(idx + 1);
        publicFields.batch_total = String(total);

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

        const payload = transferable
          ? { data: "", payload_strategy: "hash" as const, transfer_lock: "none" as const, immutable_description: immutableDescription, state_metadata: metadata }
          : { data: "", payload_strategy: "hash" as const, delete_lock: "none" as const, immutable_description: immutableDescription, state_metadata: metadata };

        const intent = transferable
          ? await createDynamicIntent(payload as Parameters<typeof createDynamicIntent>[0])
          : await createLockedIntent(payload as Parameters<typeof createLockedIntent>[0]);

        const tx = buildTxFromIntent(intent);

        await new Promise<void>((resolve) => {
          signAndExecute(
            { transaction: tx },
            {
              onSuccess: async ({ digest }) => {
                try {
                  const txResult = (await client.waitForTransaction({
                    digest,
                    options: { showObjectChanges: true, showEffects: true },
                  })) as TxResultView;
                  const created = findCreatedObject(txResult);
                  results.push({ status: "success", id: created?.id ?? digest });
                  resolve();
                } catch (e) {
                  results.push({ status: "error", error: e instanceof Error ? e.message : String(e) });
                  resolve();
                }
              },
              onError: (error) => {
                results.push({ status: "error", error: error.message });
                resolve();
              },
            },
          );
        });
      } catch (e) {
        results.push({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }

      setBatchProgress({ current: idx + 1, total, results: [...results] });
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const failCount = results.filter((r) => r.status === "error").length;
    setMessage(`Batch complete: ${successCount} issued, ${failCount} failed. Credentials are in your wallet.`);
    onIssued?.();
  };

  const toggleTag = (tag: string) => {
    setSelectedPresetTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length + customTags.length >= 6) return prev;
      return [...prev, tag];
    });
  };

  const addCustomTag = () => {
    const normalized = customTagInput.trim().toLowerCase();
    if (!normalized || customTags.length >= 3) return;
    if (selectedPresetTags.includes(normalized) || customTags.includes(normalized)) return;
    if (selectedPresetTags.length + customTags.length >= 6) return;
    setCustomTags((prev) => [...prev, normalized]);
    setCustomTagInput("");
  };

  return (
    <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60">
      <div className="border-b border-gray-800/40 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Send className="h-4 w-4 text-indigo-400" />
          Issue a Credential
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">Fill in the fields below. Private fields are hashed before submission.</p>
        <div className="mt-3 flex gap-1 rounded-lg bg-gray-800/50 p-0.5">
          <button
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${!batchMode ? "bg-indigo-600/30 text-indigo-200" : "text-gray-400 hover:text-gray-200"}`}
            onClick={() => { setBatchMode(false); setBatchProgress(null); }}
          >
            <User className="h-3 w-3" /> Single
          </button>
          <button
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${batchMode ? "bg-indigo-600/30 text-indigo-200" : "text-gray-400 hover:text-gray-200"}`}
            onClick={() => { setBatchMode(true); setBatchProgress(null); }}
          >
            <Users className="h-3 w-3" /> Batch
          </button>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        {/* Domain & Template IDs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Domain ID</label>
            <p className="mb-1.5 text-[11px] text-gray-500">
              {hasDomain ? `Using: ${truncateId(domainId)}` : "The credential domain to issue under"}
            </p>
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="0x..." value={domainId} onChange={(e) => setDomainId(e.target.value)} />
              {hasLastDomain && (
                <button className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-700/50 px-2 text-[11px] text-indigo-400 transition-colors hover:bg-indigo-600/10" onClick={() => setDomainId(getFlowValue("lastDomainId"))} title="Auto-fill from last transaction">
                  <ArrowDownLeft className="h-3 w-3" />
                  Auto
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Template ID</label>
            <p className="mb-1.5 text-[11px] text-gray-500">
              {hasTemplate ? `Using: ${truncateId(templateId)}` : "The published template for this credential"}
            </p>
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="0x..." value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
              {hasLastTemplate && (
                <button className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-700/50 px-2 text-[11px] text-indigo-400 transition-colors hover:bg-indigo-600/10" onClick={() => setTemplateId(getFlowValue("lastTemplateId"))} title="Auto-fill from last transaction">
                  <ArrowDownLeft className="h-3 w-3" />
                  Auto
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Description</label>
          <p className="mb-1.5 text-[11px] text-gray-500">An immutable description stored permanently on-chain.</p>
          <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="e.g. B2 English Certificate for Alice" value={immutableDescription} onChange={(e) => setImmutableDescription(e.target.value)} />
        </div>

        {/* Expiry & Transferable */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Expiry Date</label>
            <p className="mb-1.5 text-[11px] text-gray-500">Leave empty for credentials that never expire</p>
            <input type="date" className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-700/60 bg-gray-800/30 px-4 py-2.5 text-sm text-gray-200 transition-colors hover:border-gray-600">
              <input type="checkbox" className="accent-indigo-500" checked={transferable} onChange={(e) => setTransferable(e.target.checked)} />
              Transferable ownership
            </label>
          </div>
        </div>

        {/* Tags */}
        <div className="rounded-xl border border-gray-800/40 bg-gray-800/10 p-3">
          <p className="mb-2 text-xs font-medium text-gray-400">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_TAGS.map((tag) => {
              const active = selectedPresetTags.includes(tag);
              return (
                <button
                  key={tag}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${active ? "bg-indigo-600/30 text-indigo-200 ring-1 ring-indigo-500/40" : "bg-gray-800/60 text-gray-400 hover:text-gray-200"}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input className="w-32 rounded-lg border border-gray-700/60 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600" placeholder="Custom tag" maxLength={20} value={customTagInput} onChange={(e) => setCustomTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustomTag(); }} />
            <button className="flex items-center gap-1 rounded border border-gray-700/50 px-2 py-1.5 text-xs text-gray-300 transition-colors hover:text-white" onClick={addCustomTag}>
              <Plus className="h-3 w-3" /> Add
            </button>
            <span className="text-[10px] text-gray-600">{selectedTags.length}/6</span>
          </div>
          {customTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {customTags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full border border-gray-700/50 bg-gray-800/40 px-2.5 py-1 text-xs text-gray-200">
                  {tag}
                  <button className="text-gray-500 hover:text-red-400" onClick={() => setCustomTags((prev) => prev.filter((t) => t !== tag))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Template Fields */}
        {templateFields.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400">
              Template Fields <span className="text-gray-600">({templateType})</span>
            </p>
            <p className="text-[11px] text-gray-500">
              Toggle visibility for each field. Private fields are SHA-256 hashed before going on-chain.
            </p>
            <div className="space-y-2">
              {templateFields.map((field) => {
                const current = values[field.name] ?? { value: "", privacy: "private" as const };
                const isPrivate = current.privacy === "private";
                return (
                  <div key={field.name} className="rounded-xl border border-gray-800/40 bg-gray-800/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-100">{field.name}</p>
                        {field.required && <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] font-medium text-red-300">Required</span>}
                      </div>
                      <button
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${isPrivate ? "bg-gray-800/60 text-gray-300" : "bg-indigo-600/20 text-indigo-300"}`}
                        onClick={() => setValues((prev) => ({ ...prev, [field.name]: { ...current, privacy: isPrivate ? "public" : "private" } }))}
                      >
                        {isPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                        {isPrivate ? "Private" : "Public"}
                      </button>
                    </div>
                    {field.description && <p className="mt-1 text-[11px] text-gray-500">{field.description}</p>}
                    <input
                      type={field.field_type === 1 ? "number" : "text"}
                      placeholder={field.field_type === 3 ? "0x..." : "Value"}
                      className="mt-2 w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                      value={current.value}
                      onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: { ...current, value: e.target.value } }))}
                    />
                    {/* Constraint hints */}
                    {(() => {
                      const hints: string[] = [];
                      if (field.min_length) hints.push(`min ${field.min_length} chars`);
                      if (field.max_length) hints.push(`max ${field.max_length} chars`);
                      if (field.min_value) hints.push(`≥ ${field.min_value}`);
                      if (field.max_value) hints.push(`≤ ${field.max_value}`);
                      if (field.pattern_hint) hints.push(`format: ${field.pattern_hint}`);
                      return hints.length > 0 ? (
                        <p className="mt-1 text-[10px] text-gray-500">{hints.join(" · ")}</p>
                      ) : null;
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Batch count input */}
        {batchMode && (
          <div className="rounded-xl border border-indigo-800/30 bg-indigo-900/10 p-4">
            <p className="mb-2 text-xs font-medium text-indigo-300">Batch Issuance</p>
            <p className="mb-3 text-[11px] text-gray-500">
              Issue multiple identical credentials to your wallet. Each credential is a separate on-chain object.
              Transfer them to recipients from the My Credentials tab.
            </p>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-400">Number of credentials:</label>
              <input
                type="number"
                min={1}
                max={20}
                className="w-20 rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500/50 focus:outline-none"
                value={batchCount}
                onChange={(e) => setBatchCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
              <span className="text-[10px] text-gray-500">(max 20)</span>
            </div>
          </div>
        )}

        {/* Batch progress */}
        {batchProgress && (
          <div className="rounded-xl border border-gray-800/40 bg-gray-800/10 p-4">
            <p className="mb-2 text-xs font-medium text-gray-300">
              Batch Issuance Progress — {batchProgress.current}/{batchProgress.total}
            </p>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-700/50">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
            <div className="space-y-1">
              {Array.from({ length: batchProgress.total }, (_, i) => {
                const result = batchProgress.results[i];
                const isCurrent = i === batchProgress.current && batchProgress.current < batchProgress.total;
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {result?.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    ) : result?.status === "error" ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                    ) : isCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <span className="inline-block h-3.5 w-3.5 rounded-full border border-gray-700" />
                    )}
                    <span className={result?.status === "success" ? "text-green-300" : result?.status === "error" ? "text-red-300" : isCurrent ? "text-indigo-300" : "text-gray-500"}>
                      Credential #{i + 1}
                      {result?.status === "success" && result.id ? ` — ${truncateId(result.id)}` : ""}
                      {result?.status === "error" ? ` — ${result.error}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Issue button */}
        <div className="flex items-center gap-3">
          {batchMode ? (
            <button
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              disabled={batchProgress !== null && batchProgress.current < batchProgress.total}
              onClick={() => void executeBatch()}
            >
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Issue {batchCount} Credential{batchCount !== 1 ? "s" : ""}
              </span>
            </button>
          ) : (
            <TxButton state={txState} onClick={() => void executeIntent()}>
              <span className="flex items-center gap-1.5">
                <Send className="h-4 w-4" />
                {transferable ? "Issue Dynamic" : "Issue Locked"}
              </span>
            </TxButton>
          )}
        </div>

        {/* Registration prompt */}
        {registrationIntent && (
          <div className="rounded-xl border border-indigo-600/40 bg-indigo-900/20 p-4">
            <p className="text-sm text-indigo-100">
              Notarization created. Register it to enable expiry, revocation, and holder discovery.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500" onClick={() => void registerCredential()}>
                Register credential
              </button>
              <button className="rounded-lg border border-gray-700/50 px-4 py-2 text-xs text-gray-300 transition-colors hover:text-white" onClick={() => setRegistrationIntent(null)}>
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* Status message */}
        {message && (
          <div className={`rounded-lg px-4 py-2.5 text-xs ${message.includes("issued") || message.includes("created") || message.includes("registered") || message.includes("Credential") || message.includes("Notarization") ? "border border-green-800/40 bg-green-900/10 text-green-300" : "border border-gray-800/40 bg-gray-800/20 text-gray-400"}`}>
            {message}
          </div>
        )}

        {/* Debug trace (collapsed by default) */}
        {debugEntries.length > 0 && (
          <div className="border-t border-gray-800/40 pt-3">
            <button className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300" onClick={() => setShowDebug((v) => !v)}>
              {showDebug ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Bug className="h-3.5 w-3.5" />
              Debug trace ({debugEntries.length})
            </button>
            {showDebug && (
              <div className="mt-2 space-y-2">
                {debugEntries.map((entry, index) => (
                  <pre key={`${entry.at}-${index}`} className="overflow-x-auto rounded-lg border border-amber-900/30 bg-black/30 p-2 text-[11px] text-amber-200/80">
{JSON.stringify(entry, null, 2)}
                  </pre>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
