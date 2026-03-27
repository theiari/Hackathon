import { IotaClient } from "@iota/iota-sdk/client";

const RPC = process.env.IOTA_RPC_URL ?? "https://api.devnet.iota.cafe";
const PACKAGE_ID =
  process.env.VITE_IOTA_DEVNET_PACKAGE_ID ??
  "0xbc6b8d122ab9b277e9ba4d1173bc62fdbdd07f2f4935f6f55327f983833b9afb";
const RUNNER_ADDRESS = process.env.DEMO_SIGNER_ADDRESS ?? "0xDEMO_SIGNER_ADDRESS";

interface SeedSummary {
  schoolDomainId: string;
  schoolTemplateId: string;
  clinicDomainId: string;
  clinicTemplateId: string;
}

function fakeId(label: string) {
  const body = Buffer.from(`${label}-${Date.now()}`).toString("hex").slice(0, 62);
  return `0x${body.padEnd(62, "0")}`;
}

async function createDomainAndTemplateMock(domainLabel: string, templateLabel: string) {
  return {
    domainId: fakeId(`${domainLabel}-domain`),
    templateId: fakeId(`${templateLabel}-template`),
  };
}

async function createDomainAndTemplateReal(_client: IotaClient, _domainLabel: string, _templateLabel: string) {
  // TODO(iota-tx-adapter): wire real transaction signing for create_domain + submit/approve/execute_proposal.
  // Current script keeps the full output shape stable so frontend/backend demo setup can proceed in parallel.
  return createDomainAndTemplateMock(_domainLabel, _templateLabel);
}

async function run(): Promise<void> {
  const client = new IotaClient({ url: RPC });
  const checkpoint = await client.getLatestCheckpointSequenceNumber();
  console.log(`Connected to IOTA devnet (${RPC}), latest checkpoint: ${checkpoint}`);

  const useRealTx = process.env.ENABLE_REAL_TX === "true";
  const create = useRealTx ? createDomainAndTemplateReal : createDomainAndTemplateMock;

  const school = await create(client, "PassaPawn Demo School", "B2 Language Certificate");
  const clinic = await create(client, "PassaPawn Demo Clinic", "Vaccination Record");

  const summary: SeedSummary = {
    schoolDomainId: school.domainId,
    schoolTemplateId: school.templateId,
    clinicDomainId: clinic.domainId,
    clinicTemplateId: clinic.templateId,
  };

  console.log("\n=== Demo Seed Summary ===");
  console.log(`Runner address: ${RUNNER_ADDRESS}`);
  console.log(`Package ID: ${PACKAGE_ID}`);
  console.log(`School domain: ${summary.schoolDomainId}`);
  console.log(`School template: ${summary.schoolTemplateId}`);
  console.log(`Clinic domain: ${summary.clinicDomainId}`);
  console.log(`Clinic template: ${summary.clinicTemplateId}`);
  console.log("\nRecommended .env values:");
  console.log(`TRUST_ACCEPTED_DOMAINS=${summary.schoolDomainId},${summary.clinicDomainId}`);
  console.log(`TRUST_ACCEPTED_TEMPLATE_VERSIONS=1`);
  console.log(`VITE_IOTA_DEVNET_PACKAGE_ID=${PACKAGE_ID}`);
  console.log(`DEMO_SIGNER_ADDRESS=${RUNNER_ADDRESS}`);
  console.log("\nNote: This script is a hackathon demo utility, not production provisioning.");
}

run().catch((error) => {
  console.error("seed_demo failed:", error);
  process.exit(1);
});
