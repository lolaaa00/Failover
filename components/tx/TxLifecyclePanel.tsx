import type { TxLifecycleState } from "@/lib/contract/txLifecycle";
import { explorerTxUrl } from "@/lib/genlayer/explorer";

const STEPS = ["AWAITING_SIGNATURE", "SUBMITTED", "CONSENSUS_RUNNING", "FINALIZED", "EXECUTION_CONFIRMED", "STATE_REREAD"] as const;

const FAILURE_LABEL: Record<string, string> = {
  USER_REJECTED: "Signature rejected in wallet",
  WRONG_NETWORK: "Wrong network",
  RPC_ERROR: "RPC error",
  CONSENSUS_FAILURE: "Validator consensus failed",
  EXECUTION_ERROR: "Contract execution error",
  STATE_MISMATCH: "Post-write state did not match expected outcome",
};

export function TxLifecyclePanel({ state }: { state: TxLifecycleState }) {
  if (state.phase === "IDLE") return null;

  const isFailure = state.phase in FAILURE_LABEL;
  const txHash = "txHash" in state ? state.txHash : undefined;
  const currentIndex = STEPS.indexOf(state.phase as (typeof STEPS)[number]);

  return (
    <div className="checksum-plate p-5 space-y-4" role="status" aria-live="polite">
      {!isFailure && (
        <ol className="flex flex-wrap gap-2 font-mono-label text-[10px] uppercase">
          {STEPS.map((step, i) => (
            <li
              key={step}
              className={`px-2 py-1 border ${
                i < currentIndex
                  ? "border-safe-green/50 text-safe-green/70"
                  : i === currentIndex
                    ? "border-avionics-blue text-avionics-blue"
                    : "border-white/10 text-cockpit-white/30"
              }`}
            >
              {step.replace(/_/g, " ")}
            </li>
          ))}
        </ol>
      )}
      {isFailure && (
        <p className="font-mono-label text-sm uppercase text-emergency-red">
          {FAILURE_LABEL[state.phase]}
          {"error" in state && state.error ? `: ${state.error}` : ""}
        </p>
      )}
      {txHash && (
        <a
          href={explorerTxUrl(txHash)}
          target="_blank"
          rel="noreferrer"
          className="text-avionics-blue underline text-sm font-mono-label"
        >
          View transaction on explorer →
        </a>
      )}
      {state.phase === "STATE_REREAD" && (
        <p className="text-safe-green font-mono-label text-sm uppercase">
          Confirmed — authoritative contract state re-read successfully.
        </p>
      )}
    </div>
  );
}
