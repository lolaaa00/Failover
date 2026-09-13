"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { STUDIONET_CHAIN_ID } from "@/lib/genlayer/network";
import type { Eip1193Provider, WalletState, WalletStatus } from "./types";

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToStudionet: () => Promise<void>;
  provider: Eip1193Provider | null;
}

const initialState: WalletState = {
  status: "DISCONNECTED",
  address: null,
  chainId: null,
  error: null,
};

const WalletContext = createContext<WalletContextValue | null>(null);

function hexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(initialState);
  const providerRef = useRef<Eip1193Provider | null>(null);

  const getProvider = useCallback((): Eip1193Provider | null => {
    if (typeof window === "undefined") return null;
    return window.ethereum ?? null;
  }, []);

  const refreshChain = useCallback(async (provider: Eip1193Provider) => {
    try {
      const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
      const chainId = hexToNumber(chainHex);
      setState((prev) => ({
        ...prev,
        chainId,
        status: chainId === STUDIONET_CHAIN_ID ? "CONNECTED" : "WRONG_NETWORK",
        error: null,
      }));
    } catch {
      setState((prev) => ({ ...prev, status: "RPC_ERROR", error: "Failed to read chain id" }));
    }
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setState({ ...initialState, status: "RPC_ERROR", error: "No injected wallet found (window.ethereum)" });
      return;
    }
    providerRef.current = provider;
    setState((prev) => ({ ...prev, status: "CONNECTING", error: null }));
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) {
        setState((prev) => ({ ...prev, status: "SIGNATURE_REJECTED", error: "No accounts returned" }));
        return;
      }
      setState((prev) => ({ ...prev, address: accounts[0] as `0x${string}` }));
      await refreshChain(provider);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) {
        setState((prev) => ({ ...prev, status: "SIGNATURE_REJECTED", error: "Connection request rejected" }));
      } else {
        setState((prev) => ({ ...prev, status: "RPC_ERROR", error: (err as Error)?.message ?? "RPC error" }));
      }
    }
  }, [getProvider, refreshChain]);

  const disconnect = useCallback(() => {
    setState(initialState);
  }, []);

  const switchToStudionet = useCallback(async () => {
    const provider = providerRef.current ?? getProvider();
    if (!provider) return;
    setState((prev) => ({ ...prev, status: "SWITCHING_NETWORK" }));
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${STUDIONET_CHAIN_ID.toString(16)}` }],
      });
      await refreshChain(provider);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) {
        setState((prev) => ({ ...prev, status: "SIGNATURE_REJECTED", error: "Network switch rejected" }));
      } else {
        setState((prev) => ({
          ...prev,
          status: "RPC_ERROR",
          error: (err as Error)?.message ?? "Failed to switch network",
        }));
      }
    }
  }, [getProvider, refreshChain]);

  useEffect(() => {
    const provider = getProvider();
    if (!provider || !provider.on) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setState(initialState); // account removed
      } else {
        setState((prev) => ({ ...prev, address: accounts[0] as `0x${string}` }));
      }
    };
    const onChainChanged = (...args: unknown[]) => {
      const chainHex = args[0] as string;
      const chainId = hexToNumber(chainHex);
      setState((prev) => ({
        ...prev,
        chainId,
        status: chainId === STUDIONET_CHAIN_ID ? "CONNECTED" : "WRONG_NETWORK",
      }));
    };
    const onDisconnect = () => {
      setState((prev) => ({ ...prev, status: "PROVIDER_DISCONNECTED", error: "Wallet provider disconnected" }));
    };

    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);
    provider.on("disconnect", onDisconnect);

    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [getProvider]);

  const value = useMemo<WalletContextValue>(
    () => ({
      ...state,
      connect,
      disconnect,
      switchToStudionet,
      provider: providerRef.current,
    }),
    [state, connect, disconnect, switchToStudionet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export function isWriteReady(state: Pick<WalletState, "status" | "chainId">): boolean {
  return state.status === "CONNECTED" && state.chainId === STUDIONET_CHAIN_ID;
}

export type { WalletStatus };
