"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { TxLifecyclePanel } from "@/components/tx/TxLifecyclePanel";
import { useTxLifecycle } from "@/lib/contract/txLifecycle";
import { createFinalityStep } from "@/lib/contract/finality";
import {
  readGateCounts,
  readGateLinkedProject,
  readGateReceipts,
  readGateRegistryAddress,
  readIsGateOpen,
  submitExecuteHighRisk,
  submitExecuteLowRisk,
  submitTryExecuteHighRiskOrRecordRefusal,
} from "@/lib/contract/gateAdapter";
import { FAILOVER_GATE_ADDRESS, FAILOVER_REGISTRY_ADDRESS, isDeployed } from "@/lib/contract/addresses";
import { NETWORK_CONFIG } from "@/lib/genlayer/network";
import { useWallet, isWriteReady } from "@/lib/wallet/WalletProvider";

function randomActionHash(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Finds the most recent receipt recorded for a specific action_hash. The
 * gate is permissionless (any wallet may act on it concurrently), so
 * comparing two whole-state snapshots taken moments apart is unreliable --
 * an unrelated caller's action between those two reads shifts the
 * aggregate counts and would falsely report our own successful write as a
 * mismatch. A durable receipt keyed to *this* action_hash is the precise,
 * concurrency-safe postcondition instead.
 */
/**
 * A deployed FailoverGate is immutably bound to exactly one
 * (registry, project_id) pair at construction time (see
 * contracts/FailoverGate.py). The route's `id` param is untrusted UI
 * state -- it must never be assumed to be the project the deployed gate
 * actually gates. This is the single source of truth for "is it safe to
 * treat this gate as governing the requested route", checked against the
 * gate's own authoritative, freshly re-read view methods every time.
 */
export function evaluateGateBinding(params: {
  routeProjectId: string;
  linkedProject: string;
  gateRegistryAddress: string;
  configuredRegistryAddress: string;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (params.linkedProject !== params.routeProjectId) {
    reasons.push(
      `Route project "${params.routeProjectId}" does not match the deployed gate's linked project "${params.linkedProject}".`,
    );
  }
  if (params.gateRegistryAddress.toLowerCase() !== params.configuredRegistryAddress.toLowerCase()) {
    reasons.push(
      `The gate's bound registry (${params.gateRegistryAddress}) does not match the configured FailoverRegistry (${params.configuredRegistryAddress}).`,
    );
  }
  return { ok: reasons.length === 0, reasons };
}

export function findReceiptOutcome(receipts: unknown[], actionHash: string): string | null {
  for (let i = receipts.length - 1; i >= 0; i--) {
    const raw = receipts[i];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).action_hash === actionHash) {
        const outcome = (parsed as Record<string, unknown>).outcome;
        return typeof outcome === "string" ? outcome : null;
      }
    } catch {
      // Skip unparseable entries rather than letting one bad row abort the search.
    }
  }
  return null;
}

type BindingStatus =
  | { checked: false }
  | { checked: true; ok: true }
  | { checked: true; ok: false; reasons: string[] };

export default function LiveGatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const wallet = useWallet();
  const { state, run } = useTxLifecycle<{ status: "ok" }>();
  const [gateOpen, setGateOpen] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<unknown>(null);
  const [receipts, setReceipts] = useState<unknown[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [binding, setBinding] = useState<BindingStatus>({ checked: false });

  const liveDeployed = isDeployed(FAILOVER_GATE_ADDRESS) && isDeployed(FAILOVER_REGISTRY_ADDRESS);
  const bindingOk = binding.checked && binding.ok;

  async function refresh() {
    if (!liveDeployed) return;
    try {
      // Binding is re-read from the deployed gate's own view methods on
      // every refresh -- never cached or trusted from local config -- so a
      // gate that turns out to be bound to a different project/registry is
      // caught even if this page was left open across a redeploy.
      const [linkedProject, gateRegistryAddress] = await Promise.all([
        readGateLinkedProject(),
        readGateRegistryAddress(),
      ]);
      const result = evaluateGateBinding({
        routeProjectId: id,
        linkedProject,
        gateRegistryAddress,
        configuredRegistryAddress: FAILOVER_REGISTRY_ADDRESS,
      });
      setBinding(result.ok ? { checked: true, ok: true } : { checked: true, ok: false, reasons: result.reasons });
      setReadError(null);

      if (!result.ok) {
        // Fail closed: do not read or display gate state as if it applies
        // to this route when the binding itself is wrong.
        setGateOpen(null);
        setCounts(null);
        setReceipts([]);
        return;
      }

      const [open, nextCounts, nextReceipts] = await Promise.all([
        readIsGateOpen(),
        readGateCounts(),
        readGateReceipts(),
      ]);
      setGateOpen(open);
      setCounts(nextCounts);
      setReceipts(nextReceipts);
    } catch (err) {
      setReadError((err as Error)?.message ?? "Failed to read gate state");
    }
  }

  useEffect(() => {
    // Fetching authoritative on-chain gate state on mount, not deriving
    // React state from props/state -- an external-system read, not the
    // synchronous setState-in-render pattern this rule guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDeployed]);

  async function submit(kind: "high" | "try-high" | "low") {
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;
    // Defense in depth: the buttons are already hidden while the binding
    // check hasn't passed, but never allow a write to reach the chain on
    // the strength of a route param alone.
    if (!bindingOk) return;
    const actionHash = randomActionHash();
    const finality = createFinalityStep();
    await run({
      submit: () => {
        if (kind === "high") {
          return submitExecuteHighRisk(wallet.address as `0x${string}`, wallet.provider!, actionHash);
        }
        if (kind === "try-high") {
          return submitTryExecuteHighRiskOrRecordRefusal(
            wallet.address as `0x${string}`,
            wallet.provider!,
            actionHash,
          );
        }
        return submitExecuteLowRisk(wallet.address as `0x${string}`, wallet.provider!, actionHash);
      },
      waitForFinality: finality.waitForFinality,
      readExecutionResult: async () => {
        // execute_high_risk reverts (no state mutation) when the gate is
        // refusing -- surface that as EXECUTION_ERROR rather than silently
        // re-reading unchanged state and reporting a false success. The
        // actual postcondition check (a durable receipt for this
        // action_hash) happens in rereadAndValidate, so there is nothing
        // else to read here.
        finality.assertExecutionSucceeded();
        return { status: "ok" as const };
      },
      rereadAndValidate: async () => {
        const [nextCounts, open, nextReceipts] = await Promise.all([
          readGateCounts(),
          readIsGateOpen(),
          readGateReceipts(),
        ]);
        setCounts(nextCounts);
        setGateOpen(open);
        setReceipts(nextReceipts);
        // Finality already confirmed the write didn't revert -- a durable
        // receipt for this exact action_hash is the concurrency-safe proof
        // it was actually recorded (REFUSED_NOT_SAFE is a valid, non-revert
        // outcome for try_execute_high_risk_or_record_refusal).
        const outcome = findReceiptOutcome(nextReceipts, actionHash);
        return outcome === "EXECUTED" || outcome === "REFUSED_NOT_SAFE";
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-8">
      <Link href={`/p/${id}`} className="font-mono-label text-xs uppercase text-cockpit-white/50 underline">
        Back to live dossier
      </Link>

      <div className="checksum-plate p-4 border-avionics-blue/50 space-y-2">
        <p className="font-mono-label text-xs uppercase text-avionics-blue">Live Execution Gate</p>
        <p className="font-mono-label text-[11px] text-cockpit-white/60 break-all">
          Chain: {NETWORK_CONFIG.chainId} | Registry: {FAILOVER_REGISTRY_ADDRESS || "not configured"} | Gate:{" "}
          {FAILOVER_GATE_ADDRESS || "not configured"}
        </p>
      </div>

      {!liveDeployed ? (
        <div className="checksum-plate p-4 border-caution-amber/70 bg-caution-amber/10 space-y-2">
          <p className="font-mono-label text-xs uppercase text-caution-amber font-bold">
            Live gate unavailable
          </p>
          <p className="text-sm text-cockpit-white/60">
            `/gate/{id}` is live-only. Configure both contract addresses to enable canonical reads and writes.
          </p>
          <Link href="/demo/gate" className="font-mono-label text-xs uppercase text-avionics-blue underline">
            Open fixture gate demo
          </Link>
        </div>
      ) : !binding.checked ? (
        <div className="checksum-plate p-4">
          <p className="font-mono-label text-xs uppercase text-cockpit-white/50">
            Verifying gate binding against the deployed contract…
          </p>
          {readError && <p className="text-emergency-red font-mono-label text-xs mt-2">{readError}</p>}
        </div>
      ) : !binding.ok ? (
        <div className="checksum-plate p-4 border-emergency-red/70 bg-emergency-red/10 space-y-2" role="alert">
          <p className="font-mono-label text-xs uppercase text-emergency-red font-bold">
            Gate Binding Mismatch — Refusing To Operate
          </p>
          <p className="text-sm text-cockpit-white/60">
            The deployed FailoverGate is not bound to this route. Nothing below reflects this gate&rsquo;s real
            state, and every write action is disabled — this is a fail-closed refusal, not an outage.
          </p>
          <ul className="list-disc list-inside text-sm text-cockpit-white/60 space-y-1">
            {binding.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="checksum-plate p-5 grid sm:grid-cols-2 gap-4">
            <div>
              <p className="font-mono-label text-[11px] uppercase text-cockpit-white/40">Gate State</p>
              <p className={gateOpen ? "text-safe-green" : "text-emergency-red"}>
                {gateOpen === null ? "Reading..." : gateOpen ? "OPEN" : "REFUSING HIGH RISK"}
              </p>
            </div>
            <div>
              <p className="font-mono-label text-[11px] uppercase text-cockpit-white/40">Counts</p>
              <pre className="text-xs text-cockpit-white/60 whitespace-pre-wrap break-words">
                {counts ? JSON.stringify(counts, null, 2) : "Reading..."}
              </pre>
            </div>
          </div>

          {readError && <p className="text-emergency-red font-mono-label text-xs">{readError}</p>}

          <NetworkGuard>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void submit("high")}
                className="font-mono-label text-xs uppercase px-4 py-3 border border-emergency-red text-emergency-red"
              >
                execute_high_risk
              </button>
              <button
                onClick={() => void submit("try-high")}
                className="font-mono-label text-xs uppercase px-4 py-3 border border-caution-amber text-caution-amber"
              >
                try_high_risk_or_record_refusal
              </button>
              <button
                onClick={() => void submit("low")}
                className="font-mono-label text-xs uppercase px-4 py-3 border border-white/20"
              >
                execute_low_risk
              </button>
            </div>
          </NetworkGuard>

          <TxLifecyclePanel state={state} />

          <div className="space-y-2">
            <h2 className="font-condensed text-lg font-semibold uppercase">On-Chain Receipts</h2>
            {receipts.length === 0 && <p className="text-cockpit-white/40 text-sm">No receipts returned.</p>}
            <ul className="space-y-2">
              {receipts.map((receipt, i) => (
                <li key={i} className="checksum-plate p-3 font-mono-label text-xs break-all text-cockpit-white/60">
                  {typeof receipt === "string" ? receipt : JSON.stringify(receipt)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
