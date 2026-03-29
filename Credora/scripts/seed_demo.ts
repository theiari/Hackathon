import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";

const RPC = process.env.IOTA_RPC_URL ?? "https://api.devnet.iota.cafe";
const PACKAGE_ID =
  process.env.VITE_IOTA_DEVNET_PACKAGE_ID ??
  "0xbc6b8d122ab9b277e9ba4d1173bc62fdbdd07f2f4935f6f55327f983833b9afb";
const RUNNER_ADDRESS = process.env.DEMO_SIGNER_ADDRESS ?? "0xDEMO_SIGNER_ADDRESS";

interface SeedSummary {
  schoolDomainId: string;
  schoolTemplateId: string;
  schoolCapId: string;
  clinicDomainId: string;
  clinicTemplateId: string;
  clinicCapId: string;
}

interface TemplateFieldInput {
  name: string;
  type: number;
  required: boolean;
  description: string;
}

interface TransactionObjectChange {
  type?: string;
  objectType?: string;
  objectId?: string;
}

interface TransactionEvent {
  type?: string;
  parsedJson?: unknown;
}

function fakeId(label: string) {
  const body = Buffer.from(`${label}-${Date.now()}`).toString("hex").slice(0, 62);
  return `0x${body.padEnd(62, "0")}`;
}

async function createDomainAndTemplateMock(domainLabel: string, templateLabel: string) {
  return {
    domainId: fakeId(`${domainLabel}-domain`),
    templateId: fakeId(`${templateLabel}-template`),
    capId: fakeId(`${domainLabel}-cap`),
  };
}

async function createDomainAndTemplateReal(
  client: IotaClient,
  domainName: string,
  credentialType: string,
  fields: TemplateFieldInput[],
): Promise<{ domainId: string; templateId: string; capId: string }> {
  const seedPhrase = process.env.IOTA_SEED_PHRASE;
  if (!seedPhrase) throw new Error("IOTA_SEED_PHRASE env var is required");
  const keypair = Ed25519Keypair.deriveKeypair(seedPhrase);
  const signer = keypair.getPublicKey().toIotaAddress();
  console.log(`Signer address: ${signer}`);

  const domainSlug = domainName.toLowerCase().replace(/\s+/g, "-");

  const tx1 = new Transaction();
  tx1.moveCall({
    target: `${PACKAGE_ID}::templates::create_domain`,
    arguments: [
      tx1.pure.string(domainName),
      tx1.pure.string(`${domainName} - hackathon demo`),
      tx1.pure.string(`did:iota:domain:${domainSlug}`),
      tx1.pure.vector("address", [signer]),
      tx1.pure.u64(BigInt(1)),
    ],
  });
  const r1 = await client.signAndExecuteTransaction({
    transaction: tx1,
    signer: keypair,
    options: { showObjectChanges: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: r1.digest });

  const changes1 = (r1.objectChanges ?? []) as TransactionObjectChange[];
  const capChange = changes1.find(
    (c) => c.type === "created" && typeof c.objectType === "string" && c.objectType.includes("DomainAdminCap"),
  );
  if (!capChange?.objectId) throw new Error("DomainAdminCap not found in tx1");
  const capId = capChange.objectId;

  const domainChange = changes1.find(
    (c) => c.type === "created" && typeof c.objectType === "string" && c.objectType.includes("CredentialDomain"),
  );
  if (!domainChange?.objectId) throw new Error("CredentialDomain not found in tx1");
  const domainId = domainChange.objectId;

  console.log(`  Created domain: ${domainId}`);
  console.log(`  DomainAdminCap: ${capId}`);

  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${PACKAGE_ID}::templates::submit_proposal`,
    arguments: [
      tx2.object(domainId),
      tx2.pure.string(credentialType),
      tx2.pure.vector("string", fields.map((f) => f.name)),
      tx2.pure.vector("u8", fields.map((f) => f.type)),
      tx2.pure.vector("bool", fields.map((f) => f.required)),
      tx2.pure.vector("string", fields.map((f) => f.description)),
      tx2.pure.string(`did:iota:domain:${domainSlug}`),
      tx2.pure.option("address", null),
    ],
  });
  const r2 = await client.signAndExecuteTransaction({
    transaction: tx2,
    signer: keypair,
    options: { showEvents: true },
  });
  await client.waitForTransaction({ digest: r2.digest });

  const events2 = (r2.events ?? []) as TransactionEvent[];
  const proposalEvent = events2.find((e) => typeof e.type === "string" && e.type.includes("ProposalCreated"));
  const proposalRaw = (proposalEvent?.parsedJson as { proposal_id?: number | string } | undefined)?.proposal_id;
  const proposalId =
    typeof proposalRaw === "string"
      ? Number.parseInt(proposalRaw, 10)
      : typeof proposalRaw === "number"
        ? proposalRaw
        : NaN;
  if (!Number.isFinite(proposalId)) {
    throw new Error("ProposalCreated event not found in tx2");
  }
  console.log(`  Proposal ID: ${proposalId}`);

  const tx3 = new Transaction();
  tx3.moveCall({
    target: `${PACKAGE_ID}::templates::approve_proposal`,
    arguments: [tx3.object(domainId), tx3.pure.u64(BigInt(proposalId))],
  });
  const r3 = await client.signAndExecuteTransaction({
    transaction: tx3,
    signer: keypair,
    options: { showEvents: true },
  });
  await client.waitForTransaction({ digest: r3.digest });

  const tx4 = new Transaction();
  tx4.moveCall({
    target: `${PACKAGE_ID}::templates::execute_proposal`,
    arguments: [tx4.object(domainId), tx4.pure.u64(BigInt(proposalId)), tx4.pure.u64(BigInt(1))],
  });
  const r4 = await client.signAndExecuteTransaction({
    transaction: tx4,
    signer: keypair,
    options: { showObjectChanges: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: r4.digest });

  const events4 = (r4.events ?? []) as TransactionEvent[];
  const templateEvent = events4.find((e) => typeof e.type === "string" && e.type.includes("TemplatePublished"));
  const templateId = (templateEvent?.parsedJson as { template_id?: string } | undefined)?.template_id ?? "";
  if (!templateId) throw new Error("TemplatePublished event not found in tx4");
  console.log(`  Template ID: ${templateId}`);

  return { domainId, templateId, capId };
}

async function run(): Promise<void> {
  const client = new IotaClient({ url: RPC });
  const checkpoint = await client.getLatestCheckpointSequenceNumber();
  console.log(`Connected to IOTA devnet (${RPC}), latest checkpoint: ${checkpoint}`);

  const useRealTx = process.env.ENABLE_REAL_TX === "true";
  const schoolFields: TemplateFieldInput[] = [
    { name: "student_name", type: 0, required: true, description: "Full name of the student" },
    { name: "exam_date", type: 0, required: true, description: "Date of examination (YYYY-MM-DD)" },
    { name: "score", type: 1, required: true, description: "Exam score (numeric)" },
  ];
  const clinicFields: TemplateFieldInput[] = [
    { name: "animal_name", type: 0, required: true, description: "Name of the animal" },
    { name: "vaccine_type", type: 0, required: true, description: "Vaccine product name" },
    { name: "vet_address", type: 3, required: true, description: "Wallet address of the vet" },
  ];

  const school = useRealTx
    ? await createDomainAndTemplateReal(client, "Credora Demo School", "B2 Language Certificate", schoolFields)
    : await createDomainAndTemplateMock("school", "b2cert");

  const clinic = useRealTx
    ? await createDomainAndTemplateReal(client, "Credora Demo Clinic", "Vaccination Record", clinicFields)
    : await createDomainAndTemplateMock("clinic", "vaccination");

  const keypair = useRealTx && process.env.IOTA_SEED_PHRASE
    ? Ed25519Keypair.deriveKeypair(process.env.IOTA_SEED_PHRASE)
    : undefined;

  const summary: SeedSummary = {
    schoolDomainId: school.domainId,
    schoolTemplateId: school.templateId,
    schoolCapId: school.capId,
    clinicDomainId: clinic.domainId,
    clinicTemplateId: clinic.templateId,
    clinicCapId: clinic.capId,
  };

  console.log("\n=== Demo Seed Summary ===");
  console.log(`Runner address: ${RUNNER_ADDRESS}`);
  console.log(`Package ID: ${PACKAGE_ID}`);
  console.log(`School domain: ${summary.schoolDomainId}`);
  console.log(`School template: ${summary.schoolTemplateId}`);
  console.log(`School cap: ${summary.schoolCapId}`);
  console.log(`Clinic domain: ${summary.clinicDomainId}`);
  console.log(`Clinic template: ${summary.clinicTemplateId}`);
  console.log(`Clinic cap: ${summary.clinicCapId}`);
  console.log("\nRecommended .env values:");
  console.log(`TRUST_ACCEPTED_DOMAINS=${summary.schoolDomainId},${summary.clinicDomainId}`);
  console.log(`TRUST_ACCEPTED_TEMPLATE_VERSIONS=1`);
  console.log(`VITE_IOTA_DEVNET_PACKAGE_ID=${PACKAGE_ID}`);
  console.log(`DEMO_SIGNER_ADDRESS=${keypair?.getPublicKey().toIotaAddress() ?? RUNNER_ADDRESS}`);
  console.log("\nNote: This script is a hackathon demo utility, not production provisioning.");
}

run().catch((error) => {
  console.error("seed_demo failed:", error);
  process.exit(1);
});
