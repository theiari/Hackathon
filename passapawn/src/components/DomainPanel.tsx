import { useCurrentAccount, useIotaClient, useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { useMemo, useEffect, useState } from "react";
import { Building2, FileText, ChevronDown, ChevronRight, Plus, Trash2, CheckCircle2, ExternalLink } from "lucide-react";
import { getFlowValue, setFlowValue } from "../flowState";
import { createDid, API_BASE } from "../notarizationApi";
import { TxButton, type TxState } from "./TxButton";
import { AaGovernancePanel } from "./AaGovernancePanel";
import { AaProposalSigner } from "./AaProposalSigner";

interface FieldInput {
  name: string;
  fieldType: number;
  required: boolean;
  description: string;
  minLength: number;
  maxLength: number;
  minValue: number;
  maxValue: number;
  patternHint: string;
}

interface ProposalEvent {
  type?: string;
  parsedJson?: unknown;
}

interface DomainTxResult {
  objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }>;
  events?: ProposalEvent[];
}

const FIELD_TYPE_LABELS: Record<number, string> = { 0: "String", 1: "U64", 2: "Bool", 3: "Address", 4: "Bytes" };
const PATTERN_HINTS = ["", "email", "phone", "date", "url", "iso3166-alpha2", "iso8601"];
const DID_PATTERN = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+(:[a-zA-Z0-9._:%-]+)*$/;

function emptyField(): FieldInput {
  return { name: "", fieldType: 0, required: true, description: "", minLength: 0, maxLength: 0, minValue: 0, maxValue: 0, patternHint: "" };
}

function normalizeDidInput(value: string): string {
  return value.slice(0, 256);
}

function parseProposalId(events?: ProposalEvent[]): string {
  const proposalEvent = events?.find((event) => typeof event.type === "string" && event.type.includes("ProposalCreated"));
  const raw = (proposalEvent?.parsedJson as { proposal_id?: number | string } | undefined)?.proposal_id;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") return raw;
  return "";
}

function truncateId(id: string, chars = 8): string {
  if (id.length <= chars * 2 + 3) return id;
  return `${id.slice(0, chars)}...${id.slice(-chars)}`;
}

// Section wrapper
function Section({
  title,
  subtitle,
  children,
  step,
  done,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  step?: number;
  done?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        {step != null && (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-green-600/20 text-green-400" : "bg-indigo-600/20 text-indigo-300"}`}>
            {done ? <CheckCircle2 className="h-4 w-4" /> : step}
          </span>
        )}
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{title}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
      </button>
      {open && <div className="border-t border-gray-800/40 px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

export function DomainPanel({
  packageId,
  onStepCompleted,
}: {
  packageId: string;
  onStepCompleted?: (step: 1 | 2) => void;
}) {
  const account = useCurrentAccount();
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [txState, setTxState] = useState<TxState>("idle");
  const [result, setResult] = useState("");

  // ── Create Domain state ──
  const [domainName, setDomainName] = useState("");
  const [domainDesc, setDomainDesc] = useState("");
  const [domainDid, setDomainDid] = useState("");
  const [domainSigners, setDomainSigners] = useState("");
  const [domainThreshold, setDomainThreshold] = useState("1");

  // ── Template state ──
  const [domainCapId, setDomainCapId] = useState(() => getFlowValue("lastDomainCapId"));
  const [domainId, setDomainId] = useState(() => getFlowValue("lastDomainId"));
  const [credType, setCredType] = useState("");
  const [did, setDid] = useState("");
  const [fields, setFields] = useState<FieldInput[]>([emptyField()]);
  const [version, setVersion] = useState("1");

  // ── Proposal flow state ──
  const [proposalId, setProposalId] = useState("");
  const [lastProposalId, setLastProposalId] = useState("");
  const [showAdvancedFlow, setShowAdvancedFlow] = useState(false);
  const [proposalCopied, setProposalCopied] = useState(false);
  const [showManualProposal, setShowManualProposal] = useState(false);
  const [generatedDid, setGeneratedDid] = useState("");

  const hasDomain = Boolean(domainId.trim());
  const hasDomainCap = Boolean(domainCapId.trim());

  // Auto-fill signer from connected wallet
  useEffect(() => {
    if (account?.address && !domainSigners.trim()) {
      setDomainSigners(account.address);
    }
  }, [account?.address]);

  // Auto-generate DID from domain name
  const suggestedDid = useMemo(() => {
    const slug = domainName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return `did:iota:domain:${slug || "my-institution"}`;
  }, [domainName]);

  useEffect(() => {
    if (!domainDid.trim() && domainName.trim()) {
      setDomainDid(suggestedDid);
    }
  }, [suggestedDid]);

  // Auto-generate schema DID from credential type
  const suggestedSchemaDid = useMemo(() => {
    const slug = credType.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return `did:iota:schema:${slug || "my-credential"}`;
  }, [credType]);

  useEffect(() => {
    if (!did.trim() && credType.trim()) {
      setDid(suggestedSchemaDid);
    }
  }, [suggestedSchemaDid]);

  // Read pending AA proposal params
  useEffect(() => {
    const pendingDomain = localStorage.getItem("passapawn:pending_aa_domain_id");
    const pendingProposal = localStorage.getItem("passapawn:pending_aa_proposal_id");
    if (pendingDomain) {
      setDomainId(pendingDomain);
      localStorage.removeItem("passapawn:pending_aa_domain_id");
    }
    if (pendingProposal) {
      setProposalId(pendingProposal);
      setLastProposalId(pendingProposal);
      setShowAdvancedFlow(true);
      localStorage.removeItem("passapawn:pending_aa_proposal_id");
    }
  }, []);

  const domainDidValid = !domainDid.trim() || DID_PATTERN.test(domainDid.trim());
  const templateDidValid = !did.trim() || DID_PATTERN.test(did.trim());

  const run = (tx: Transaction, onDone?: (txResult: DomainTxResult) => void) => {
    setTxState("waiting_wallet");
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async ({ digest }) => {
          setTxState("pending_chain");
          try {
            const txResult = (await client.waitForTransaction({
              digest,
              options: { showObjectChanges: true, showEvents: true },
            })) as DomainTxResult;

            const changes = txResult.objectChanges ?? [];
            for (const change of changes) {
              if (change.type !== "created" || !change.objectId) continue;
              const typ = change.objectType ?? "";
              if (typ.includes("CredentialDomain")) {
                setFlowValue("lastDomainId", change.objectId);
                setDomainId(change.objectId);
              }
              if (typ.includes("DomainAdminCap")) {
                setFlowValue("lastDomainCapId", change.objectId);
                setDomainCapId(change.objectId);
              }
              if (typ.includes("Template") || typ.includes("FieldSchema")) {
                setFlowValue("lastTemplateId", change.objectId);
              }
            }

            onDone?.(txResult);
            setTxState("success");
            setResult(`Done: ${digest}`);
            setTimeout(() => setTxState("idle"), 1200);
          } catch (e) {
            setTxState("failure");
            setResult(e instanceof Error ? e.message : String(e));
          }
        },
        onError: (error) => {
          setTxState("failure");
          setResult(error.message);
        },
      },
    );
  };

  const createDomain = () => {
    if (!domainName.trim() || !domainDid.trim()) return setResult("Domain name and DID required");
    if (!DID_PATTERN.test(domainDid.trim())) return setResult("Domain DID format invalid");

    const signers = domainSigners.split(",").map((v) => v.trim()).filter(Boolean);
    if (!signers.length) return setResult("At least one signer address is required");

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::create_domain`,
      arguments: [
        tx.pure.string(domainName.trim()),
        tx.pure.string(domainDesc.trim()),
        tx.pure.string(domainDid.trim()),
        tx.pure.vector("address", signers),
        tx.pure.u64(BigInt(Number(domainThreshold || "1"))),
      ],
    });

    run(tx, (txResult) => {
      onStepCompleted?.(1);
      // Extract created domain object ID and auto-create DID
      const changes = txResult.objectChanges ?? [];
      const domainObj = changes.find(
        (c) => c.type === "created" && c.objectType?.includes("CredentialDomain"),
      );
      if (domainObj?.objectId && account?.address) {
        createDid({
          domain_object_id: domainObj.objectId,
          controller_address: account.address,
          domain_name: domainName.trim(),
        })
          .then((doc) => {
            setGeneratedDid(doc.id);
            setDomainDid(doc.id);
            setResult(`Domain created! DID: ${doc.id}`);
          })
          .catch((err) => {
            console.warn("DID creation failed (non-blocking):", err);
            setResult("Domain created! (DID auto-generation failed — you can create one later)");
          });
      } else {
        setResult("Domain created! Now publish a template below.");
      }
    });
  };

  const publishTemplateByDecree = () => {
    if (!domainId.trim() || !domainCapId.trim() || !credType.trim() || !did.trim()) {
      return setResult("Domain ID, Admin Cap, credential type and schema DID are required");
    }
    if (!DID_PATTERN.test(did.trim())) return setResult("Schema DID format invalid");

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::decree_template`,
      arguments: [
        tx.object(domainCapId.trim()),
        tx.object(domainId.trim()),
        tx.pure.string(credType.trim()),
        tx.pure.vector("string", fields.map((f) => f.name.trim())),
        tx.pure.vector("u8", fields.map((f) => f.fieldType)),
        tx.pure.vector("bool", fields.map((f) => f.required)),
        tx.pure.vector("string", fields.map((f) => f.description.trim())),
        tx.pure.vector("u64", fields.map((f) => BigInt(f.minLength))),
        tx.pure.vector("u64", fields.map((f) => BigInt(f.maxLength))),
        tx.pure.vector("u64", fields.map((f) => BigInt(f.minValue))),
        tx.pure.vector("u64", fields.map((f) => BigInt(f.maxValue))),
        tx.pure.vector("string", fields.map((f) => f.patternHint)),
        tx.pure.string(did.trim()),
        tx.pure.string("domain_admin_decree"),
        tx.pure.option("address", null),
        tx.pure.u64(BigInt(Number(version || "1"))),
      ],
    });

    run(tx, () => {
      onStepCompleted?.(2);
      setResult("Template published! You can now issue credentials.");
    });
  };

  const submitProposal = () => {
    if (!domainId.trim() || !credType.trim() || !did.trim()) return setResult("Domain ID, credential type and DID are required");
    if (!DID_PATTERN.test(did.trim())) return setResult("Schema DID format invalid");

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::submit_proposal`,
      arguments: [
        tx.object(domainId.trim()),
        tx.pure.string(credType.trim()),
        tx.pure.vector("string", fields.map((f) => f.name.trim())),
        tx.pure.vector("u8", fields.map((f) => f.fieldType)),
        tx.pure.vector("bool", fields.map((f) => f.required)),
        tx.pure.vector("string", fields.map((f) => f.description.trim())),
        tx.pure.vector("u64", fields.map((f) => BigInt(f.minLength))),
        tx.pure.vector("u64", fields.map((f) => BigInt(f.maxLength))),
        tx.pure.vector("u64", fields.map((f) => BigInt(f.minValue))),
        tx.pure.vector("u64", fields.map((f) => BigInt(f.maxValue))),
        tx.pure.vector("string", fields.map((f) => f.patternHint)),
        tx.pure.string(did.trim()),
        tx.pure.option("address", null),
      ],
    });
    run(tx, (txResult) => {
      const createdProposalId = parseProposalId(txResult.events);
      if (createdProposalId) {
        setLastProposalId(createdProposalId);
        setProposalId(createdProposalId);
        setResult(`Proposal #${createdProposalId} created. Share with other signers.`);
      } else {
        setResult("Proposal submitted. Check events for proposal_id.");
      }
    });
  };

  const approveProposal = () => {
    if (!domainId.trim() || !proposalId.trim()) return setResult("Domain ID and proposal ID are required");
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::approve_proposal`,
      arguments: [tx.object(domainId.trim()), tx.pure.u64(BigInt(Number(proposalId)))],
    });
    run(tx, () => setResult("Vote recorded."));
  };

  const publishTemplate = () => {
    if (!domainId.trim() || !proposalId.trim()) return setResult("Domain ID and proposal ID are required");
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::execute_proposal`,
      arguments: [tx.object(domainId.trim()), tx.pure.u64(BigInt(Number(proposalId))), tx.pure.u64(BigInt(Number(version || "1")))],
    });
    run(tx, () => {
      onStepCompleted?.(2);
      setResult("Template published. You can now issue credentials.");
    });
  };

  const copyProposal = async () => {
    if (!lastProposalId) return;
    await navigator.clipboard.writeText(lastProposalId);
    setProposalCopied(true);
    setTimeout(() => setProposalCopied(false), 1800);
  };

  return (
    <div className="space-y-4">
      {/* ─── Step 1: Create Domain ─── */}
      <Section
        step={1}
        done={hasDomain}
        title="Create a Credential Domain"
        subtitle={hasDomain ? `Domain: ${truncateId(domainId)}` : "Set up your institution's on-chain identity"}
        defaultOpen={!hasDomain}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Institution Name</label>
              <p className="mb-1.5 text-[11px] text-gray-500">The human-readable name for your organization</p>
              <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="e.g. PassaPawn Demo School" value={domainName} onChange={(e) => setDomainName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Description</label>
              <p className="mb-1.5 text-[11px] text-gray-500">Brief description of this credential domain</p>
              <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="e.g. Language certification authority" value={domainDesc} onChange={(e) => setDomainDesc(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Domain DID</label>
            <p className="mb-1.5 text-[11px] text-gray-500">Auto-generated from the name. You can edit it.</p>
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="did:iota:domain:..." value={domainDid} maxLength={256} onChange={(e) => setDomainDid(normalizeDidInput(e.target.value))} />
              {domainDid.trim() && (
                <span className={`mt-2 text-sm ${domainDidValid ? "text-green-400" : "text-red-400"}`}>
                  {domainDidValid ? "✓" : "✗"}
                </span>
              )}
            </div>
            {domainDid.trim() && !domainDidValid && (
              <p className="mt-1 text-xs text-red-400">Must follow did:method:identifier format</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Signer Addresses</label>
            <p className="mb-1.5 text-[11px] text-gray-500">
              Comma-separated wallet addresses authorized to approve templates.
              {account?.address ? " Your address was auto-filled." : ""}
            </p>
            <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="0x...,0x..." value={domainSigners} onChange={(e) => setDomainSigners(e.target.value)} />
          </div>

          <div className="flex items-end gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Approval Threshold</label>
              <p className="mb-1.5 text-[11px] text-gray-500">How many signers must approve. Use 1 for a single-admin setup.</p>
              <input type="number" min={1} className="w-24 rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500/50 focus:outline-none" value={domainThreshold} onChange={(e) => setDomainThreshold(e.target.value)} />
            </div>
            <TxButton state={txState} onClick={createDomain} className="ml-auto">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                Create Domain
              </span>
            </TxButton>
          </div>
        </div>
      </Section>

      {/* ─── DID Info Card ─── */}
      {generatedDid && (
        <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/10 px-5 py-3">
          <p className="text-xs font-medium text-indigo-300">IOTA Identity DID Created</p>
          <p className="mt-1 break-all text-xs text-gray-300">{generatedDid}</p>
          <a
            href={`${API_BASE}/api/v1/did/resolve/${encodeURIComponent(generatedDid)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
          >
            View DID Document <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* ─── Step 2: Publish Template ─── */}
      <Section
        step={2}
        done={Boolean(getFlowValue("lastTemplateId"))}
        title="Publish a Credential Template"
        subtitle="Define the schema for credentials your domain will issue"
        defaultOpen={hasDomain && !getFlowValue("lastTemplateId")}
      >
        <div className="space-y-4">
          {hasDomain && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800/40 bg-gray-800/20 px-3 py-2 text-xs text-gray-400">
              <span>Domain: <code className="text-gray-300">{truncateId(domainId)}</code></span>
              {hasDomainCap && <span>Admin Cap: <code className="text-gray-300">{truncateId(domainCapId)}</code></span>}
              <button className="ml-auto text-indigo-400 hover:text-indigo-300" onClick={() => {
                setDomainId(getFlowValue("lastDomainId"));
                setDomainCapId(getFlowValue("lastDomainCapId"));
              }}>
                Refresh from last tx
              </button>
            </div>
          )}

          {!hasDomain && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">Domain ID</label>
                <p className="mb-1.5 text-[11px] text-gray-500">Create a domain above first, or paste an existing ID</p>
                <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="0x..." value={domainId} onChange={(e) => setDomainId(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">DomainAdminCap ID</label>
                <p className="mb-1.5 text-[11px] text-gray-500">The admin capability object you received when creating the domain</p>
                <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="0x..." value={domainCapId} onChange={(e) => setDomainCapId(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Credential Type</label>
              <p className="mb-1.5 text-[11px] text-gray-500">e.g. B2 Language Certificate, Vaccination Record</p>
              <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="B2 Language Certificate" value={credType} onChange={(e) => setCredType(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Schema DID</label>
              <p className="mb-1.5 text-[11px] text-gray-500">Auto-generated from credential type</p>
              <div className="flex gap-2">
                <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" placeholder="did:iota:schema:..." value={did} maxLength={256} onChange={(e) => setDid(normalizeDidInput(e.target.value))} />
                {did.trim() && (
                  <span className={`mt-2 text-sm ${templateDidValid ? "text-green-400" : "text-red-400"}`}>
                    {templateDidValid ? "✓" : "✗"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Template fields */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-400">Template Fields</label>
            <p className="text-[11px] text-gray-500">Define the data schema. Each credential issued under this template will have these fields.</p>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={index} className="rounded-lg border border-gray-800/40 bg-gray-800/20">
                  <div className="flex flex-wrap items-start gap-2 p-2.5">
                    <input className="min-w-[120px] flex-1 rounded-md border border-gray-700/50 bg-gray-800/50 px-2.5 py-1.5 text-sm text-gray-100 placeholder:text-gray-600" placeholder="Field name" value={field.name} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, name: e.target.value } : it)))} />
                    <select className="rounded-md border border-gray-700/50 bg-gray-800/50 px-2 py-1.5 text-sm text-gray-100" value={field.fieldType} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, fieldType: Number(e.target.value) } : it)))}>
                      {Object.entries(FIELD_TYPE_LABELS).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                    </select>
                    <input className="min-w-[140px] flex-1 rounded-md border border-gray-700/50 bg-gray-800/50 px-2.5 py-1.5 text-sm text-gray-100 placeholder:text-gray-600" placeholder="Description (optional)" value={field.description} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, description: e.target.value } : it)))} />
                    <label className="flex items-center gap-1.5 rounded-md border border-gray-700/50 px-2 py-1.5 text-xs text-gray-300">
                      <input type="checkbox" checked={field.required} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFields((prev) => prev.map((it, i) => (i === index ? {    ...it, required: e.target.checked } : it)))} />
                      Req
                    </label>
                    <button className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-900/30 hover:text-red-400" onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))} title="Remove field">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Constraint inputs */}
                  <div className="border-t border-gray-800/30 px-2.5 pb-2.5 pt-2">
                    <p className="mb-1.5 text-[10px] font-medium text-gray-500">Constraints (optional)</p>
                    <div className="flex flex-wrap gap-2">
                      {(field.fieldType === 0 || field.fieldType === 4) && (
                        <>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] text-gray-500">Min len</label>
                            <input type="number" min={0} className="w-16 rounded border border-gray-700/50 bg-gray-800/50 px-1.5 py-1 text-xs text-gray-100" value={field.minLength || ""} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, minLength: Number(e.target.value) || 0 } : it)))} />
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] text-gray-500">Max len</label>
                            <input type="number" min={0} className="w-16 rounded border border-gray-700/50 bg-gray-800/50 px-1.5 py-1 text-xs text-gray-100" value={field.maxLength || ""} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, maxLength: Number(e.target.value) || 0 } : it)))} />
                          </div>
                        </>
                      )}
                      {field.fieldType === 1 && (
                        <>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] text-gray-500">Min val</label>
                            <input type="number" min={0} className="w-20 rounded border border-gray-700/50 bg-gray-800/50 px-1.5 py-1 text-xs text-gray-100" value={field.minValue || ""} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, minValue: Number(e.target.value) || 0 } : it)))} />
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] text-gray-500">Max val</label>
                            <input type="number" min={0} className="w-20 rounded border border-gray-700/50 bg-gray-800/50 px-1.5 py-1 text-xs text-gray-100" value={field.maxValue || ""} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, maxValue: Number(e.target.value) || 0 } : it)))} />
                          </div>
                        </>
                      )}
                      {field.fieldType === 0 && (
                        <div className="flex items-center gap-1">
                          <label className="text-[10px] text-gray-500">Pattern</label>
                          <select className="rounded border border-gray-700/50 bg-gray-800/50 px-1.5 py-1 text-xs text-gray-100" value={field.patternHint} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, patternHint: e.target.value } : it)))}>
                            {PATTERN_HINTS.map((p) => (<option key={p} value={p}>{p || "(none)"}</option>))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-700/60 px-3 py-2 text-xs text-gray-400 transition-colors hover:border-indigo-500/40 hover:text-indigo-300" onClick={() => setFields((prev) => [...prev, emptyField()])}>
              <Plus className="h-3.5 w-3.5" />
              Add field
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Template Version</label>
              <input type="number" min={1} className="w-20 rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500/50 focus:outline-none" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <TxButton state={txState} onClick={publishTemplateByDecree} className="ml-auto">
              <span className="flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Publish Template
              </span>
            </TxButton>
          </div>

          {/* Advanced: Proposal + Voting */}
          <div className="border-t border-gray-800/40 pt-3">
            <button className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300" onClick={() => setShowAdvancedFlow((v) => !v)}>
              {showAdvancedFlow ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Multi-signer proposal flow (advanced)
            </button>

            {showAdvancedFlow && (
              <div className="mt-3 space-y-3 rounded-xl border border-gray-800/40 bg-gray-800/10 p-4">
                <p className="text-xs text-gray-500">
                  Use when your domain has multiple signers. Submit a proposal, collect approvals, then execute to publish.
                </p>

                <div className="space-y-2 rounded-lg border border-gray-800/30 p-3">
                  <p className="text-xs font-medium text-gray-300">1. Submit Proposal</p>
                  <TxButton state={txState} onClick={submitProposal}>Submit Proposal</TxButton>
                  {lastProposalId && (
                    <div className="flex items-center gap-2 rounded-lg border border-green-800/40 bg-green-900/10 px-3 py-2 text-xs text-green-300">
                      Proposal #{lastProposalId}
                      <button className="rounded border border-green-700/50 px-2 py-0.5 text-[11px]" onClick={() => void copyProposal()}>
                        {proposalCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-lg border border-gray-800/30 p-3">
                  <p className="text-xs font-medium text-gray-300">2. Approve</p>
                  <p className="text-[11px] text-gray-500">Each signer approves once.</p>
                  <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600" placeholder="Proposal ID" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
                  <TxButton state={txState} onClick={approveProposal}>Approve</TxButton>
                </div>

                {(() => {
                  const aaAcctId = getFlowValue("aaAccountId");
                  const aaTh = parseInt(getFlowValue("aaThreshold") || "1");
                  const aaSc = parseInt(getFlowValue("aaSignerCount") || "1");
                  if (aaAcctId && lastProposalId && !showManualProposal) {
                    return (
                      <AaProposalSigner
                        domainId={domainId}
                        proposalId={Number(lastProposalId)}
                        templateVersion={Number(version || "1")}
                        aaAccountId={aaAcctId}
                        threshold={aaTh}
                        signerCount={aaSc}
                        onSubmitted={(digest) => {
                          onStepCompleted?.(2);
                          setFlowValue("lastTemplateId", "");
                          setResult(`Proposal executed via AA! Digest: ${digest}`);
                        }}
                        onFallbackToManual={() => setShowManualProposal(true)}
                      />
                    );
                  }
                  return null;
                })()}

                <div className="space-y-2 rounded-lg border border-gray-800/30 p-3">
                  <p className="text-xs font-medium text-gray-300">3. Execute</p>
                  <p className="text-[11px] text-gray-500">After enough approvals, execute to publish the template.</p>
                  <input className="w-full rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600" placeholder="Proposal ID" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
                  <TxButton state={txState} onClick={publishTemplate}>Execute & Publish</TxButton>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Status message */}
      {result && (
        <div className={`rounded-lg px-4 py-2.5 text-xs ${result.startsWith("Done") || result.includes("created") || result.includes("published") || result.includes("succeeded") ? "border border-green-800/40 bg-green-900/10 text-green-300" : "border border-gray-800/40 bg-gray-800/20 text-gray-400"}`}>
          {result}
        </div>
      )}

      <div className="rounded-2xl border border-amber-800/30 bg-amber-900/10">
        <div className="flex items-start gap-3 border-b border-amber-800/20 px-5 py-3">
          <span className="shrink-0 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300">
            Architecture Ready
          </span>
          <p className="text-xs text-amber-200/70">
            Account Abstraction is deployed on-chain but browser wallets do not yet support
            AA-authenticated transactions. The multisig governance module (passapawn_aa.move)
            is fully functional and will activate when wallet support arrives.
          </p>
        </div>
        <AaGovernancePanel
          onAaAccountCreated={(id, threshold, signerCount) => {
            setFlowValue("aaAccountId", id);
            setFlowValue("aaThreshold", String(threshold));
            setFlowValue("aaSignerCount", String(signerCount));
          }}
        />
      </div>
    </div>
  );
}
