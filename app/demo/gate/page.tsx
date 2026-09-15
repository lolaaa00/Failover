"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
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

export default function DemoGatePage() {
  const [stage, setStage] = useState<DemoStage>("SAFE");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [replayError, setReplayError] = useState<string | null>(null);

  const project = useMemo(() => demoProjectForStage(stage), [stage]);
  const isSafe = project.status === "SAFE" || project.status === "RECOVERED";

  function executeHighRisk() {
    setReplayError(null);
    const hash = randomActionHash();
    setReceipts((r) => [
      { kind: "high_risk", actionHash: hash, outcome: isSafe ? "EXECUTED" : "REFUSED_NOT_SAFE" },
      ...r,
    ]);
  }

  function replayLastHighRisk() {
    const last = receipts.find((r) => r.kind === "high_risk" && r.outcome === "EXECUTED");
    setReplayError(
      last
        ? `action_hash ${last.actionHash} already executed; replay rejected by the gate.`
        : "No previously executed high-risk action to replay yet.",
    );
  }

  function executeLowRisk() {
    const hash = randomActionHash();
    setReceipts((r) => [{ kind: "low_risk", actionHash: hash, outcome: "EXECUTED" }, ...r]);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-8">
      <Link href="/demo" className="font-mono-label text-xs uppercase text-cockpit-white/50 underline">
        Back to demo
      </Link>

      <div className="checksum-plate p-4 border-caution-amber/70 bg-caution-amber/10 space-y-1">
        <p className="font-mono-label text-xs uppercase text-caution-amber font-bold">
          Demo Gate - fixture data only
        </p>
        <p className="font-mono-label text-[11px] text-cockpit-white/50">
          These receipts are simulated and are not on-chain.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-condensed text-3xl font-bold uppercase">Execution Gate Demo</h1>
        <StatusAnnunciator status={project.status} />
      </div>

      <div className="flex flex-wrap gap-2 font-mono-label text-[11px] uppercase">
        {(["SAFE", "RESTRICTED", "RECOVERY_PENDING", "RECOVERED_TO_SAFE"] as DemoStage[]).map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={`px-3 py-2 border ${
              stage === s ? "border-avionics-blue text-avionics-blue" : "border-white/15 text-cockpit-white/50"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={executeHighRisk}
          className="font-mono-label text-xs uppercase px-4 py-3 border border-emergency-red text-emergency-red"
        >
          execute_high_risk(action_hash)
        </button>
        <button onClick={executeLowRisk} className="font-mono-label text-xs uppercase px-4 py-3 border border-white/20">
          execute_low_risk(action_hash)
        </button>
        <button
          onClick={replayLastHighRisk}
          className="font-mono-label text-xs uppercase px-4 py-3 border border-caution-amber text-caution-amber"
        >
          Replay last high-risk hash
        </button>
      </div>

      {replayError && <p className="text-emergency-red font-mono-label text-xs">{replayError}</p>}

      <ReceiptList receipts={receipts} />
    </div>
  );
}

function ReceiptList({ receipts }: { receipts: Receipt[] }) {
  return (
    <div className="space-y-2">
      <h2 className="font-condensed text-lg font-semibold uppercase">Demo Receipts</h2>
      {receipts.length === 0 && <p className="text-cockpit-white/40 text-sm">No actions yet.</p>}
      <ul className="space-y-2">
        {receipts.map((r, i) => (
          <li key={i} className="checksum-plate p-3 grid gap-2 sm:grid-cols-[1fr_2fr_1fr] font-mono-label text-xs">
            <span className="uppercase">{r.kind.replace("_", " ")}</span>
            <span className="text-cockpit-white/50 break-all">{r.actionHash}</span>
            <span className={r.outcome === "EXECUTED" ? "text-safe-green" : "text-emergency-red"}>{r.outcome}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
