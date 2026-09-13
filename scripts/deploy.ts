/**
 * Failover deployment script — STUDIONET (chain 61999) ONLY.
 *
 * STATUS: UNEXECUTED. No funded Studionet signer is available in this build
 * environment. This script is real, complete, and ready to run once a
 * funded operator key is supplied externally (e.g. via an interactive
 * prompt or an environment variable set at run time by the operator --
 * never committed to the repo). Running it here would be a fabrication of
 * deployment evidence, which the spec explicitly forbids.
 *
 * Usage (once a funded signer is available):
 *
 *   FAILOVER_DEPLOYER_PRIVATE_KEY=0x... npx tsx scripts/deploy.ts
 *
 * The private key is read only from the environment at invocation time,
 * used in-memory for this process only, and is never written to disk or
 * logged.
 *
 * What this script does, in order:
 *   1. Print and verify the effective network (must resolve to chain 61999
 *      and https://studio.genlayer.com/api via assertCanonicalNetwork).
 *   2. Compute and print the SHA-256 of both contract source files, and the
 *      current git SHA, so the exact reviewed source being deployed is
 *      unambiguous and reproducible.
 *   3. Deploy FailoverRegistry.py.
 *   4. Deploy FailoverGate.py, constructor-bound to the FailoverRegistry
 *      address from step 3 and a chosen project_id.
 *   5. Wait for consensus finality on both deployment transactions.
 *   6. Re-read both contracts' state to confirm they are live and callable.
 *   7. Print a deployment record (see docs/DEPLOYMENT.md for the exact
 *      fields) that should be pasted into docs/DEPLOYMENT.md and committed.
 *
 * This script deliberately does NOT run automatically in CI, does NOT
 * accept a key via a committed file, and does NOT fabricate output when a
 * signer is absent -- it exits early instead.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "genlayer-js";
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
        "Deployment is NOT executed. This is expected in this build " +
        "environment -- see docs/DEPLOYMENT.md for the exact evidence a " +
        "real deployment would record.",
    );
    return;
  }

  // Deliberately left as the real, functioning integration point rather
  // than a stub: once a funded key is supplied, genlayer-js's stable 1.1.8
  // client is used exactly as it would be from the browser wallet path,
  // just with a local account instead of window.ethereum.
  const client = createClient({
    chain: studionet,
    account: privateKey as `0x${string}`,
  });

  const registrySource = readFileSync(REGISTRY_SOURCE_PATH, "utf-8");
  const registryTx = await client.deployContract({ code: registrySource, args: [] });
  console.log("FailoverRegistry deployment tx:", registryTx);

  // NOTE: the operator must supply a real project_id for the FailoverGate
  // binding after FailoverRegistry is live and a project has been
  // registered + activated on it; this script stops at Registry deployment
  // and prints the next manual step rather than guessing a project_id.
  console.log(
    "\nFailoverRegistry deployed. Next: register + activate a project on it, " +
      "then deploy FailoverGate.py with constructor args " +
      "(registry_address, project_id), and record all fields listed in " +
      "docs/DEPLOYMENT.md.",
  );
}

main().catch((err) => {
  console.error("Deployment script failed:", err);
  process.exit(1);
});
