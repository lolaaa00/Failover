/**
 * genlayer-js 1.1.8 client factories. Pinned exactly (not ^1.1.8) per
 * project spec. Two clients:
 *   - a read client: unsigned/ephemeral, used for all public views;
 *   - a write client: bound to the user's injected EIP-1193 wallet,
 *     created only once a wallet is connected AND on chain 61999.
 *
 * genlayer-js's actual network calls cannot be exercised in this sandbox
 * (no live Studionet node reachable from CI or this environment), but the
 * package is a real pinned dependency and these factories follow the
 * stable 1.1.8 SDK surface described in the spec.
 */
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Eip1193Provider } from "@/lib/wallet/types";

export function createReadClient() {
  return createClient({ chain: studionet });
}

export function createWriteClient(walletAddress: `0x${string}`, provider: Eip1193Provider) {
  const client = createClient({
    chain: studionet,
    account: walletAddress,
    provider,
  });
  return client;
}
