/**
 * Phase 2 deployment: wait for FailoverRegistry finality, then deploy FailoverGate.
 *
 * Usage:
 *   FAILOVER_DEPLOYER_PRIVATE_KEY=0x... \
 *   REGISTRY_TX=0x<tx from phase 1> \
 *   DEMO_PROJECT_ID=failover-demo \
 *   npx tsx scripts/deploy-gate.ts
 */
import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { NETWORK_CONFIG } from "../lib/genlayer/network";

const GATE_SOURCE_PATH = "contracts/FailoverGate.py";

async function main() {
  const privateKey = process.env.FAILOVER_DEPLOYER_PRIVATE_KEY;
  const registryTxHash = process.env.REGISTRY_TX;
  const demoProjectId = process.env.DEMO_PROJECT_ID || "failover-demo";

  if (!privateKey) { console.error("FAILOVER_DEPLOYER_PRIVATE_KEY required"); process.exit(1); }
  if (!registryTxHash) { console.error("REGISTRY_TX required"); process.exit(1); }

  const account = createAccount(privateKey as `0x${string}`);
  console.log(`Deployer: ${account.address}`);
  console.log(`Network:  chain ${NETWORK_CONFIG.chainId} / ${NETWORK_CONFIG.rpcUrl}`);

  const client = createClient({ chain: studionet, account });

  console.log(`\nWaiting for FailoverRegistry tx finality: ${registryTxHash}`);
  const registryReceipt = await (client as any).waitForTransactionReceipt({
    hash: registryTxHash as `0x${string}`,
    status: "ACCEPTED",
  });
  console.log("Registry receipt:", JSON.stringify(registryReceipt, null, 2));

  // Extract the deployed contract address from the receipt
  const registryAddress: string =
    registryReceipt?.contractAddress ||
    registryReceipt?.data?.contract_address ||
    registryReceipt?.contract_address;

  if (!registryAddress) {
    console.error("Could not extract registry address from receipt. Full receipt:");
    console.error(JSON.stringify(registryReceipt, null, 2));
    process.exit(1);
  }

  console.log(`\nFailoverRegistry address: ${registryAddress}`);
  console.log(`Explorer: ${NETWORK_CONFIG.explorerUrl}/address/${registryAddress}`);

  // Deploy FailoverGate bound to the registry and demo project ID
  console.log(`\nDeploying FailoverGate (registry=${registryAddress}, project_id=${demoProjectId})...`);
  const gateSource = readFileSync(GATE_SOURCE_PATH, "utf-8");
  const gateTx = await (client as any).deployContract({
    code: gateSource,
    args: [registryAddress, demoProjectId],
  });
  console.log(`FailoverGate deployment tx: ${gateTx}`);

  console.log(`\nWaiting for FailoverGate tx finality: ${gateTx}`);
  const gateReceipt = await (client as any).waitForTransactionReceipt({
    hash: gateTx as `0x${string}`,
    status: "ACCEPTED",
  });
  console.log("Gate receipt:", JSON.stringify(gateReceipt, null, 2));

  const gateAddress: string =
    gateReceipt?.contractAddress ||
    gateReceipt?.data?.contract_address ||
    gateReceipt?.contract_address;

  console.log(`\n=== DEPLOYMENT RECORD ===`);
  console.log(`FailoverRegistry tx:      ${registryTxHash}`);
  console.log(`FailoverRegistry address: ${registryAddress}`);
  console.log(`FailoverGate tx:          ${gateTx}`);
  console.log(`FailoverGate address:     ${gateAddress || "(see receipt above)"}`);
  console.log(`Bound project_id:         ${demoProjectId}`);
  console.log(`Explorer (registry):      ${NETWORK_CONFIG.explorerUrl}/address/${registryAddress}`);
  if (gateAddress) console.log(`Explorer (gate):          ${NETWORK_CONFIG.explorerUrl}/address/${gateAddress}`);
  console.log(`\nSet these in Vercel dashboard:`);
  console.log(`  NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS=${registryAddress}`);
  if (gateAddress) console.log(`  NEXT_PUBLIC_FAILOVER_GATE_ADDRESS=${gateAddress}`);
}

main().catch((err) => {
  console.error("deploy-gate failed:", err);
  process.exit(1);
});
