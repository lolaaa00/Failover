/**
 * Opt-in live Studionet smoke test. NEVER run by default -- only invoked by
 * the `live-studionet-smoke` CI job, which itself only runs on
 * `workflow_dispatch` and only proceeds if a funded signer secret exists in
 * the runner's environment (never in the repo).
 *
 * This script deliberately contains no logic that could execute without an
 * explicit, externally-supplied signer -- there is nothing here for a
 * contributor to accidentally trigger.
 */
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { assertCanonicalNetwork, NETWORK_CONFIG } from "../lib/genlayer/network";
import { FAILOVER_REGISTRY_ADDRESS, isDeployed } from "../lib/contract/addresses";

async function main() {
  const signerKey = process.env.FAILOVER_LIVE_SIGNER_KEY;
  if (!signerKey) {
    console.log("FAILOVER_LIVE_SIGNER_KEY not set -- skipping live Studionet smoke test.");
    return;
  }

  const network = assertCanonicalNetwork({ chainId: NETWORK_CONFIG.chainId, rpcUrl: NETWORK_CONFIG.rpcUrl });
  if (!network.ok) {
    console.error("Refusing to run live smoke test against a non-canonical network:", network.problems);
    process.exitCode = 1;
    return;
  }

  if (!isDeployed(FAILOVER_REGISTRY_ADDRESS)) {
    console.log("FailoverRegistry is not deployed yet -- nothing to smoke test. See docs/DEPLOYMENT.md.");
    return;
  }

  // Read-only smoke check only -- this script intentionally never signs or
  // submits a write, even with a funded signer present, to keep opt-in CI
  // side-effect free. A real funded write-path exercise is a manual,
  // reviewed operator action documented in docs/DEPLOYMENT.md.
  const client = createClient({ chain: studionet });
  const status = await client.readContract({
    address: FAILOVER_REGISTRY_ADDRESS,
    functionName: "get_status",
    args: ["orbit-wallet"],
  });
  console.log("Live read smoke test succeeded. Status:", status);
}

main().catch((err) => {
  console.error("Live Studionet smoke test failed:", err);
  process.exitCode = 1;
});
