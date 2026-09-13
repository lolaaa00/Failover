"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { STUDIONET_CHAIN_ID } from "@/lib/genlayer/network";

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SiteHeader() {
  const wallet = useWallet();

  return (
    <header className="border-b border-white/10 sticky top-0 z-40 bg-panel-black/95 backdrop-blur">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-avionics-blue focus:text-panel-black focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-condensed font-semibold tracking-wide uppercase text-lg">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-safe-green" aria-hidden />
          Failover
        </Link>
        <nav className="hidden md:flex items-center gap-6 font-mono-label text-xs uppercase text-cockpit-white/70">
          <Link href="/projects" className="hover:text-cockpit-white">Projects</Link>
          <Link href="/new" className="hover:text-cockpit-white">Register</Link>
          <Link href="/incidents" className="hover:text-cockpit-white">Incidents</Link>
        </nav>
        <WalletButton wallet={wallet} />
      </div>
    </header>
  );
}

function WalletButton({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  if (wallet.status === "DISCONNECTED") {
    return (
      <button
        onClick={() => void wallet.connect()}
        className="font-mono-label text-xs uppercase px-3 py-2 border border-avionics-blue text-avionics-blue hover:bg-avionics-blue hover:text-panel-black transition-colors"
      >
        Connect Wallet
      </button>
    );
  }
  if (wallet.status === "CONNECTING") {
    return <span className="font-mono-label text-xs uppercase text-cockpit-white/60">Connecting…</span>;
  }
  if (wallet.status === "WRONG_NETWORK") {
    return (
      <button
        onClick={() => void wallet.switchToStudionet()}
        className="font-mono-label text-xs uppercase px-3 py-2 border border-caution-amber text-caution-amber hover:bg-caution-amber hover:text-panel-black transition-colors"
      >
        Switch to Studionet ({STUDIONET_CHAIN_ID})
      </button>
    );
  }
  if (wallet.status === "SIGNATURE_REJECTED" || wallet.status === "RPC_ERROR" || wallet.status === "PROVIDER_DISCONNECTED") {
    return (
      <button
        onClick={() => void wallet.connect()}
        className="font-mono-label text-xs uppercase px-3 py-2 border border-emergency-red text-emergency-red"
        title={wallet.error ?? undefined}
      >
        Retry Connect
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 font-mono-label text-xs">
      <span className="inline-block h-2 w-2 rounded-full bg-safe-green" aria-hidden />
      <span>{wallet.address ? shortAddress(wallet.address) : "connected"}</span>
      <button onClick={wallet.disconnect} className="text-cockpit-white/50 hover:text-cockpit-white underline">
        disconnect
      </button>
    </div>
  );
}
