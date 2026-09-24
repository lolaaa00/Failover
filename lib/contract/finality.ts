import { TransactionStatus, ExecutionResult, type GenLayerTransaction } from "genlayer-js/types";
import { createReadClient } from "@/lib/genlayer/client";

/**
 * Real transaction consensus/finality handling for every Failover write.
 *
 * A submitted tx hash is never treated as success on its own (spec section
 * 13). This module polls the GenLayer node until the leader/validator round
 * for a transaction actually reaches FINALIZED, then inspects the finalized
 * receipt's execution result so a transaction that finalized but whose
 * on-chain call raised (e.g. an owner-only check, a cooldown, an invariant)
 * is reported as an execution failure instead of a false success.
 */

// GenVM leader/validator rounds involve nondet web fetches and LLM calls,
// so this budget is generous relative to genlayer-js's own default
// (3s / 10 retries ~= 30s) -- 3s x 60 ~= 3 minutes.
export const FINALITY_POLL_INTERVAL_MS = 3000;
export const FINALITY_MAX_RETRIES = 60;

// genlayer-js's waitForTransactionReceipt throws immediately (no retry) if
// the very first lookup doesn't find the transaction yet -- a real race
// right after a wallet submits a write, before the RPC node has indexed it.
// Absorb that specific transient here rather than letting it masquerade as
// a genuine consensus failure.
const PROPAGATION_RETRY_ATTEMPTS = 5;
const PROPAGATION_RETRY_DELAY_MS = 1000;
const NOT_FOUND_MESSAGE_RE = /not found/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SUCCESSFUL_CONSENSUS_RESULT = "MAJORITY_AGREE";

/**
 * GenLayer exposes the decided validator result in slightly different
 * shapes across SDK/RPC versions. Read the canonical value without
 * accepting FINALIZED by itself as a successful write.
 */
function readConsensusResult(receipt: GenLayerTransaction): string | undefined {
  const raw = receipt as unknown as Record<string, unknown>;
  const consensusData = raw.consensus_data;
  const nested = consensusData && typeof consensusData === "object"
    ? (consensusData as Record<string, unknown>)
    : undefined;
  const candidates = [
    raw.consensusResultName,
    raw.consensus_result,
    raw.consensusResult,
    nested?.consensus_result_name,
    nested?.consensus_result,
    nested?.consensusResult,
    nested?.result_name,
    nested?.result,
  ];
  const value = candidates.find((candidate): candidate is string => typeof candidate === "string");
  return value?.trim().toUpperCase();
}

export interface FinalityOutcome {
  status: "FINALIZED" | "CONSENSUS_FAILURE";
  error?: string;
  receipt?: GenLayerTransaction;
}

type WaitForReceiptArgs = {
  hash: `0x${string}`;
  status?: TransactionStatus;
  interval?: number;
  retries?: number;
  /** Undocumented in genlayer-js's public types but supported at runtime --
   * returns the full decoded transaction (camelCase fields matching
   * GenLayerTransaction) instead of the simplified/snake_cased receipt. */
  fullTransaction?: boolean;
};

/**
 * genlayer-js's waitForTransactionReceipt looks the transaction up once
 * before entering its own poll/retry loop, and throws "Transaction not
 * found" immediately -- without retrying -- if that first lookup misses.
 * Right after a wallet submits a write, the RPC node frequently hasn't
 * indexed the transaction yet, so a naive caller sees a spurious
 * consensus failure on an otherwise-healthy transaction. Retry only that
 * specific transient a bounded number of times before giving up; any other
 * error (malformed hash, RPC down, genuine timeout after the transaction
 * was found) propagates immediately.
 */
async function waitForReceiptWithPropagationRetry(
  waitForTransactionReceipt: (args: WaitForReceiptArgs) => Promise<GenLayerTransaction>,
  args: WaitForReceiptArgs,
): Promise<GenLayerTransaction> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await waitForTransactionReceipt(args);
    } catch (err) {
      const message = (err as Error)?.message ?? "";
      if (attempt >= PROPAGATION_RETRY_ATTEMPTS || !NOT_FOUND_MESSAGE_RE.test(message)) {
        throw err;
      }
      await sleep(PROPAGATION_RETRY_DELAY_MS);
    }
  }
}

/**
 * Polls the GenLayer network until the given transaction reaches
 * leader/validator consensus and finality, or exhausts its retry budget.
 */
export async function waitForFinality(txHash: string): Promise<FinalityOutcome> {
  const client = createReadClient();
  const waitForTransactionReceipt = client.waitForTransactionReceipt as unknown as (
    args: WaitForReceiptArgs,
  ) => Promise<GenLayerTransaction>;

  let receipt: GenLayerTransaction;
  try {
    receipt = await waitForReceiptWithPropagationRetry(waitForTransactionReceipt, {
      hash: txHash as `0x${string}`,
      status: TransactionStatus.FINALIZED,
      interval: FINALITY_POLL_INTERVAL_MS,
      retries: FINALITY_MAX_RETRIES,
      fullTransaction: true,
    });
  } catch (err) {
    return {
      status: "CONSENSUS_FAILURE",
      error: (err as Error)?.message ?? "timed out waiting for leader/validator consensus",
    };
  }

  if (receipt.statusName !== TransactionStatus.FINALIZED) {
    return {
      status: "CONSENSUS_FAILURE",
      error: `transaction settled without reaching FINALIZED (status: ${receipt.statusName ?? "unknown"})`,
      receipt,
    };
  }

  const consensusResult = readConsensusResult(receipt);
  if (consensusResult !== SUCCESSFUL_CONSENSUS_RESULT) {
    return {
      status: "CONSENSUS_FAILURE",
      error: `transaction finalized without successful consensus (result: ${consensusResult ?? "unknown"})`,
      receipt,
    };
  }

  return { status: "FINALIZED", receipt };
}

/**
 * Throws with the contract's own error message when a finalized
 * transaction's on-chain call did not succeed, so the caller reports
 * EXECUTION_ERROR instead of a false success.
 */
export function assertExecutionSucceeded(receipt: GenLayerTransaction | undefined): void {
  if (!receipt) return;
  // `txExecutionResultName` is the field genlayer-js's own types document,
  // but real Studionet `fullTransaction: true` receipts leave it undefined
  // even for a genuinely reverted call -- the only field actually populated
  // is consensus_data.leader_receipt[].execution_result ("SUCCESS"/"ERROR").
  // Check both so a revert is never mistaken for success on either shape.
  if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR || leaderExecutionFailed(receipt)) {
    throw new Error(extractLeaderError(receipt) ?? "contract execution reverted");
  }
}

function leaderExecutionFailed(receipt: GenLayerTransaction): boolean {
  const leaderReceipts = receipt.consensus_data?.leader_receipt;
  if (!Array.isArray(leaderReceipts)) return false;
  return leaderReceipts.some((entry) => (entry as { execution_result?: unknown } | undefined)?.execution_result === "ERROR");
}

function extractLeaderError(receipt: GenLayerTransaction): string | undefined {
  const leaderReceipts = receipt.consensus_data?.leader_receipt;
  if (!Array.isArray(leaderReceipts)) return undefined;
  for (const entry of leaderReceipts) {
    const record = entry as {
      error?: unknown;
      genvm_result?: { stderr?: unknown; error_description?: unknown } | null;
    } | undefined;
    // Prefer the documented `.error` field when present, but real receipts
    // instead carry the message inside genvm_result (a Python traceback in
    // `stderr`, or a short `error_description`).
    if (typeof record?.error === "string" && record.error.length > 0) return record.error;
    const stderr = record?.genvm_result?.stderr;
    if (typeof stderr === "string" && stderr.trim().length > 0) {
      return stderr.trim().split("\n").pop();
    }
    const description = record?.genvm_result?.error_description;
    if (typeof description === "string" && description.length > 0) return description;
  }
  return undefined;
}

/**
 * One write submission's finality step, threaded as a closure so the
 * finalized receipt captured while waiting for finality is available to
 * the subsequent execution-result check in the same tx lifecycle run --
 * without widening the shared TxLifecycleDeps<T> contract (whose
 * `waitForFinality` only returns `{status, error}` by design).
 *
 * Usage:
 *   const finality = createFinalityStep();
 *   await run({
 *     submit: () => ...,
 *     waitForFinality: finality.waitForFinality,
 *     readExecutionResult: async () => {
 *       finality.assertExecutionSucceeded();
 *       return ...;
 *     },
 *     rereadAndValidate: async () => ...,
 *   });
 */
export function createFinalityStep() {
  let receipt: GenLayerTransaction | undefined;
  return {
    waitForFinality: async (txHash: string): Promise<{ status: "FINALIZED" | "CONSENSUS_FAILURE"; error?: string }> => {
      const outcome = await waitForFinality(txHash);
      receipt = outcome.receipt;
      return { status: outcome.status, error: outcome.error };
    },
    assertExecutionSucceeded: (): void => assertExecutionSucceeded(receipt),
  };
}
