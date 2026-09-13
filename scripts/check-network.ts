/**
 * Automated preflight: verifies the app's production network configuration
 * resolves to the canonical Studionet values before any deployment or
 * funded write is attempted. Run with `npm run check:network`.
 */
import { NETWORK_CONFIG, assertCanonicalNetwork } from "../lib/genlayer/network";

function main() {
  console.log("Effective Failover network configuration:");
  console.log(JSON.stringify(NETWORK_CONFIG, null, 2));

  const result = assertCanonicalNetwork({
    chainId: NETWORK_CONFIG.chainId,
    rpcUrl: NETWORK_CONFIG.rpcUrl,
  });

  if (!result.ok) {
    console.error("\nNETWORK CHECK FAILED:");
    for (const problem of result.problems) {
      console.error(` - ${problem}`);
    }
    process.exit(1);
  }

  console.log("\nNetwork check passed: chain 61999 / https://studio.genlayer.com/api");
}

main();
