/**
 * Phase 2 deployment: deploy FailoverGate bound to a live FailoverRegistry
 * and an already-registered + activated project_id (see scripts/deploy.ts).
 *
 * Usage (preferred -- pass the registry address directly once phase 1 has
 * printed it, avoiding a second wait on a tx you already confirmed):
 *   FAILOVER_DEPLOYER_PRIVATE_KEY=0x... \
 *   REGISTRY_ADDRESS=0x<address from phase 1> \
 *   DEMO_PROJECT_ID=failover-demo \
 *   npx tsx scripts/deploy-gate.ts
 *
 * Legacy usage (re-derives the address from the registry deployment tx):
 *   FAILOVER_DEPLOYER_PRIVATE_KEY=0x... REGISTRY_TX=0x<tx> DEMO_PROJECT_ID=failover-demo \
 *   npx tsx scripts/deploy-gate.ts
 */
import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { NETWORK_CONFIG } from "../lib/genlayer/network";

const GATE_SOURCE_PATH = "contracts/FailoverGate.py";

function extractDeployedAddress(receipt: unknown): string | undefined {
  const r = receipt as Record<string, unknown> & { data?: Record<string, unknown> };
  return (
    (r?.contractAddress as string | undefined) ||
    (r?.data?.contract_address as string | undefined) ||
    (r?.contract_address as string | undefined)
  );
}

async function waitForFinalized(client: ReturnType<typeof createClient>, hash: `0x${string}`, label: string) {
  console.log(`\nWaiting for ${label} to reach FINALIZED (tx ${hash})...`);
  const receipt = await (
    client as unknown as {
      waitForTransactionReceipt: (args: {
        hash: `0x${string}`;
        status: string;
        interval?: number;
        retries?: number;
      }) => Promise<unknown>;
    }
  ).waitForTransactionReceipt({ hash, status: "FINALIZED", interval: 3000, retries: 60 });
  console.log(`${label} receipt:`, JSON.stringify(receipt, null, 2));
  return receipt;
}

async function main() {
  const privateKey = process.env.FAILOVER_DEPLOYER_PRIVATE_KEY;
  const registryAddressEnv = process.env.REGISTRY_ADDRESS;
  const registryTxHash = process.env.REGISTRY_TX;
  const demoProjectId = process.env.DEMO_PROJECT_ID || "failover-demo";

  if (!privateKey) { console.error("FAILOVER_DEPLOYER_PRIVATE_KEY required"); process.exit(1); }
  if (!registryAddressEnv && !registryTxHash) {
    console.error("Either REGISTRY_ADDRESS or REGISTRY_TX is required");
    process.exit(1);
  }

  const account = createAccount(privateKey as `0x${string}`);
  console.log(`Deployer: ${account.address}`);
  console.log(`Network:  chain ${NETWORK_CONFIG.chainId} / ${NETWORK_CONFIG.rpcUrl}`);

  const client = createClient({ chain: studionet, account });
  const readClient = createClient({ chain: studionet });

  let registryAddress = registryAddressEnv;
  if (!registryAddress) {
    const registryReceipt = await waitForFinalized(client, registryTxHash as `0x${string}`, "FailoverRegistry deployment");
    registryAddress = extractDeployedAddress(registryReceipt);
    if (!registryAddress) {
      console.error("Could not extract registry address from receipt. Full receipt above.");
      process.exit(1);
    }
  }

  console.log(`\nFailoverRegistry address: ${registryAddress}`);
  console.log(`Explorer: ${NETWORK_CONFIG.explorerUrl}/address/${registryAddress}`);

  // Confirm the project is actually registered + activated before binding
  // a gate to it -- fail loudly rather than deploying a gate bound to a
  // project_id that doesn't exist or isn't out of DRAFT yet.
  const projectStatus = await readClient.readContract({
    address: registryAddress as `0x${string}`,
    functionName: "get_status",
    args: [demoProjectId],
  });
  console.log(`Project "${demoProjectId}" status on registry: ${projectStatus}`);
  if (projectStatus === "DRAFT") {
    console.error(`Project "${demoProjectId}" is still DRAFT -- activate it before binding a gate to it.`);
    process.exit(1);
  }

  // Deploy FailoverGate bound to the registry and demo project ID
  console.log(`\nDeploying FailoverGate (registry=${registryAddress}, project_id=${demoProjectId})...`);
  const gateSource = readFileSync(GATE_SOURCE_PATH, "utf-8");
  const gateTx = await client.deployContract({
    code: gateSource,
    args: [registryAddress, demoProjectId],
  });
  console.log(`FailoverGate deployment tx: ${gateTx}`);

  const gateReceipt = await waitForFinalized(client, gateTx as `0x${string}`, "FailoverGate deployment");
  const gateAddress = extractDeployedAddress(gateReceipt);
  if (!gateAddress) {
    console.error("Could not extract FailoverGate address from the finalized receipt above.");
    process.exit(1);
  }

  // Confirm the gate's own immutable binding matches what we intended --
  // this is the same authoritative check the live gate page now performs
  // before it will allow any read/write to proceed.
  const linkedProject = await readClient.readContract({
    address: gateAddress as `0x${string}`,
    functionName: "get_linked_project",
    args: [],
  });
  const boundRegistry = await readClient.readContract({
    address: gateAddress as `0x${string}`,
    functionName: "get_registry_address",
    args: [],
  });
  console.log(`Gate get_linked_project():   ${linkedProject}`);
  console.log(`Gate get_registry_address(): ${boundRegistry}`);
  if (linkedProject !== demoProjectId) {
    console.error(`Deployed gate is bound to "${linkedProject}", not the intended "${demoProjectId}".`);
    process.exit(1);
  }
  if (String(boundRegistry).toLowerCase() !== String(registryAddress).toLowerCase()) {
    console.error(`Deployed gate is bound to registry ${boundRegistry}, not the intended ${registryAddress}.`);
    process.exit(1);
  }

  console.log(`\n=== DEPLOYMENT RECORD ===`);
  console.log(`FailoverRegistry address: ${registryAddress}`);
  console.log(`FailoverGate tx:          ${gateTx}`);
  console.log(`FailoverGate address:     ${gateAddress}`);
  console.log(`Bound project_id:         ${demoProjectId} (confirmed via get_linked_project())`);
  console.log(`Bound registry:           ${boundRegistry} (confirmed via get_registry_address())`);
  console.log(`Explorer (registry):      ${NETWORK_CONFIG.explorerUrl}/address/${registryAddress}`);
  console.log(`Explorer (gate):          ${NETWORK_CONFIG.explorerUrl}/address/${gateAddress}`);
  console.log(`\nSet these in Vercel dashboard (and .env.example / local .env):`);
  console.log(`  NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`  NEXT_PUBLIC_FAILOVER_GATE_ADDRESS=${gateAddress}`);
}

main().catch((err) => {
  console.error("deploy-gate failed:", err);
  process.exit(1);
});
