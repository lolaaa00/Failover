"use client";

import { use, useState } from "react";
import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { TxLifecyclePanel } from "@/components/tx/TxLifecyclePanel";
import { useTxLifecycle } from "@/lib/contract/txLifecycle";
import { createFinalityStep } from "@/lib/contract/finality";
import { submitRunSafetyCheck, readStatus } from "@/lib/contract/registryAdapter";
import { useWallet, isWriteReady } from "@/lib/wallet/WalletProvider";
import { isDeployed, FAILOVER_REGISTRY_ADDRESS } from "@/lib/contract/addresses";
import type { ProjectStatus } from "@/lib/contract/types";

export default function CheckChamberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const wallet = useWallet();
  const { state, run } = useTxLifecycle<{ status: ProjectStatus }>();
  const [latestStatus, setLatestStatus] = useState<ProjectStatus | null>(null);

  const liveDeployed = isDeployed(FAILOVER_REGISTRY_ADDRESS);

  async function handleLiveCheck() {
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;
    const finality = createFinalityStep();
    await run({
      submit: () => submitRunSafetyCheck(wallet.address as `0x${string}`, wallet.provider!, id),
      waitForFinality: finality.waitForFinality,
      readExecutionResult: async () => {
        finality.assertExecutionSucceeded();
        return { status: await readStatus(id) };
      },
      rereadAndValidate: async (result) => {
        const status = await readStatus(id);
        setLatestStatus(status);
        return status === result.status;
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-8">
      <Link href={`/p/${id}`} className="font-mono-label text-xs uppercase text-cockpit-white/50 underline">
        ← Back to dossier
      </Link>
      <h1 className="font-condensed text-3xl font-bold uppercase">Check Chamber</h1>
      <p className="text-cockpit-white/60 text-sm max-w-xl">
        Anyone may permissionlessly trigger a safety check — no bounty, no reward for triggering
        emergency state. A leader node independently fetches the three sealed sources and
        classifies them; independent validators re-derive the same material fields before
        consensus is reached.
      </p>

      {liveDeployed ? (
        <NetworkGuard>
          <div className="space-y-4">
            <button
              onClick={() => void handleLiveCheck()}
              className="font-mono-label text-xs uppercase px-4 py-3 bg-avionics-blue text-panel-black font-semibold"
            >
              Run Safety Check
            </button>
            {latestStatus && <StatusAnnunciator status={latestStatus} />}
          </div>
        </NetworkGuard>
      ) : (
        <div className="checksum-plate p-5 space-y-3 border-caution-amber/70 bg-caution-amber/10">
          <p className="font-mono-label text-xs uppercase text-caution-amber">
            Live check unavailable
          </p>
          <p className="text-sm text-cockpit-white/60">
            `/p/{id}/check` is live-only and does not run fixture consensus. Configure the registry address
            or use the separate demo route.
          </p>
          <Link href="/demo" className="font-mono-label text-xs uppercase text-avionics-blue underline">
            Open fixture demo
          </Link>
        </div>
      )}

      <TxLifecyclePanel state={state} />
    </div>
  );
}
