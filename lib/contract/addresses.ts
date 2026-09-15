/**
 * Deployed contract addresses on Studionet.
 *
 * NOT YET DEPLOYED: no funded Studionet signer is available in this build
 * environment (see docs/DEPLOYMENT.md). These are left as empty strings
 * rather than fabricated addresses; the app's demo mode (lib/fixtures)
 * lets a reviewer walk the full lifecycle without a live deployment.
 */
export const FAILOVER_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS ??
  "") as `0x${string}` | "";

export const FAILOVER_GATE_ADDRESS = (process.env.NEXT_PUBLIC_FAILOVER_GATE_ADDRESS ?? "") as
  | `0x${string}`
  | "";

export function isDeployed(address: string): address is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}
