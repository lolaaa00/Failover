import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { WalletProvider, useWallet } from "@/lib/wallet/WalletProvider";
import { STUDIONET_CHAIN_ID } from "@/lib/genlayer/network";

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}

describe("WalletProvider / useWallet", () => {
  beforeEach(() => {
    window.ethereum = undefined;
  });

  it("reports RPC_ERROR when no injected wallet is present", async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe("RPC_ERROR");
  });

  it("connects and reports CONNECTED on the canonical chain", async () => {
    const chainHex = `0x${STUDIONET_CHAIN_ID.toString(16)}`;
    window.ethereum = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") return ["0xabc0000000000000000000000000000000000f"];
        if (method === "eth_chainId") return chainHex;
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.status).toBe("CONNECTED"));
    expect(result.current.chainId).toBe(STUDIONET_CHAIN_ID);
  });

  it("reports WRONG_NETWORK when connected on a non-canonical chain", async () => {
    window.ethereum = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") return ["0xabc0000000000000000000000000000000000f"];
        if (method === "eth_chainId") return "0xf221"; // 61985, not 61999
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.status).toBe("WRONG_NETWORK"));
  });

  it("reports SIGNATURE_REJECTED when the connect request is rejected (code 4001)", async () => {
    window.ethereum = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") {
          const err = new Error("User rejected") as Error & { code: number };
          err.code = 4001;
          throw err;
        }
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("SIGNATURE_REJECTED");
  });
});
