import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useIotaClient,
} from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { useNetworkVariable } from "./networkConfig";
import { useState } from "react";

const sectionStyle: React.CSSProperties = {
  border: "1px solid #444",
  borderRadius: 8,
  padding: 16,
  marginBottom: 24,
};
const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  marginBottom: 8,
  boxSizing: "border-box",
};
const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  marginRight: 8,
  cursor: "pointer",
};
const smallBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  marginLeft: 8,
  cursor: "pointer",
  fontSize: 12,
};

const FIELD_TYPE_LABELS: Record<number, string> = {
  0: "String",
  1: "U64",
  2: "Bool",
  3: "Address",
  4: "Bytes",
};

interface FieldInput {
  name: string;
  fieldType: number;
  required: boolean;
  description: string;
}

function emptyField(): FieldInput {
  return { name: "", fieldType: 0, required: true, description: "" };
}

function FieldBuilder({
  fields,
  onChange,
}: {
  fields: FieldInput[];
  onChange: (fields: FieldInput[]) => void;
}) {
  const update = (idx: number, patch: Partial<FieldInput>) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange(next);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontWeight: "bold" }}>Schema Fields</label>
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <input
            style={{ flex: 2, padding: 6 }}
            placeholder="Field name"
            value={f.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <select
            style={{ flex: 1, padding: 6 }}
            value={f.fieldType}
            onChange={(e) => update(i, { fieldType: Number(e.target.value) })}
          >
            {Object.entries(FIELD_TYPE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <label style={{ whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />{" "}
            Req
          </label>
          <input
            style={{ flex: 2, padding: 6 }}
            placeholder="Description"
            value={f.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <button
            style={smallBtnStyle}
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        style={{ ...smallBtnStyle, marginLeft: 0, marginTop: 6 }}
        onClick={() => onChange([...fields, emptyField()])}
      >
        + Add Field
      </button>
    </div>
  );
}

function StatusMessage({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p style={{ marginTop: 12, wordBreak: "break-all", fontSize: 13 }}>
      {text}
    </p>
  );
}

function App() {
  const account = useCurrentAccount();
  const client = useIotaClient();
  const packageId = useNetworkVariable("packageId");
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  // --- Section 1: Create Domain ---
  const [domainName, setDomainName] = useState("");
  const [domainDesc, setDomainDesc] = useState("");
  const [domainDid, setDomainDid] = useState("");
  const [domainSigners, setDomainSigners] = useState("");
  const [domainThreshold, setDomainThreshold] = useState("2");
  const [domainResult, setDomainResult] = useState("");

  // --- Section 2: Submit Proposal ---
  const [propDomainId, setPropDomainId] = useState("");
  const [propCredType, setPropCredType] = useState("");
  const [propFields, setPropFields] = useState<FieldInput[]>([emptyField()]);
  const [propDid, setPropDid] = useState("");
  const [propSupersedes, setPropSupersedes] = useState("");
  const [propResult, setPropResult] = useState("");

  // --- Section 3: Approve Proposal ---
  const [approveDomainId, setApproveDomainId] = useState("");
  const [approveProposalId, setApproveProposalId] = useState("");
  const [approveResult, setApproveResult] = useState("");

  // --- Section 4: Execute Proposal ---
  const [execDomainId, setExecDomainId] = useState("");
  const [execProposalId, setExecProposalId] = useState("");
  const [execVersion, setExecVersion] = useState("1");
  const [execResult, setExecResult] = useState("");

  // --- Section 5: Decree Template ---
  const [decreeCapId, setDecreeCapId] = useState("");
  const [decreeDomainId, setDecreeDomainId] = useState("");
  const [decreeCredType, setDecreeCredType] = useState("");
  const [decreeFields, setDecreeFields] = useState<FieldInput[]>([
    emptyField(),
  ]);
  const [decreeDid, setDecreeDid] = useState("");
  const [decreeLawRef, setDecreeLawRef] = useState("");
  const [decreeSupersedes, setDecreeSupersedes] = useState("");
  const [decreeVersion, setDecreeVersion] = useState("1");
  const [decreeResult, setDecreeResult] = useState("");

  // --- Handlers ---

  const createDomain = () => {
    const signers = domainSigners
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::create_domain`,
      arguments: [
        tx.pure.string(domainName),
        tx.pure.string(domainDesc),
        tx.pure.string(domainDid),
        tx.pure.vector("address", signers),
        tx.pure.u64(BigInt(domainThreshold)),
      ],
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async ({ digest }) => {
          const result = await client.waitForTransaction({
            digest,
            options: { showObjectChanges: true },
          });
          const domain = result.objectChanges?.find(
            (o) =>
              o.type === "created" &&
              o.objectType?.includes("CredentialDomain"),
          );
          const cap = result.objectChanges?.find(
            (o) =>
              o.type === "created" &&
              o.objectType?.includes("DomainAdminCap"),
          );
          const parts: string[] = [];
          if (domain && "objectId" in domain) {
            setPropDomainId(domain.objectId);
            setApproveDomainId(domain.objectId);
            setExecDomainId(domain.objectId);
            setDecreeDomainId(domain.objectId);
            parts.push(`Domain: ${domain.objectId}`);
          }
          if (cap && "objectId" in cap) {
            setDecreeCapId(cap.objectId);
            parts.push(`AdminCap: ${cap.objectId}`);
          }
          setDomainResult(parts.length ? parts.join(" | ") : `TX: ${digest}`);
        },
      },
    );
  };

  const submitProposal = () => {
    const tx = new Transaction();
    const names = propFields.map((f) => f.name);
    const types = propFields.map((f) => f.fieldType);
    const required = propFields.map((f) => f.required);
    const descs = propFields.map((f) => f.description);

    const args = [
      tx.object(propDomainId),
      tx.pure.string(propCredType),
      tx.pure.vector("string", names),
      tx.pure.vector("u8", types),
      tx.pure.vector("bool", required),
      tx.pure.vector("string", descs),
      tx.pure.string(propDid),
      propSupersedes
        ? tx.pure.option("address", propSupersedes)
        : tx.pure.option("address", null),
    ];
    tx.moveCall({
      target: `${packageId}::templates::submit_proposal`,
      arguments: args,
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: ({ digest }) => {
          setPropResult(`Proposal submitted! TX: ${digest}`);
        },
      },
    );
  };

  const approveProposal = () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::approve_proposal`,
      arguments: [
        tx.object(approveDomainId),
        tx.pure.u64(BigInt(approveProposalId)),
      ],
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: ({ digest }) => {
          setApproveResult(`Approved! TX: ${digest}`);
        },
      },
    );
  };

  const executeProposal = () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::execute_proposal`,
      arguments: [
        tx.object(execDomainId),
        tx.pure.u64(BigInt(execProposalId)),
        tx.pure.u64(BigInt(execVersion)),
      ],
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async ({ digest }) => {
          const result = await client.waitForTransaction({
            digest,
            options: { showObjectChanges: true },
          });
          const tpl = result.objectChanges?.find(
            (o) =>
              o.type === "created" &&
              o.objectType?.includes("CredentialTypeTemplate"),
          );
          setExecResult(
            tpl && "objectId" in tpl
              ? `Template created: ${tpl.objectId} | TX: ${digest}`
              : `Executed! TX: ${digest}`,
          );
        },
      },
    );
  };

  const decreeTemplate = () => {
    const tx = new Transaction();
    const names = decreeFields.map((f) => f.name);
    const types = decreeFields.map((f) => f.fieldType);
    const required = decreeFields.map((f) => f.required);
    const descs = decreeFields.map((f) => f.description);

    tx.moveCall({
      target: `${packageId}::templates::decree_template`,
      arguments: [
        tx.object(decreeCapId),
        tx.object(decreeDomainId),
        tx.pure.string(decreeCredType),
        tx.pure.vector("string", names),
        tx.pure.vector("u8", types),
        tx.pure.vector("bool", required),
        tx.pure.vector("string", descs),
        tx.pure.string(decreeDid),
        tx.pure.string(decreeLawRef),
        decreeSupersedes
          ? tx.pure.option("address", decreeSupersedes)
          : tx.pure.option("address", null),
        tx.pure.u64(BigInt(decreeVersion)),
      ],
    });
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async ({ digest }) => {
          const result = await client.waitForTransaction({
            digest,
            options: { showObjectChanges: true },
          });
          const tpl = result.objectChanges?.find(
            (o) =>
              o.type === "created" &&
              o.objectType?.includes("CredentialTypeTemplate"),
          );
          setDecreeResult(
            tpl && "objectId" in tpl
              ? `Decreed template: ${tpl.objectId} | TX: ${digest}`
              : `Decreed! TX: ${digest}`,
          );
        },
      },
    );
  };

  if (!account) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <h1>Passapawn — Credential Trust Registry</h1>
        <p>Please connect your wallet</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>Passapawn</h1>
        <ConnectButton />
      </div>

      {/* Section 1 — Create Domain */}
      <div style={sectionStyle}>
        <h2>1 — Create Credential Domain</h2>
        <input
          style={inputStyle}
          placeholder="Domain Name (e.g. libretto_di_circolazione)"
          value={domainName}
          onChange={(e) => setDomainName(e.target.value)}
        />
        <textarea
          style={{ ...inputStyle, minHeight: 50 }}
          placeholder="Description"
          value={domainDesc}
          onChange={(e) => setDomainDesc(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Schema Authority DID (e.g. did:iota:0x...)"
          value={domainDid}
          onChange={(e) => setDomainDid(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Signers (comma-separated addresses)"
          value={domainSigners}
          onChange={(e) => setDomainSigners(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Threshold (e.g. 2)"
          value={domainThreshold}
          onChange={(e) => setDomainThreshold(e.target.value)}
        />
        <button style={btnStyle} onClick={createDomain}>
          Create Domain
        </button>
        <StatusMessage text={domainResult} />
      </div>

      {/* Section 2 — Submit Proposal */}
      <div style={sectionStyle}>
        <h2>2 — Submit Schema Proposal</h2>
        <input
          style={inputStyle}
          placeholder="Domain ID"
          value={propDomainId}
          onChange={(e) => setPropDomainId(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Credential Type (e.g. battery_replacement)"
          value={propCredType}
          onChange={(e) => setPropCredType(e.target.value)}
        />
        <FieldBuilder fields={propFields} onChange={setPropFields} />
        <input
          style={inputStyle}
          placeholder="Schema Authority DID"
          value={propDid}
          onChange={(e) => setPropDid(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Supersedes Template ID (optional)"
          value={propSupersedes}
          onChange={(e) => setPropSupersedes(e.target.value)}
        />
        <button style={btnStyle} onClick={submitProposal}>
          Submit Proposal
        </button>
        <StatusMessage text={propResult} />
      </div>

      {/* Section 3 — Approve Proposal */}
      <div style={sectionStyle}>
        <h2>3 — Approve Proposal</h2>
        <input
          style={inputStyle}
          placeholder="Domain ID"
          value={approveDomainId}
          onChange={(e) => setApproveDomainId(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Proposal ID (number)"
          value={approveProposalId}
          onChange={(e) => setApproveProposalId(e.target.value)}
        />
        <button style={btnStyle} onClick={approveProposal}>
          Approve
        </button>
        <StatusMessage text={approveResult} />
      </div>

      {/* Section 4 — Execute Proposal */}
      <div style={sectionStyle}>
        <h2>4 — Execute Proposal</h2>
        <input
          style={inputStyle}
          placeholder="Domain ID"
          value={execDomainId}
          onChange={(e) => setExecDomainId(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Proposal ID (number)"
          value={execProposalId}
          onChange={(e) => setExecProposalId(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Version (e.g. 1)"
          value={execVersion}
          onChange={(e) => setExecVersion(e.target.value)}
        />
        <button style={btnStyle} onClick={executeProposal}>
          Execute
        </button>
        <StatusMessage text={execResult} />
      </div>

      {/* Section 5 — Decree Template */}
      <div style={sectionStyle}>
        <h2>5 — Decree Template (Admin Fast-Track)</h2>
        <input
          style={inputStyle}
          placeholder="DomainAdminCap ID"
          value={decreeCapId}
          onChange={(e) => setDecreeCapId(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Domain ID"
          value={decreeDomainId}
          onChange={(e) => setDecreeDomainId(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Credential Type"
          value={decreeCredType}
          onChange={(e) => setDecreeCredType(e.target.value)}
        />
        <FieldBuilder fields={decreeFields} onChange={setDecreeFields} />
        <input
          style={inputStyle}
          placeholder="Schema Authority DID"
          value={decreeDid}
          onChange={(e) => setDecreeDid(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Law Reference (e.g. EU Reg 2024/1234 Art.5)"
          value={decreeLawRef}
          onChange={(e) => setDecreeLawRef(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Supersedes Template ID (optional)"
          value={decreeSupersedes}
          onChange={(e) => setDecreeSupersedes(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Version (e.g. 1)"
          value={decreeVersion}
          onChange={(e) => setDecreeVersion(e.target.value)}
        />
        <button style={btnStyle} onClick={decreeTemplate}>
          Decree
        </button>
        <StatusMessage text={decreeResult} />
      </div>
    </div>
  );
}

export default App;
