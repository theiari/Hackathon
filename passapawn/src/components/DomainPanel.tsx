import { useIotaClient, useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { useMemo, useState } from "react";
import { getFlowValue, setFlowValue } from "../flowState";
import { FieldHelp } from "./FieldHelp";
import { TxButton, type TxState } from "./TxButton";

interface FieldInput {
  name: string;
  fieldType: number;
  required: boolean;
  description: string;
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
const DID_PATTERN = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+(:[a-zA-Z0-9._:%-]+)*$/;

function emptyField(): FieldInput {
  return { name: "", fieldType: 0, required: true, description: "" };
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

export function DomainPanel({
  packageId,
  onStepCompleted,
}: {
  packageId: string;
  onStepCompleted?: (step: 1 | 2) => void;
}) {
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [txState, setTxState] = useState<TxState>("idle");
  const [result, setResult] = useState("Ready");

  const [domainName, setDomainName] = useState("");
  const [domainDesc, setDomainDesc] = useState("");
  const [domainDid, setDomainDid] = useState("did:iota:domain:passapawn-school");
  const [domainSigners, setDomainSigners] = useState("");
  const [domainThreshold, setDomainThreshold] = useState("1");
  const [domainCapId, setDomainCapId] = useState(getFlowValue("lastDomainCapId"));

  const [domainId, setDomainId] = useState(getFlowValue("lastDomainId"));
  const [credType, setCredType] = useState("");
  const [did, setDid] = useState("did:iota:schema:passapawn");
  const [fields, setFields] = useState<FieldInput[]>([emptyField()]);
  const [proposalId, setProposalId] = useState("");
  const [lastProposalId, setLastProposalId] = useState("");
  const [version, setVersion] = useState("1");
  const [showAdvancedFlow, setShowAdvancedFlow] = useState(false);
  const [proposalCopied, setProposalCopied] = useState(false);

  const hasLastDomain = useMemo(() => Boolean(getFlowValue("lastDomainId")), [result]);
  const hasLastDomainCap = useMemo(() => Boolean(getFlowValue("lastDomainCapId")), [result]);

  const suggestedDomainDid = useMemo(() => {
    const slug = domainName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return `did:iota:domain:${slug || "example-domain"}`;
  }, [domainName]);

  const domainDidValid = domainDid.trim().length === 0 || DID_PATTERN.test(domainDid.trim());
  const templateDidValid = did.trim().length === 0 || DID_PATTERN.test(did.trim());

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
              }
              if (typ.includes("DomainAdminCap")) {
                setFlowValue("lastDomainCapId", change.objectId);
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
    if (!DID_PATTERN.test(domainDid.trim())) return setResult("Domain DID must follow did:method:identifier format");

    const signers = domainSigners
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!signers.length) return setResult("Signer list is required");

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

    run(tx, () => {
      onStepCompleted?.(1);
      setResult("Create domain succeeded. Next: publish a template.");
    });
  };

  const publishTemplateByDecree = () => {
    if (!domainId.trim() || !domainCapId.trim() || !credType.trim() || !did.trim()) {
      return setResult("Domain ID, DomainAdminCap ID, credential type and schema DID are required");
    }
    if (!DID_PATTERN.test(did.trim())) return setResult("Schema DID must follow did:method:identifier format");

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
        tx.pure.string(did.trim()),
        tx.pure.string("domain_admin_decree"),
        tx.pure.option("address", null),
        tx.pure.u64(BigInt(Number(version || "1"))),
      ],
    });

    run(tx, () => {
      onStepCompleted?.(2);
      setResult("Template published by decree. Getting Started step advanced.");
    });
  };

  const submitProposal = () => {
    if (!domainId.trim() || !credType.trim() || !did.trim()) return setResult("Domain id, credential type and DID are required");
    if (!DID_PATTERN.test(did.trim())) return setResult("Schema DID must follow did:method:identifier format");

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
        tx.pure.string(did.trim()),
        tx.pure.option("address", null),
      ],
    });
    run(tx, (txResult) => {
      const createdProposalId = parseProposalId(txResult.events);
      if (createdProposalId) {
        setLastProposalId(createdProposalId);
        setProposalId(createdProposalId);
        setResult(`Proposal created. Proposal ID: ${createdProposalId}. Share this number with other signers so they can call Approve.`);
      } else {
        setResult("Proposal submitted. Read wallet events for proposal_id, then continue with approve/execute.");
      }
    });
  };

  const approveProposal = () => {
    if (!domainId.trim() || !proposalId.trim()) return setResult("Domain id and proposal id are required");
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::approve_proposal`,
      arguments: [tx.object(domainId.trim()), tx.pure.u64(BigInt(Number(proposalId)))],
    });
    run(tx, () => setResult("Proposal vote succeeded."));
  };

  const publishTemplate = () => {
    if (!domainId.trim() || !proposalId.trim()) return setResult("Domain id and proposal id are required");
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::execute_proposal`,
      arguments: [tx.object(domainId.trim()), tx.pure.u64(BigInt(Number(proposalId))), tx.pure.u64(BigInt(Number(version || "1")))],
    });
    run(tx, () => {
      onStepCompleted?.(2);
      setResult("Template publish succeeded. Next: issue a credential.");
    });
  };

  const copyProposal = async () => {
    if (!lastProposalId) return;
    await navigator.clipboard.writeText(lastProposalId);
    setProposalCopied(true);
    setTimeout(() => setProposalCopied(false), 1800);
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <h3 className="text-xl font-semibold text-white">Domain and Template Governance</h3>
      <p className="mb-4 mt-1 text-sm text-gray-400">Create domain, then publish templates using decree (fast) or proposal voting (advanced).</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-indigo-300">Create Domain</h4>
          <label className="block text-xs text-gray-300">Name <FieldHelp text="Free text - the human name of your institution." example="PassaPawn Demo School" /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Domain name" value={domainName} onChange={(e) => setDomainName(e.target.value)} />
          <label className="block text-xs text-gray-300">Description <FieldHelp text="Free text - short description of this credential domain." /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Description" value={domainDesc} onChange={(e) => setDomainDesc(e.target.value)} />

          <div className="flex items-center justify-between text-xs text-gray-300">
            <label>
              Schema Authority DID <FieldHelp text="A DID identifying your domain's authority." example="did:iota:domain:passapawn-school" />
            </label>
            <span className="text-[11px] text-gray-400">{domainDid.length}/256</span>
          </div>
          <div className="flex gap-2">
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100"
              placeholder="did:iota:domain:..."
              value={domainDid}
              maxLength={256}
              onChange={(e) => setDomainDid(normalizeDidInput(e.target.value))}
            />
            <span className={`mt-2 text-sm ${domainDid.trim() ? (domainDidValid ? "text-green-400" : "text-red-400") : "text-gray-500"}`}>
              {domainDid.trim() ? (domainDidValid ? "✓" : "✗") : ""}
            </span>
          </div>
          {!domainDid.trim() && (
            <button
              className="rounded-full border border-gray-700 bg-gray-800/70 px-3 py-1 text-xs text-gray-300"
              onClick={() => setDomainDid(suggestedDomainDid)}
            >
              Generate from domain name →
            </button>
          )}
          {!domainDid.trim() && (
            <p className="text-xs text-gray-500">{suggestedDomainDid}</p>
          )}
          {domainDid.trim() && !domainDidValid && (
            <p className="text-xs text-red-300">
              Must follow the format: did:method:identifier e.g. did:iota:0xabc123... or did:web:example.org
            </p>
          )}

          <label className="block text-xs text-gray-300">Signers <FieldHelp text="Comma-separated IOTA wallet addresses who can approve templates. Use your own connected wallet address for demos." /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Signers: 0x...,0x..." value={domainSigners} onChange={(e) => setDomainSigners(e.target.value)} />
          <label className="block text-xs text-gray-300">Threshold <FieldHelp text="Minimum approvals needed to publish a template. Use 1 for demos (single-signer)." /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Threshold" value={domainThreshold} onChange={(e) => setDomainThreshold(e.target.value)} />
          <TxButton state={txState} onClick={createDomain}>Create Domain</TxButton>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-indigo-300">Quick Publish - Decree <span className="rounded bg-indigo-900/50 px-2 py-0.5 text-[10px] text-indigo-200">No voting required</span></h4>
          <p className="text-xs text-gray-400">
            Immediately publish a template as domain admin. Use for new domains or when no multi-signer governance is needed.
          </p>
          <label className="block text-xs text-gray-300">Domain ID <FieldHelp text="The ID of the domain you created. Click 'Use last' to fill automatically." /></label>
          <div className="flex gap-2">
            <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Domain ID" value={domainId} onChange={(e) => setDomainId(e.target.value)} />
            <button disabled={!hasLastDomain} title={hasLastDomain ? "" : "No recent value"} className="rounded border border-gray-600 px-2 text-xs text-indigo-300 disabled:opacity-50" onClick={() => setDomainId(getFlowValue("lastDomainId"))}>Use last</button>
          </div>

          <label className="block text-xs text-gray-300">DomainAdminCap ID <FieldHelp text="Required for decree publishing." /></label>
          <div className="flex gap-2">
            <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="DomainAdminCap ID" value={domainCapId} onChange={(e) => setDomainCapId(e.target.value)} />
            <button disabled={!hasLastDomainCap} title={hasLastDomainCap ? "" : "No recent value"} className="rounded border border-gray-600 px-2 text-xs text-indigo-300 disabled:opacity-50" onClick={() => setDomainCapId(getFlowValue("lastDomainCapId"))}>Use last</button>
          </div>

          <label className="block text-xs text-gray-300">Credential Type <FieldHelp text="Free text - the type of credential this template defines." example="B2 Language Certificate" /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Credential type" value={credType} onChange={(e) => setCredType(e.target.value)} />

          <div className="flex items-center justify-between text-xs text-gray-300">
            <span>Schema DID</span>
            <span className="text-[11px] text-gray-400">{did.length}/256</span>
          </div>
          <div className="flex gap-2">
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100"
              placeholder="did:iota:schema:..."
              value={did}
              maxLength={256}
              onChange={(e) => setDid(normalizeDidInput(e.target.value))}
            />
            <span className={`mt-2 text-sm ${did.trim() ? (templateDidValid ? "text-green-400" : "text-red-400") : "text-gray-500"}`}>
              {did.trim() ? (templateDidValid ? "✓" : "✗") : ""}
            </span>
          </div>
          {did.trim() && !templateDidValid && (
            <p className="text-xs text-red-300">
              Must follow the format: did:method:identifier e.g. did:iota:0xabc123... or did:web:example.org
            </p>
          )}

          {fields.map((field, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-5">
              <input className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Field" value={field.name} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, name: e.target.value } : it)))} />
              <select className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" value={field.fieldType} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, fieldType: Number(e.target.value) } : it)))}>
                {Object.entries(FIELD_TYPE_LABELS).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
              </select>
              <input className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Description" value={field.description} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, description: e.target.value } : it)))} />
              <label className="flex items-center justify-center gap-2 rounded-lg border border-gray-700 px-2 py-2 text-xs text-gray-200">
                <input type="checkbox" checked={field.required} onChange={(e) => setFields((prev) => prev.map((it, i) => (i === index ? { ...it, required: e.target.checked } : it)))} />
                Required
              </label>
              <button className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300" onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}>Remove</button>
            </div>
          ))}
          <button className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300" onClick={() => setFields((prev) => [...prev, emptyField()])}>+ Add Field</button>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-300">Template version</label>
            <input className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="1" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>

          <TxButton state={txState} onClick={publishTemplateByDecree}>Publish Template (Decree) →</TxButton>

          <button className="pt-2 text-xs text-gray-400 underline" onClick={() => setShowAdvancedFlow((v) => !v)}>
            Use Proposal + Voting instead ▾
          </button>

          {showAdvancedFlow && (
            <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
              <h5 className="text-sm font-semibold text-gray-100">Multi-Signer Proposal Flow</h5>
              <div className="rounded border border-blue-800/60 bg-blue-900/20 p-2 text-xs text-blue-100">
                Use this when your domain has multiple signers (threshold &gt; 1) or when you want an auditable on-chain governance trail.
                Each submit_proposal emits a ProposalCreated event with a proposal_id. All signers must approve, then execute_proposal publishes.
              </div>

              <div className="space-y-2 rounded border border-gray-800 p-2">
                <p className="text-xs font-semibold text-gray-200">1) Submit Proposal</p>
                <TxButton state={txState} onClick={submitProposal}>Submit Proposal →</TxButton>
                {lastProposalId && (
                  <div className="rounded border border-green-800/60 bg-green-900/20 p-2 text-xs text-green-100">
                    Proposal ID: <span className="font-mono">{lastProposalId}</span>
                    <button className="ml-2 rounded border border-green-700 px-2 py-1 text-[11px]" onClick={() => void copyProposal()}>
                      {proposalCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded border border-gray-800 p-2">
                <p className="text-xs font-semibold text-gray-200">2) Approve Proposal</p>
                <label className="text-xs text-gray-400">Each domain signer must approve once.</label>
                <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Proposal ID" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
                <TxButton state={txState} onClick={approveProposal}>Approve →</TxButton>
              </div>

              <div className="space-y-2 rounded border border-gray-800 p-2">
                <p className="text-xs font-semibold text-gray-200">3) Execute Proposal</p>
                <label className="text-xs text-gray-400">Run this after threshold of approvals is reached.</label>
                <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Proposal ID" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
                <TxButton state={txState} onClick={publishTemplate}>Execute (Publish) →</TxButton>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400">{result}</p>
    </div>
  );
}
