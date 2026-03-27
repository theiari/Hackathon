import { useIotaClient, useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { useMemo, useState } from "react";
import { getFlowValue, markStepCompleted, setFlowValue } from "../flowState";
import { FieldHelp } from "./FieldHelp";
import { TxButton, type TxState } from "./TxButton";

interface FieldInput {
  name: string;
  fieldType: number;
  required: boolean;
  description: string;
}

const FIELD_TYPE_LABELS: Record<number, string> = { 0: "String", 1: "U64", 2: "Bool", 3: "Address", 4: "Bytes" };

function emptyField(): FieldInput {
  return { name: "", fieldType: 0, required: true, description: "" };
}

export function DomainPanel({ packageId }: { packageId: string }) {
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [txState, setTxState] = useState<TxState>("idle");
  const [result, setResult] = useState("Ready");

  const [domainName, setDomainName] = useState("");
  const [domainDesc, setDomainDesc] = useState("");
  const [domainDid, setDomainDid] = useState("did:iota:domain:passapawn-school");
  const [domainSigners, setDomainSigners] = useState("");
  const [domainThreshold, setDomainThreshold] = useState("1");

  const [domainId, setDomainId] = useState(getFlowValue("lastDomainId"));
  const [credType, setCredType] = useState("");
  const [did, setDid] = useState("did:iota:schema:passapawn");
  const [fields, setFields] = useState<FieldInput[]>([emptyField()]);
  const [proposalId, setProposalId] = useState("");
  const [version, setVersion] = useState("1");

  const hasLastDomain = useMemo(() => Boolean(getFlowValue("lastDomainId")), [result]);

  const run = (tx: Transaction, onDone?: (txResult: { objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> }) => void) => {
    setTxState("waiting_wallet");
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async ({ digest }) => {
          setTxState("pending_chain");
          try {
            const txResult = await client.waitForTransaction({ digest, options: { showObjectChanges: true } });
            const changes = (txResult as { objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> }).objectChanges ?? [];
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
            onDone?.(txResult as { objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> });
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
      markStepCompleted(1);
      setResult("✓ Create domain succeeded! Next: submit and publish a template.");
    });
  };

  const submitProposal = () => {
    if (!domainId.trim() || !credType.trim() || !did.trim()) return setResult("Domain id, credential type and DID are required");
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
    run(tx, () => setResult("✓ Proposal submitted! Next: vote and publish template."));
  };

  const approveProposal = () => {
    if (!domainId.trim() || !proposalId.trim()) return setResult("Domain id and proposal id are required");
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::approve_proposal`,
      arguments: [tx.object(domainId.trim()), tx.pure.u64(BigInt(Number(proposalId)))],
    });
    run(tx, () => setResult("✓ Proposal vote succeeded!"));
  };

  const publishTemplate = () => {
    if (!domainId.trim() || !proposalId.trim()) return setResult("Domain id and proposal id are required");
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::execute_proposal`,
      arguments: [tx.object(domainId.trim()), tx.pure.u64(BigInt(Number(proposalId))), tx.pure.u64(BigInt(Number(version || "1")))],
    });
    run(tx, () => {
      markStepCompleted(2);
      setResult("✓ Template publish succeeded! Next: issue a credential.");
    });
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <h3 className="text-xl font-semibold text-white">Domain and Template Governance</h3>
      <p className="mb-4 mt-1 text-sm text-gray-400">Create domain, submit proposal, vote, and publish template.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-indigo-300">Create Domain</h4>
          <label className="block text-xs text-gray-300">Name <FieldHelp text="Free text — the human name of your institution." example="PassaPawn Demo School" /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Domain name" value={domainName} onChange={(e) => setDomainName(e.target.value)} />
          <label className="block text-xs text-gray-300">Description <FieldHelp text="Free text — short description of this credential domain." /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Description" value={domainDesc} onChange={(e) => setDomainDesc(e.target.value)} />
          <label className="block text-xs text-gray-300">Schema Authority DID <FieldHelp text="A DID identifying your domain's authority. Use any string for demo; follow did:iota: format." example="did:iota:domain:passapawn-school" /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Authority DID" value={domainDid} onChange={(e) => setDomainDid(e.target.value)} />
          <label className="block text-xs text-gray-300">Signers <FieldHelp text="Comma-separated IOTA wallet addresses who can approve templates. Use your own connected wallet address for demos." /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Signers: 0x...,0x..." value={domainSigners} onChange={(e) => setDomainSigners(e.target.value)} />
          <label className="block text-xs text-gray-300">Threshold <FieldHelp text="Minimum approvals needed to publish a template. Use 1 for demos (single-signer)." /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Threshold" value={domainThreshold} onChange={(e) => setDomainThreshold(e.target.value)} />
          <TxButton state={txState} onClick={createDomain}>Create Domain</TxButton>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-indigo-300">Template Proposal</h4>
          <label className="block text-xs text-gray-300">Domain ID <FieldHelp text="The ID of the domain you created. Click '↙ Use last' to fill automatically." /></label>
          <div className="flex gap-2">
            <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Domain ID" value={domainId} onChange={(e) => setDomainId(e.target.value)} />
            <button disabled={!hasLastDomain} title={hasLastDomain ? "" : "No recent value"} className="rounded border border-gray-600 px-2 text-xs text-indigo-300 disabled:opacity-50" onClick={() => setDomainId(getFlowValue("lastDomainId"))}>↙ Use last</button>
          </div>
          <label className="block text-xs text-gray-300">Credential Type <FieldHelp text="Free text — the type of credential this template defines." example="B2 Language Certificate" /></label>
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Credential type" value={credType} onChange={(e) => setCredType(e.target.value)} />
          <input className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Schema DID" value={did} onChange={(e) => setDid(e.target.value)} />
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
          <div className="flex flex-wrap gap-2">
            <TxButton state={txState} onClick={submitProposal}>Submit</TxButton>
            <input className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Proposal ID" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
            <TxButton state={txState} onClick={approveProposal}>Vote</TxButton>
            <input className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100" placeholder="Version" value={version} onChange={(e) => setVersion(e.target.value)} />
            <TxButton state={txState} onClick={publishTemplate}>Publish</TxButton>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400">{result}</p>
    </div>
  );
}
