"use client";

import { useRouter } from "next/navigation";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { TxLifecyclePanel } from "@/components/tx/TxLifecyclePanel";
import { useTxLifecycle } from "@/lib/contract/txLifecycle";
import { createFinalityStep } from "@/lib/contract/finality";
import { submitActivateProject, readStatus } from "@/lib/contract/registryAdapter";
import { useWallet, isWriteReady } from "@/lib/wallet/WalletProvider";
import type { ProjectStatus } from "@/lib/contract/types";

/**
 * A newly registered project sits in DRAFT -- the gate stays closed and
 * run_safety_check rejects it outright -- until the owner activates it.
 * Activation is a distinct owner-signed write (contracts/FailoverRegistry.py
 * activate_project) that moves status to PENDING_FIRST_CHECK, not SAFE, so
 * the gate still fails closed until the first real consensus check.
 */
export function ActivateProjectButton({ projectId, owner }: { projectId: string; owner: string }) {
  const wallet = useWallet();
  const router = useRouter();
  const { state, run } = useTxLifecycle<{ status: ProjectStatus }>();

  const isOwner = Boolean(wallet.address) && wallet.address!.toLowerCase() === owner.toLowerCase();

  async function handleActivate() {
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;
    const finality = createFinalityStep();
    await run({
      submit: () => submitActivateProject(wallet.address as `0x${string}`, wallet.provider!, projectId),
      waitForFinality: finality.waitForFinality,
      readExecutionResult: async () => {
        finality.assertExecutionSucceeded();
        return { status: "PENDING_FIRST_CHECK" as const };
      },
      rereadAndValidate: async () => {
        // activate_project is deterministic (DRAFT -> PENDING_FIRST_CHECK,
        // never SAFE) once it doesn't revert, so the authoritative reread
        // must assert that exact postcondition -- comparing two
        // back-to-back reads to each other would trivially "match" even if
        // a stale RPC replica never actually observed the write.
        const status = await readStatus(projectId);
        const ok = status === "PENDING_FIRST_CHECK";
        if (ok) router.refresh();
        return ok;
      },
    });
  }

  return (
    <div className="checksum-plate p-5 border-caution-amber/60 bg-caution-amber/5 space-y-3">
      <p className="font-mono-label text-xs uppercase text-caution-amber">Activation Required</p>
      <p className="text-sm text-cockpit-white/60 max-w-xl">
        This project is DRAFT. The gate stays closed and no safety check may run until the owner
        activates it. Activation freezes the frontend/release/incident URLs — after this point only a
        recovery release can change them.
      </p>
      {wallet.address && !isOwner && (
        <p className="font-mono-label text-[11px] uppercase text-emergency-red/80">
          Connected wallet is not the project owner ({owner.slice(0, 10)}…) — activation will be
          rejected on-chain.
        </p>
      )}
      <NetworkGuard>
        <button
          onClick={() => void handleActivate()}
          className="font-mono-label text-xs uppercase px-4 py-3 bg-caution-amber text-panel-black font-semibold"
        >
          Activate Project
        </button>
      </NetworkGuard>
      <TxLifecyclePanel state={state} />
    </div>
  );
}
