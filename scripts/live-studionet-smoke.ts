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
import { FAILOVER_GATE_ADDRESS, FAILOVER_REGISTRY_ADDRESS, isDeployed } from "../lib/contract/addresses";

// The bound project_id of the live deployment being smoke-tested. Must
// match the project_id actually registered/activated via scripts/deploy.ts
// and bound to FailoverGate via scripts/deploy-gate.ts -- "orbit-wallet" is
// the *fixture* demo project id used only by lib/fixtures/demoProject.ts
// for local/offline walkthroughs and was never a live project_id.
const LIVE_PROJECT_ID = process.env.DEMO_PROJECT_ID || "failover-demo";

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
    args: [LIVE_PROJECT_ID],
  });
  console.log(`Live read smoke test (registry): project "${LIVE_PROJECT_ID}" status =`, status);

  const isSafe = await client.readContract({
    address: FAILOVER_REGISTRY_ADDRESS,
    functionName: "is_safe",
    args: [LIVE_PROJECT_ID],
  });
  console.log(`Live read smoke test (registry): is_safe("${LIVE_PROJECT_ID}") =`, isSafe);

  if (isDeployed(FAILOVER_GATE_ADDRESS)) {
    // Confirm the deployed gate reads its own state from the deployed
    // registry, and is bound to the project this smoke test targets --
    // the same authoritative binding check the live /gate/[id] page now
    // enforces before allowing any read or write to proceed.
    const [gateOpen, linkedProject, boundRegistry] = await Promise.all([
      client.readContract({ address: FAILOVER_GATE_ADDRESS, functionName: "is_gate_open", args: [] }),
      client.readContract({ address: FAILOVER_GATE_ADDRESS, functionName: "get_linked_project", args: [] }),
      client.readContract({ address: FAILOVER_GATE_ADDRESS, functionName: "get_registry_address", args: [] }),
    ]);
    console.log(`Live read smoke test (gate): is_gate_open() =`, gateOpen);
    console.log(`Live read smoke test (gate): get_linked_project() =`, linkedProject);
    console.log(`Live read smoke test (gate): get_registry_address() =`, boundRegistry);

    if (linkedProject !== LIVE_PROJECT_ID) {
      console.error(
        `Gate is bound to project "${linkedProject}", not the expected "${LIVE_PROJECT_ID}" -- binding mismatch.`,
      );
      process.exitCode = 1;
      return;
    }
    if (String(boundRegistry).toLowerCase() !== String(FAILOVER_REGISTRY_ADDRESS).toLowerCase()) {
      console.error(
        `Gate is bound to registry ${boundRegistry}, not the configured ${FAILOVER_REGISTRY_ADDRESS} -- binding mismatch.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    console.log("FailoverGate is not deployed yet -- skipping gate smoke checks.");
  }

  console.log("\nLive Studionet smoke test succeeded.");
}

main().catch((err) => {
  console.error("Live Studionet smoke test failed:", err);
  process.exitCode = 1;
});
