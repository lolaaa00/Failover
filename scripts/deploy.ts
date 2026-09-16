/**
 * Failover deployment script — STUDIONET (chain 61999) ONLY.
 *
 * STATUS: this script is real and complete. It only executes writes once a
 * funded operator key is supplied externally via the environment (never
 * committed to the repo, never printed) -- otherwise it exits after the
 * preflight without fabricating any deployment evidence.
 *
 * Usage (once a funded signer is available):
 *
 *   FAILOVER_DEPLOYER_PRIVATE_KEY=0x... npx tsx scripts/deploy.ts
 *
 * The private key is read only from the environment at invocation time,
 * used in-memory for this process only, and is never written to disk or
 * logged.
 *
 * Optional overrides (defaults are chosen to match what scripts/deploy-gate.ts
 * and scripts/live-studionet-smoke.ts expect, so a bare run needs nothing else):
 *
 *   DEMO_PROJECT_ID              default: failover-demo
 *   DEMO_PROJECT_NAME            default: Failover Demo
 *   DEMO_FRONTEND_URL            default: https://failover-black.vercel.app/
 *   DEMO_RELEASE_URL             default: https://github.com/lolaaa00/Failover
 *   DEMO_INCIDENT_URL            default: https://failover-black.vercel.app/incidents
 *   DEMO_CHECK_COOLDOWN_SECONDS  default: 300 (the sealed minimum)
 *
 * What this script does, in order, waiting for real consensus finality
 * after every write and confirming success by re-reading authoritative
 * contract state (never assumed from a tx hash alone):
 *   1. Print and verify the effective network (must resolve to chain 61999
 *      and https://studio.genlayer.com/api via assertCanonicalNetwork).
 *   2. Compute and print the SHA-256 of both contract source files, and the
 *      current git SHA, so the exact reviewed source being deployed is
 *      unambiguous and reproducible.
 *   3. Deploy FailoverRegistry.py; wait for FINALIZED.
 *   4. register_project(...) on it; wait for FINALIZED; confirm via
 *      get_status() == "DRAFT".
 *   5. activate_project(...); wait for FINALIZED; confirm via
 *      get_status() == "PENDING_FIRST_CHECK".
 *   6. Print everything needed to run scripts/deploy-gate.ts next, and the
 *      full record to paste into docs/DEPLOYMENT.md.
 *
 * This script deliberately does NOT run automatically in CI, does NOT
 * accept a key via a committed file, and does NOT fabricate output when a
 * signer is absent -- it exits early instead.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { assertCanonicalNetwork, NETWORK_CONFIG } from "../lib/genlayer/network";

const REGISTRY_SOURCE_PATH = "contracts/FailoverRegistry.py";
const GATE_SOURCE_PATH = "contracts/FailoverGate.py";

function sha256File(path: string): string {
  const bytes = readFileSync(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function currentGitSha(): string {
  return execSync("git rev-parse HEAD").toString().trim();
}

function extractDeployedAddress(receipt: unknown): string | undefined {
  const r = receipt as Record<string, unknown> & { data?: Record<string, unknown> };
  return (
    (r?.contractAddress as string | undefined) ||
    (r?.data?.contract_address as string | undefined) ||
    (r?.contract_address as string | undefined)
  );
}

/** Waits for real leader/validator consensus finality on a submitted tx --
 * never treats a tx hash as success on its own. Throws if finality is
 * never reached within the retry budget. */
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
  console.log("=== Failover deployment preflight ===");
  console.log("Effective network config:", NETWORK_CONFIG);
  const check = assertCanonicalNetwork({ chainId: NETWORK_CONFIG.chainId, rpcUrl: NETWORK_CONFIG.rpcUrl });
  if (!check.ok) {
    console.error("Network preflight FAILED:", check.problems);
    process.exit(1);
  }

  const registrySha256 = sha256File(REGISTRY_SOURCE_PATH);
  const gateSha256 = sha256File(GATE_SOURCE_PATH);
  const gitSha = currentGitSha();

  console.log(`Git SHA: ${gitSha}`);
  console.log(`${REGISTRY_SOURCE_PATH} sha256: ${registrySha256}`);
  console.log(`${GATE_SOURCE_PATH} sha256: ${gateSha256}`);

  const privateKey = process.env.FAILOVER_DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.log(
      "\nNo FAILOVER_DEPLOYER_PRIVATE_KEY supplied in the environment. " +
        "Deployment is NOT executed. Set it as an environment variable at " +
        "invocation time (never commit it) and re-run this script.",
    );
    return;
  }

  const projectId = process.env.DEMO_PROJECT_ID || "failover-demo";
  const projectName = process.env.DEMO_PROJECT_NAME || "Failover Demo";
  const frontendUrl = process.env.DEMO_FRONTEND_URL || "https://failover-black.vercel.app/";
  const releaseUrl = process.env.DEMO_RELEASE_URL || "https://github.com/lolaaa00/Failover";
  const incidentUrl = process.env.DEMO_INCIDENT_URL || "https://failover-black.vercel.app/incidents";
  const cooldownSeconds = Number(process.env.DEMO_CHECK_COOLDOWN_SECONDS || 300);

  // createAccount derives the viem LocalAccount (including public address)
  // from the private key. The address is logged for the deployment record;
  // the private key itself is never logged.
  const account = createAccount(privateKey as `0x${string}`);
  console.log(`Deployer address: ${account.address}`);

  const client = createClient({ chain: studionet, account });
  const readClient = createClient({ chain: studionet });

  // --- 1. Deploy FailoverRegistry ---
  const registrySource = readFileSync(REGISTRY_SOURCE_PATH, "utf-8");
  const registryTx = await client.deployContract({ code: registrySource, args: [] });
  console.log("\nFailoverRegistry deployment tx:", registryTx);
  const registryReceipt = await waitForFinalized(client, registryTx as `0x${string}`, "FailoverRegistry deployment");
  const registryAddress = extractDeployedAddress(registryReceipt);
  if (!registryAddress) {
    console.error("Could not extract FailoverRegistry address from the finalized receipt above.");
    process.exit(1);
  }
  console.log(`FailoverRegistry address: ${registryAddress}`);
  console.log(`Explorer: ${NETWORK_CONFIG.explorerUrl}/address/${registryAddress}`);

  // --- 2. register_project ---
  const registerTx = await client.writeContract({
    address: registryAddress as `0x${string}`,
    functionName: "register_project",
    value: 0n,
    args: [projectId, projectName, frontendUrl, releaseUrl, incidentUrl, "", cooldownSeconds, "RESTRICTED", "RESTRICTED"],
  });
  console.log("\nregister_project tx:", registerTx);
  await waitForFinalized(client, registerTx as `0x${string}`, "register_project");

  const statusAfterRegister = await readClient.readContract({
    address: registryAddress as `0x${string}`,
    functionName: "get_status",
    args: [projectId],
  });
  console.log(`Status after register_project: ${statusAfterRegister}`);
  if (statusAfterRegister !== "DRAFT") {
    console.error(`register_project did not take effect as expected (expected DRAFT, got ${statusAfterRegister}).`);
    process.exit(1);
  }

  // --- 3. activate_project ---
  const activateTx = await client.writeContract({
    address: registryAddress as `0x${string}`,
    functionName: "activate_project",
    value: 0n,
    args: [projectId],
  });
  console.log("\nactivate_project tx:", activateTx);
  await waitForFinalized(client, activateTx as `0x${string}`, "activate_project");

  const statusAfterActivate = await readClient.readContract({
    address: registryAddress as `0x${string}`,
    functionName: "get_status",
    args: [projectId],
  });
  console.log(`Status after activate_project: ${statusAfterActivate}`);
  if (statusAfterActivate !== "PENDING_FIRST_CHECK") {
    console.error(
      `activate_project did not take effect as expected (expected PENDING_FIRST_CHECK, got ${statusAfterActivate}).`,
    );
    process.exit(1);
  }

  console.log(`\n=== PHASE 1 COMPLETE: FailoverRegistry deployed, project registered and activated ===`);
  console.log(`Git SHA:                    ${gitSha}`);
  console.log(`${REGISTRY_SOURCE_PATH} sha256: ${registrySha256}`);
  console.log(`${GATE_SOURCE_PATH} sha256:     ${gateSha256}`);
  console.log(`Deployer address:           ${account.address}`);
  console.log(`FailoverRegistry tx:        ${registryTx}`);
  console.log(`FailoverRegistry address:   ${registryAddress}`);
  console.log(`register_project tx:        ${registerTx}`);
  console.log(`activate_project tx:        ${activateTx}`);
  console.log(`Bound project_id:           ${projectId}`);
  console.log(`Frontend URL:               ${frontendUrl}`);
  console.log(`Release URL:                ${releaseUrl}`);
  console.log(`Incident URL:               ${incidentUrl}`);
  console.log(`Status:                     ${statusAfterActivate} (gate closed until first consensus check)`);
  console.log(
    `\nNext: deploy FailoverGate bound to this registry + project_id:\n` +
      `  FAILOVER_DEPLOYER_PRIVATE_KEY=<same key> REGISTRY_ADDRESS=${registryAddress} ` +
      `DEMO_PROJECT_ID=${projectId} npx tsx scripts/deploy-gate.ts`,
  );
}

main().catch((err) => {
  console.error("Deployment script failed:", err);
  process.exit(1);
});
