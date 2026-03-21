import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useIotaClient,
} from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { DEFAULT_NETWORK, useNetworkVariable } from "./networkConfig";
import { useState } from "react";
import "./App.css";
import {
  createDynamicIntent,
  createLockedIntent,
  verifyOnChain,
  type TransactionIntentResponse,
} from "./notarizationApi";

const sectionStyle: React.CSSProperties = {
  border: "1px solid #2f2f35",
  borderRadius: 14,
  padding: 18,
  marginBottom: 24,
  background: "linear-gradient(180deg, #17171d 0%, #121218 100%)",
  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.25)",
};
const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  marginBottom: 8,
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1px solid #3a3a45",
  background: "#111118",
  color: "#f4f4f5",
};
const btnStyle: React.CSSProperties = {
  padding: "9px 16px",
  marginRight: 8,
  cursor: "pointer",
  borderRadius: 10,
  border: "1px solid #3f3f56",
  background: "#1f2440",
  color: "#eef1ff",
  fontWeight: 600,
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

type TxState = "idle" | "waiting_wallet" | "pending_chain" | "success" | "failure";

function formatStatus(state: TxState, message: string) {
  return `[${state}] ${message}`;
}

function normalizeObjectId(value: string) {
  return value.trim();
}

function isValidObjectId(value: string) {
  return /^0x[a-fA-F0-9]+$/.test(normalizeObjectId(value));
}

function parsePositiveInteger(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) {
    return null;
  }
  const numeric = Number(raw);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function normalizeFieldInputs(fields: FieldInput[]) {
  return fields.map((field) => ({
    ...field,
    name: field.name.trim(),
    description: field.description.trim(),
  }));
}

function formatActionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|denied|cancel/i.test(message)) {
    return `Wallet action rejected: ${message}`;
  }
  if (/network|rpc|fetch|timeout/i.test(message)) {
    return `RPC/network failure: ${message}`;
  }
  return message;
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
          className="fieldBuilderRow"
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <input
            className="fieldNameInput"
            style={{ flex: 2, padding: 6 }}
            placeholder="Field name"
            value={f.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <select
            className="fieldTypeSelect"
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
          <label className="fieldRequiredLabel" style={{ whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />{" "}
            Req
          </label>
          <input
            className="fieldDescriptionInput"
            style={{ flex: 2, padding: 6 }}
            placeholder="Description"
            value={f.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <button
            className="fieldDeleteButton"
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
    <p
      style={{
        marginTop: 12,
        wordBreak: "break-all",
        fontSize: 13,
        padding: "8px 10px",
        borderRadius: 8,
        background: "#101722",
        border: "1px solid #243145",
      }}
    >
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
  const [domainResult, setDomainResult] = useState(formatStatus("idle", "Ready"));

  // --- Section 2: Submit Proposal ---
  const [propDomainId, setPropDomainId] = useState("");
  const [propCredType, setPropCredType] = useState("");
  const [propFields, setPropFields] = useState<FieldInput[]>([emptyField()]);
  const [propDid, setPropDid] = useState("");
  const [propSupersedes, setPropSupersedes] = useState("");
  const [propResult, setPropResult] = useState(formatStatus("idle", "Ready"));

  // --- Section 3: Approve Proposal ---
  const [approveDomainId, setApproveDomainId] = useState("");
  const [approveProposalId, setApproveProposalId] = useState("");
  const [approveResult, setApproveResult] = useState(formatStatus("idle", "Ready"));

  // --- Section 4: Execute Proposal ---
  const [execDomainId, setExecDomainId] = useState("");
  const [execProposalId, setExecProposalId] = useState("");
  const [execVersion, setExecVersion] = useState("1");
  const [execResult, setExecResult] = useState(formatStatus("idle", "Ready"));

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
  const [decreeResult, setDecreeResult] = useState(formatStatus("idle", "Ready"));

  // --- Section 6: Backend + Blockchain Notarization ---
  const [notaryData, setNotaryData] = useState("");
  const [notaryDesc, setNotaryDesc] = useState("");
  const [notaryMetadata, setNotaryMetadata] = useState("");
  const [notaryDynamicMetadata, setNotaryDynamicMetadata] = useState("");
  const [notaryObjectId, setNotaryObjectId] = useState("");
  const [notaryResult, setNotaryResult] = useState(formatStatus("idle", "Ready"));

  const runTx = (
    tx: Transaction,
    setResult: (value: string) => void,
    onSuccess: (digest: string) => Promise<void> | void,
  ) => {
    setResult(formatStatus("waiting_wallet", "Confirm the transaction in your wallet."));
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async ({ digest }) => {
          setResult(formatStatus("pending_chain", `Submitted on-chain: ${digest}`));
          try {
            await onSuccess(digest);
          } catch (error) {
            setResult(formatStatus("failure", formatActionError(error)));
          }
        },
        onError: (error) => {
          setResult(formatStatus("failure", formatActionError(error)));
        },
      },
    );
  };

  // --- Handlers ---

  const executeIntent = (intent: TransactionIntentResponse, successMessage: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${intent.package_id}::${intent.target_module}::${intent.target_function}`,
      arguments: intent.arguments.map((arg) => {
        if (arg.kind === "object") {
          return tx.object(arg.object_id);
        }
        if (arg.kind === "pure_u64") {
          return tx.pure.u64(BigInt(arg.value));
        }
        return tx.pure.string(arg.value);
      }),
    });

    runTx(tx, setNotaryResult, async (digest) => {
      await client.waitForTransaction({ digest });
      setNotaryResult(formatStatus("success", `${successMessage} | TX: ${digest}`));
    });
  };

  const issueLockedViaBackend = async () => {
    try {
      if (!notaryData.trim()) {
        setNotaryResult(formatStatus("failure", "Data to notarize is required."));
        return;
      }
      const intent = await createLockedIntent({
        data: notaryData.trim(),
        payload_strategy: "hash",
        delete_lock: "none",
        immutable_description: notaryDesc.trim(),
        state_metadata: notaryMetadata.trim(),
      });
      executeIntent(intent, "Locked notarization submitted");
    } catch (error) {
      setNotaryResult(formatStatus("failure", formatActionError(error)));
    }
  };

  const issueDynamicViaBackend = async () => {
    try {
      if (!notaryData.trim()) {
        setNotaryResult(formatStatus("failure", "Data to notarize is required."));
        return;
      }
      const intent = await createDynamicIntent({
        data: notaryData.trim(),
        payload_strategy: "hash",
        transfer_lock: "none",
        immutable_description: notaryDesc.trim(),
        state_metadata: notaryMetadata.trim(),
        updatable_metadata: notaryDynamicMetadata.trim() || undefined,
      });
      executeIntent(intent, "Dynamic notarization submitted");
    } catch (error) {
      setNotaryResult(formatStatus("failure", formatActionError(error)));
    }
  };

  const verifyViaBackend = async () => {
    try {
      if (!isValidObjectId(notaryObjectId)) {
        setNotaryResult(formatStatus("failure", "Provide a valid object ID (0x...)."));
        return;
      }
      if (!notaryData.trim()) {
        setNotaryResult(formatStatus("failure", "Data to verify is required."));
        return;
      }
      setNotaryResult(formatStatus("pending_chain", "Verifying notarization on chain..."));
      const verify = await verifyOnChain(normalizeObjectId(notaryObjectId), notaryData.trim());
      setNotaryResult(
        verify.verified
          ? formatStatus("success", `Verified (${verify.status}) for ${verify.id}`)
          : formatStatus(
              "failure",
              `Verification ${verify.status} for ${verify.id}${verify.reasons.length ? ` | ${verify.reasons.join(", ")}` : ""}`,
            ),
      );
    } catch (error) {
      setNotaryResult(formatStatus("failure", formatActionError(error)));
    }
  };

  const createDomain = () => {
    try {
      if (!domainName || !domainDid || !domainSigners) {
        setDomainResult(
          formatStatus("failure", "Please fill domain name, DID and signer list."),
        );
        return;
      }

    const signers = domainSigners
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!signers.length) {
      setDomainResult(formatStatus("failure", "Add at least one signer address."));
      return;
    }

    const thresholdNumber = parsePositiveInteger(domainThreshold);
    if (thresholdNumber === null || thresholdNumber < 1) {
      setDomainResult(formatStatus("failure", "Threshold must be a positive integer."));
      return;
    }

    const invalidSigner = signers.find((signer) => !/^0x[a-fA-F0-9]+$/.test(signer));
    if (invalidSigner) {
      setDomainResult(formatStatus("failure", `Invalid signer address: ${invalidSigner}`));
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::create_domain`,
      arguments: [
        tx.pure.string(domainName.trim()),
        tx.pure.string(domainDesc.trim()),
        tx.pure.string(domainDid.trim()),
        tx.pure.vector("address", signers),
        tx.pure.u64(BigInt(thresholdNumber)),
      ],
    });
    runTx(tx, setDomainResult, async (digest) => {
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
          setDomainResult(
            formatStatus("success", parts.length ? parts.join(" | ") : `TX: ${digest}`),
          );
    });
    } catch (error) {
      setDomainResult(formatStatus("failure", formatActionError(error)));
    }
  };

  const submitProposal = () => {
    try {
    if (!propDomainId || !propCredType || !propDid) {
      setPropResult(
        formatStatus("failure", "Please provide Domain ID, Credential Type and DID."),
      );
      return;
    }

    if (!isValidObjectId(propDomainId)) {
      setPropResult(formatStatus("failure", "Domain ID must be a valid object ID (0x...)."));
      return;
    }

    const normalizedFields = normalizeFieldInputs(propFields);
    if (!normalizedFields.length || normalizedFields.some((field) => !field.name)) {
      setPropResult(
        formatStatus("failure", "Every schema field must have a non-empty name."),
      );
      return;
    }

    if (
      normalizedFields.some(
        (field) => field.fieldType < 0 || field.fieldType > 4 || !Number.isInteger(field.fieldType),
      )
    ) {
      setPropResult(formatStatus("failure", "Field types must be integers between 0 and 4."));
      return;
    }

    const supersedesId = propSupersedes.trim();
    if (supersedesId && !isValidObjectId(supersedesId)) {
      setPropResult(
        formatStatus("failure", "Supersedes Template ID must be a valid object ID (0x...)."),
      );
      return;
    }

    const tx = new Transaction();
    const names = normalizedFields.map((f) => f.name);
    const types = normalizedFields.map((f) => f.fieldType);
    const required = normalizedFields.map((f) => f.required);
    const descs = normalizedFields.map((f) => f.description);

    const args = [
      tx.object(normalizeObjectId(propDomainId)),
      tx.pure.string(propCredType.trim()),
      tx.pure.vector("string", names),
      tx.pure.vector("u8", types),
      tx.pure.vector("bool", required),
      tx.pure.vector("string", descs),
      tx.pure.string(propDid.trim()),
      supersedesId
        ? tx.pure.option("address", supersedesId)
        : tx.pure.option("address", null),
    ];
    tx.moveCall({
      target: `${packageId}::templates::submit_proposal`,
      arguments: args,
    });
    runTx(tx, setPropResult, (digest) => {
      setPropResult(formatStatus("success", `Proposal submitted! TX: ${digest}`));
    });
    } catch (error) {
      setPropResult(formatStatus("failure", formatActionError(error)));
    }
  };

  const approveProposal = () => {
    try {
    if (!approveDomainId || !approveProposalId) {
      setApproveResult(
        formatStatus("failure", "Please provide Domain ID and Proposal ID."),
      );
      return;
    }

    if (!isValidObjectId(approveDomainId)) {
      setApproveResult(
        formatStatus("failure", "Domain ID must be a valid object ID (0x...)."),
      );
      return;
    }

    const proposalId = parsePositiveInteger(approveProposalId);
    if (proposalId === null) {
      setApproveResult(formatStatus("failure", "Proposal ID must be a number."));
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::approve_proposal`,
      arguments: [
        tx.object(normalizeObjectId(approveDomainId)),
        tx.pure.u64(BigInt(proposalId)),
      ],
    });
    runTx(tx, setApproveResult, (digest) => {
      setApproveResult(formatStatus("success", `Approved! TX: ${digest}`));
    });
    } catch (error) {
      setApproveResult(formatStatus("failure", formatActionError(error)));
    }
  };

  const executeProposal = () => {
    try {
    if (!execDomainId || !execProposalId || !execVersion) {
      setExecResult(
        formatStatus("failure", "Please provide Domain ID, Proposal ID and Version."),
      );
      return;
    }

    if (!isValidObjectId(execDomainId)) {
      setExecResult(formatStatus("failure", "Domain ID must be a valid object ID (0x...)."));
      return;
    }

    const proposalId = parsePositiveInteger(execProposalId);
    const version = parsePositiveInteger(execVersion);
    if (proposalId === null || version === null || version < 1) {
      setExecResult(
        formatStatus("failure", "Proposal ID and Version must be valid positive integers."),
      );
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::templates::execute_proposal`,
      arguments: [
        tx.object(normalizeObjectId(execDomainId)),
        tx.pure.u64(BigInt(proposalId)),
        tx.pure.u64(BigInt(version)),
      ],
    });
    runTx(tx, setExecResult, async (digest) => {
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
              ? formatStatus("success", `Template created: ${tpl.objectId} | TX: ${digest}`)
              : formatStatus("success", `Executed! TX: ${digest}`),
          );
    });
    } catch (error) {
      setExecResult(formatStatus("failure", formatActionError(error)));
    }
  };

  const decreeTemplate = () => {
    try {
    if (!decreeCapId || !decreeDomainId || !decreeCredType || !decreeDid || !decreeVersion) {
      setDecreeResult(
        formatStatus(
          "failure",
          "Please provide cap, domain, credential type, DID and version.",
        ),
      );
      return;
    }

    if (!isValidObjectId(decreeCapId) || !isValidObjectId(decreeDomainId)) {
      setDecreeResult(
        formatStatus("failure", "Cap ID and Domain ID must be valid object IDs (0x...)."),
      );
      return;
    }

    const version = parsePositiveInteger(decreeVersion);
    if (version === null || version < 1) {
      setDecreeResult(formatStatus("failure", "Version must be a positive integer."));
      return;
    }

    const normalizedFields = normalizeFieldInputs(decreeFields);
    if (!normalizedFields.length || normalizedFields.some((field) => !field.name)) {
      setDecreeResult(
        formatStatus("failure", "Every schema field must have a non-empty name."),
      );
      return;
    }

    if (
      normalizedFields.some(
        (field) => field.fieldType < 0 || field.fieldType > 4 || !Number.isInteger(field.fieldType),
      )
    ) {
      setDecreeResult(formatStatus("failure", "Field types must be integers between 0 and 4."));
      return;
    }

    const supersedesId = decreeSupersedes.trim();
    if (supersedesId && !isValidObjectId(supersedesId)) {
      setDecreeResult(
        formatStatus("failure", "Supersedes Template ID must be a valid object ID (0x...)."),
      );
      return;
    }

    const tx = new Transaction();
    const names = normalizedFields.map((f) => f.name);
    const types = normalizedFields.map((f) => f.fieldType);
    const required = normalizedFields.map((f) => f.required);
    const descs = normalizedFields.map((f) => f.description);

    tx.moveCall({
      target: `${packageId}::templates::decree_template`,
      arguments: [
        tx.object(normalizeObjectId(decreeCapId)),
        tx.object(normalizeObjectId(decreeDomainId)),
        tx.pure.string(decreeCredType.trim()),
        tx.pure.vector("string", names),
        tx.pure.vector("u8", types),
        tx.pure.vector("bool", required),
        tx.pure.vector("string", descs),
        tx.pure.string(decreeDid.trim()),
        tx.pure.string(decreeLawRef.trim()),
        supersedesId
          ? tx.pure.option("address", supersedesId)
          : tx.pure.option("address", null),
        tx.pure.u64(BigInt(version)),
      ],
    });
    runTx(tx, setDecreeResult, async (digest) => {
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
              ? formatStatus("success", `Decreed template: ${tpl.objectId} | TX: ${digest}`)
              : formatStatus("success", `Decreed! TX: ${digest}`),
          );
    });
    } catch (error) {
      setDecreeResult(formatStatus("failure", formatActionError(error)));
    }
  };

  if (!account) {
    return (
      <div className="connectScreen" style={{ padding: 32, textAlign: "center" }}>
        <h1>Passapawn — Credential Trust Registry</h1>
        <p>Please connect your wallet</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div
      className="appContainer"
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: 24,
        background:
          "radial-gradient(circle at top, rgba(43,71,135,0.25) 0%, rgba(12,12,18,0.15) 40%), #0d0d12",
        minHeight: "100vh",
      }}
    >
      <div
        className="appHeader"
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
      <p className="networkInfo" style={{ marginTop: -10, marginBottom: 20, color: "#9ea7c9" }}>
        Network: {DEFAULT_NETWORK} • Package: {packageId}
      </p>

      {/* Section 1 — Create Domain */}
      <div className="appSection" style={sectionStyle}>
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
        <div className="actionRow">
          <button className="actionButton" style={btnStyle} onClick={createDomain}>
            Create Domain
          </button>
        </div>
        <StatusMessage text={domainResult} />
      </div>

      {/* Section 2 — Submit Proposal */}
      <div className="appSection" style={sectionStyle}>
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
        <div className="actionRow">
          <button className="actionButton" style={btnStyle} onClick={submitProposal}>
            Submit Proposal
          </button>
        </div>
        <StatusMessage text={propResult} />
      </div>

      {/* Section 3 — Approve Proposal */}
      <div className="appSection" style={sectionStyle}>
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
        <div className="actionRow">
          <button className="actionButton" style={btnStyle} onClick={approveProposal}>
            Approve
          </button>
        </div>
        <StatusMessage text={approveResult} />
      </div>

      {/* Section 4 — Execute Proposal */}
      <div className="appSection" style={sectionStyle}>
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
        <div className="actionRow">
          <button className="actionButton" style={btnStyle} onClick={executeProposal}>
            Execute
          </button>
        </div>
        <StatusMessage text={execResult} />
      </div>

      {/* Section 5 — Decree Template */}
      <div className="appSection" style={sectionStyle}>
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
        <div className="actionRow">
          <button className="actionButton" style={btnStyle} onClick={decreeTemplate}>
            Decree
          </button>
        </div>
        <StatusMessage text={decreeResult} />
      </div>

      {/* Section 6 — Backend + Blockchain */}
      <div className="appSection" style={sectionStyle}>
        <h2>6 — Notarization (Backend + Blockchain)</h2>
        <p style={{ marginTop: -6, color: "#9ea7c9", fontSize: 13 }}>
          Privacy default: notarization intents use hash-first payload strategy; avoid raw personal or medical data.
        </p>
        <input
          style={inputStyle}
          placeholder="Data to notarize"
          value={notaryData}
          onChange={(e) => setNotaryData(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Immutable Description"
          value={notaryDesc}
          onChange={(e) => setNotaryDesc(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="State Metadata"
          value={notaryMetadata}
          onChange={(e) => setNotaryMetadata(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Dynamic Metadata (optional)"
          value={notaryDynamicMetadata}
          onChange={(e) => setNotaryDynamicMetadata(e.target.value)}
        />
        <div className="actionRow">
          <button className="actionButton" style={btnStyle} onClick={issueLockedViaBackend}>
            Issue Locked
          </button>
          <button className="actionButton" style={btnStyle} onClick={issueDynamicViaBackend}>
            Issue Dynamic
          </button>
        </div>

        <input
          style={{ ...inputStyle, marginTop: 12 }}
          placeholder="On-chain Object ID to verify"
          value={notaryObjectId}
          onChange={(e) => setNotaryObjectId(e.target.value)}
        />
        <div className="actionRow">
          <button className="actionButton" style={btnStyle} onClick={verifyViaBackend}>
            Verify On-Chain
          </button>
        </div>
        <StatusMessage text={notaryResult} />
      </div>
    </div>
  );
}

export default App;
