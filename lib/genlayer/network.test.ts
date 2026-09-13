import { describe, expect, it } from "vitest";
import { assertCanonicalNetwork, NETWORK_CONFIG, STUDIONET_CHAIN_ID, STUDIONET_RPC_URL } from "./network";

describe("canonical network resolution", () => {
  it("resolves to chain 61999 and the Studio RPC", () => {
    expect(NETWORK_CONFIG.chainId).toBe(61999);
    expect(NETWORK_CONFIG.rpcUrl).toBe("https://studio.genlayer.com/api");
  });

  it("passes assertCanonicalNetwork for the canonical values", () => {
    const result = assertCanonicalNetwork({ chainId: STUDIONET_CHAIN_ID, rpcUrl: STUDIONET_RPC_URL });
    expect(result.ok).toBe(true);
    expect(result.problems).toHaveLength(0);
  });

  it("rejects chain 61997 (studio-dev)", () => {
    const result = assertCanonicalNetwork({ chainId: 61997, rpcUrl: STUDIONET_RPC_URL });
    expect(result.ok).toBe(false);
  });

  it("rejects a studio-dev RPC URL", () => {
    const result = assertCanonicalNetwork({
      chainId: STUDIONET_CHAIN_ID,
      rpcUrl: "https://studio-dev.genlayer.com/api",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects localhost RPC even with the right chain id", () => {
    const result = assertCanonicalNetwork({ chainId: STUDIONET_CHAIN_ID, rpcUrl: "http://localhost:4000" });
    expect(result.ok).toBe(false);
  });
});
