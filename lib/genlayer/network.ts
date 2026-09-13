/**
 * Single source of truth for the canonical Failover network configuration.
 * Every place in the app that needs chain id / RPC / explorer resolves
 * through this module -- nothing hardcodes these values elsewhere.
 *
 * Canonical target: GenLayer Studionet only.
 *   Chain ID: 61999
 *   RPC:      https://studio.genlayer.com/api
 *   Explorer: https://explorer-studio.genlayer.com
 *   Currency: GEN
 *
 * This file is covered by an automated check (scripts/check-network.ts and
 * tests/frontend/network.test.ts) that fails the build if these values ever
 * drift to 61997 / studio-dev / localnet.
 */

export const STUDIONET_CHAIN_ID = 61999 as const;
export const STUDIONET_RPC_URL = "https://studio.genlayer.com/api" as const;
export const STUDIONET_EXPLORER_URL = "https://explorer-studio.genlayer.com" as const;
export const STUDIONET_CURRENCY_SYMBOL = "GEN" as const;

export const NETWORK_CONFIG = {
  chainId: STUDIONET_CHAIN_ID,
  rpcUrl: STUDIONET_RPC_URL,
  explorerUrl: STUDIONET_EXPLORER_URL,
  currencySymbol: STUDIONET_CURRENCY_SYMBOL,
  name: "GenLayer Studionet",
} as const;

export type NetworkConfig = typeof NETWORK_CONFIG;

/** Forbidden network fingerprints this app must never resolve to. */
const FORBIDDEN_CHAIN_IDS = [61997] as const;
const FORBIDDEN_RPC_SUBSTRINGS = ["studio-dev", "studiodevnet", "localnet", "localhost", "127.0.0.1"];

export interface NetworkAssertionResult {
  ok: boolean;
  problems: string[];
}

/**
 * Asserts the effective (possibly runtime-detected) network resolves to the
 * canonical Studionet configuration. Call this before any funded write and
 * in CI as a static preflight.
 */
export function assertCanonicalNetwork(effective: {
  chainId: number;
  rpcUrl: string;
}): NetworkAssertionResult {
  const problems: string[] = [];

  if (effective.chainId !== STUDIONET_CHAIN_ID) {
    problems.push(
      `chainId ${effective.chainId} does not match canonical Studionet chain ${STUDIONET_CHAIN_ID}`,
    );
  }
  if (FORBIDDEN_CHAIN_IDS.includes(effective.chainId as (typeof FORBIDDEN_CHAIN_IDS)[number])) {
    problems.push(`chainId ${effective.chainId} is an explicitly forbidden non-canonical network`);
  }
  const rpcLower = effective.rpcUrl.toLowerCase();
  if (rpcLower !== STUDIONET_RPC_URL) {
    problems.push(`rpcUrl "${effective.rpcUrl}" does not match canonical "${STUDIONET_RPC_URL}"`);
  }
  for (const bad of FORBIDDEN_RPC_SUBSTRINGS) {
    if (rpcLower.includes(bad)) {
      problems.push(`rpcUrl "${effective.rpcUrl}" contains forbidden substring "${bad}"`);
    }
  }

  return { ok: problems.length === 0, problems };
}

export function isCanonicalChainId(chainId: number): boolean {
  return chainId === STUDIONET_CHAIN_ID;
}
