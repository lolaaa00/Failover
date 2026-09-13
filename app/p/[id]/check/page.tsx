"use client";

import { use, useState } from "react";
import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { EvidenceCard } from "@/components/status/EvidenceCard";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { TxLifecyclePanel } from "@/components/tx/TxLifecyclePanel";
import { useTxLifecycle } from "@/lib/contract/txLifecycle";
import { submitRunSafetyCheck, readStatus } from "@/lib/contract/registryAdapter";
import { useWallet, isWriteReady } from "@/lib/wallet/WalletProvider";
import { isDeployed, FAILOVER_REGISTRY_ADDRESS } from "@/lib/contract/addresses";
import { CLEAN_FINDING, COMPROMISED_FINDING } from "@/lib/fixtures/demoProject";
import type { ProjectStatus } from "@/lib/contract/types";

export default function CheckChamberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const wallet = useWallet();
  const { state, run } = useTxLifecycle<{ status: ProjectStatus }>();
  const [demoResult, setDemoResult] = useState<"CLEAN" | "COMPROMISED" | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);

  const liveDeployed = isDeployed(FAILOVER_REGISTRY_ADDRESS);

  async function handleLiveCheck() {
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;
    await run({
      submit: () => submitRunSafetyCheck(wallet.address as `0x${string}`, wallet.provider!, id),
      waitForFinality: async () => ({ status: "FINALIZED" }),
      readExecutionResult: async () => ({ status: await readStatus(id) }),
      rereadAndValidate: async (result) => {
        const status = await readStatus(id);
        return status === result.status;
      },
    });
  }

  function handleDemoCheck(outcome: "CLEAN" | "COMPROMISED") {
    setDemoRunning(true);
    setDemoResult(null);
    window.setTimeout(() => {
      setDemoResult(outcome);
      setDemoRunning(false);
    }, 900);
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
          <button
            onClick={() => void handleLiveCheck()}
            className="font-mono-label text-xs uppercase px-4 py-3 bg-avionics-blue text-panel-black font-semibold"
          >
            Run Safety Check
          </button>
        </NetworkGuard>
      ) : (
        <div className="checksum-plate p-5 space-y-4">
          <p className="font-mono-label text-xs uppercase text-caution-amber">
            No live Studionet deployment configured — demonstrating the leader/validator check with
            canonical fixtures instead of a live fetch.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleDemoCheck("CLEAN")}
              disabled={demoRunning}
              className="font-mono-label text-xs uppercase px-4 py-3 border border-safe-green text-safe-green disabled:opacity-40"
            >
              Simulate: Clean Sources
            </button>
            <button
              onClick={() => handleDemoCheck("COMPROMISED")}
              disabled={demoRunning}
              className="font-mono-label text-xs uppercase px-4 py-3 border border-emergency-red text-emergency-red disabled:opacity-40"
            >
              Simulate: Compromised Frontend
            </button>
          </div>
          {demoRunning && (
            <p className="font-mono-label text-xs uppercase text-avionics-blue" role="status">
              Leader fetching evidence… validators independently re-deriving…
            </p>
          )}
          {demoResult && (
            <div className="space-y-3">
              <StatusAnnunciator status={demoResult === "CLEAN" ? "SAFE" : "RESTRICTED"} />
              <EvidenceCard finding={demoResult === "CLEAN" ? CLEAN_FINDING : COMPROMISED_FINDING} />
            </div>
          )}
        </div>
      )}

      <TxLifecyclePanel state={state} />
    </div>
  );
}
