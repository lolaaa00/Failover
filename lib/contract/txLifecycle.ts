"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Transaction lifecycle state machine (spec section 13, generic rules).
 * A tx hash is never treated as success on its own -- every write must
 * pass through CONSENSUS_RUNNING -> FINALIZED -> EXECUTION_CONFIRMED ->
 * STATE_REREAD before the UI reports success, and any failure state
 * leaves the UI in a terminal, actionable state rather than a spinner.
 */
export type TxLifecycleState =
  | { phase: "IDLE" }
  | { phase: "AWAITING_SIGNATURE" }
  | { phase: "SUBMITTED"; txHash: string }
  | { phase: "CONSENSUS_RUNNING"; txHash: string }
  | { phase: "FINALIZED"; txHash: string }
  | { phase: "EXECUTION_CONFIRMED"; txHash: string; result: unknown }
  | { phase: "STATE_REREAD"; txHash: string; result: unknown }
  | { phase: "USER_REJECTED"; error: string }
  | { phase: "WRONG_NETWORK"; error: string }
  | { phase: "RPC_ERROR"; error: string }
  | { phase: "CONSENSUS_FAILURE"; txHash: string; error: string }
  | { phase: "EXECUTION_ERROR"; txHash: string; error: string }
  | { phase: "STATE_MISMATCH"; txHash: string; error: string };

export interface TxLifecycleDeps<TResult> {
  /** Submits the write and returns a tx hash. Throws with `.code === 4001`
   * on user rejection, or a wrong-network error, or an RPC error. */
  submit: () => Promise<string>;
  /** Polls / waits for consensus + finality on the given tx hash. */
  waitForFinality: (txHash: string) => Promise<{ status: "FINALIZED" | "CONSENSUS_FAILURE"; error?: string }>;
  /** Reads the execution result once finalized. */
  readExecutionResult: (txHash: string) => Promise<TResult>;
  /** Re-reads authoritative contract state after execution and validates it
   * is consistent with the expected post-condition. Returns false on
   * mismatch (STATE_MISMATCH). */
  rereadAndValidate: (result: TResult) => Promise<boolean>;
}

export function isTerminalFailure(state: TxLifecycleState): boolean {
  return (
    state.phase === "USER_REJECTED" ||
    state.phase === "WRONG_NETWORK" ||
    state.phase === "RPC_ERROR" ||
    state.phase === "CONSENSUS_FAILURE" ||
    state.phase === "EXECUTION_ERROR" ||
    state.phase === "STATE_MISMATCH"
  );
}

export function isTerminalSuccess(state: TxLifecycleState): boolean {
  return state.phase === "STATE_REREAD";
}

export function useTxLifecycle<TResult>() {
  const [state, setState] = useState<TxLifecycleState>({ phase: "IDLE" });
  const runningRef = useRef(false);

  const run = useCallback(async (deps: TxLifecycleDeps<TResult>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ phase: "AWAITING_SIGNATURE" });

    let txHash: string;
    try {
      txHash = await deps.submit();
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      const message = (err as Error)?.message ?? "unknown error";
      if (code === 4001) {
        setState({ phase: "USER_REJECTED", error: "Signature request was rejected" });
      } else if (/network|chain/i.test(message)) {
        setState({ phase: "WRONG_NETWORK", error: message });
      } else {
        setState({ phase: "RPC_ERROR", error: message });
      }
      runningRef.current = false;
      return;
    }

    setState({ phase: "SUBMITTED", txHash });
    setState({ phase: "CONSENSUS_RUNNING", txHash });

    let finality: { status: "FINALIZED" | "CONSENSUS_FAILURE"; error?: string };
    try {
      finality = await deps.waitForFinality(txHash);
    } catch (err: unknown) {
      setState({ phase: "CONSENSUS_FAILURE", txHash, error: (err as Error)?.message ?? "consensus error" });
      runningRef.current = false;
      return;
    }

    if (finality.status === "CONSENSUS_FAILURE") {
      setState({ phase: "CONSENSUS_FAILURE", txHash, error: finality.error ?? "consensus failed" });
      runningRef.current = false;
      return;
    }

    setState({ phase: "FINALIZED", txHash });

    let result: TResult;
    try {
      result = await deps.readExecutionResult(txHash);
    } catch (err: unknown) {
      setState({ phase: "EXECUTION_ERROR", txHash, error: (err as Error)?.message ?? "execution error" });
      runningRef.current = false;
      return;
    }

    setState({ phase: "EXECUTION_CONFIRMED", txHash, result });

    let valid: boolean;
    try {
      valid = await deps.rereadAndValidate(result);
    } catch (err: unknown) {
      setState({ phase: "STATE_MISMATCH", txHash, error: (err as Error)?.message ?? "state reread failed" });
      runningRef.current = false;
      return;
    }

    if (!valid) {
      setState({ phase: "STATE_MISMATCH", txHash, error: "post-write state does not match expected outcome" });
      runningRef.current = false;
      return;
    }

    setState({ phase: "STATE_REREAD", txHash, result });
    runningRef.current = false;
  }, []);

  const reset = useCallback(() => setState({ phase: "IDLE" }), []);

  return { state, run, reset };
}
