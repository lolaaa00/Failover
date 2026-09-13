"use client";

import type { ReactNode } from "react";
import { useWallet, isWriteReady } from "@/lib/wallet/WalletProvider";
import { STUDIONET_CHAIN_ID } from "@/lib/genlayer/network";

/**
 * Wraps any write-capable UI. Writes stay disabled until the wallet is
 * connected AND confirmed on chain 61999 (spec section 12).
 */
export function NetworkGuard({ children }: { children: ReactNode }) {
  const wallet = useWallet();

  if (isWriteReady(wallet)) {
    return <>{children}</>;
  }

  if (wallet.status === "WRONG_NETWORK") {
    return (
      <div className="checksum-plate p-4 border-caution-amber/60">
        <p className="font-mono-label text-xs uppercase text-caution-amber mb-2">
          Wrong network (chain {wallet.chainId ?? "unknown"}) — Failover writes require Studionet ({STUDIONET_CHAIN_ID})
        </p>
        <button
          onClick={() => void wallet.switchToStudionet()}
          className="font-mono-label text-xs uppercase px-3 py-2 border border-caution-amber text-caution-amber hover:bg-caution-amber hover:text-panel-black"
        >
          Switch to Studionet
        </button>
      </div>
    );
  }

  return (
    <div className="checksum-plate p-4">
      <p className="font-mono-label text-xs uppercase text-cockpit-white/60 mb-2">
        Connect a wallet on Studionet to perform this action.
      </p>
      <button
        onClick={() => void wallet.connect()}
        className="font-mono-label text-xs uppercase px-3 py-2 border border-avionics-blue text-avionics-blue hover:bg-avionics-blue hover:text-panel-black"
      >
        Connect Wallet
      </button>
    </div>
  );
}
