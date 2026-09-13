"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { isDeployed, FAILOVER_GATE_ADDRESS } from "@/lib/contract/addresses";
import { demoProjectForStage, type DemoStage } from "@/lib/fixtures/demoProject";

interface Receipt {
  kind: "high_risk" | "low_risk";
  actionHash: string;
  outcome: "EXECUTED" | "REFUSED_NOT_SAFE";
}

function randomActionHash(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function GateDemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const liveDeployed = isDeployed(FAILOVER_GATE_ADDRESS);
  const [stage, setStage] = useState<DemoStage>("SAFE");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [replayError, setReplayError] = useState<string | null>(null);

  const project = useMemo(() => demoProjectForStage(stage), [stage]);
  const isSafe = project.status === "SAFE" || project.status === "RECOVERED";

  function executeHighRisk() {
    setReplayError(null);
    const hash = randomActionHash();
    if (!isSafe) {
      setReceipts((r) => [{ kind: "high_risk", actionHash: hash, outcome: "REFUSED_NOT_SAFE" }, ...r]);
      return;
    }
    setReceipts((r) => [{ kind: "high_risk", actionHash: hash, outcome: "EXECUTED" }, ...r]);
  }

  function replayLastHighRisk() {
    const last = receipts.find((r) => r.kind === "high_risk" && r.outcome === "EXECUTED");
    if (!last) {
      setReplayError("No previously executed high-risk action to replay yet.");
      return;
    }
    setReplayError(`action_hash ${last.actionHash} already executed — replay rejected by the gate.`);
  }

  function executeLowRisk() {
    const hash = randomActionHash();
    setReceipts((r) => [{ kind: "low_risk", actionHash: hash, outcome: "EXECUTED" }, ...r]);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-8">
      <Link href={`/p/${id}`} className="font-mono-label text-xs uppercase text-cockpit-white/50 underline">
        ← Back to dossier
      </Link>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-condensed text-3xl font-bold uppercase">Execution Gate Demo</h1>
        <StatusAnnunciator status={project.status} />
      </div>
      <p className="text-cockpit-white/60 text-sm max-w-xl">
        FailoverGate refuses <code>execute_high_risk(action_hash)</code> unless
        <code> registry.is_safe(project_id)</code> is true. Low-risk actions remain callable
        regardless of restriction, proving deliberate policy separation rather than a blanket
        pause. Each action_hash may execute at most once.
      </p>

      {!liveDeployed && (
        <div className="checksum-plate p-4 border-caution-amber/50 space-y-3">
          <p className="font-mono-label text-xs uppercase text-caution-amber">
            No live FailoverGate deployment configured — set the linked project&rsquo;s demo stage
            to drive the gate&rsquo;s behavior.
          </p>
          <div className="flex flex-wrap gap-2 font-mono-label text-[11px] uppercase">
            {(["SAFE", "RESTRICTED", "RECOVERY_PENDING", "RECOVERED_TO_SAFE"] as DemoStage[]).map((s) => (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={`px-3 py-2 border ${stage === s ? "border-avionics-blue text-avionics-blue" : "border-white/15 text-cockpit-white/50"}`}
              >
                {s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      <NetworkGuard>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={executeHighRisk}
            className="font-mono-label text-xs uppercase px-4 py-3 border border-emergency-red text-emergency-red"
          >
            execute_high_risk(action_hash)
          </button>
          <button
            onClick={executeLowRisk}
            className="font-mono-label text-xs uppercase px-4 py-3 border border-white/20"
          >
            execute_low_risk(action_hash)
          </button>
          <button
            onClick={replayLastHighRisk}
            className="font-mono-label text-xs uppercase px-4 py-3 border border-caution-amber text-caution-amber"
          >
            Replay last high-risk hash
          </button>
        </div>
      </NetworkGuard>

      {replayError && <p className="text-emergency-red font-mono-label text-xs">{replayError}</p>}

      <div className="space-y-2">
        <h2 className="font-condensed text-lg font-semibold uppercase">Receipts</h2>
        {receipts.length === 0 && <p className="text-cockpit-white/40 text-sm">No actions yet.</p>}
        <ul className="space-y-2">
          {receipts.map((r, i) => (
            <li key={i} className="checksum-plate p-3 flex items-center justify-between font-mono-label text-xs">
              <span className="uppercase">{r.kind.replace("_", " ")}</span>
              <span className="text-cockpit-white/50">{r.actionHash}</span>
              <span className={r.outcome === "EXECUTED" ? "text-safe-green" : "text-emergency-red"}>
                {r.outcome}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
