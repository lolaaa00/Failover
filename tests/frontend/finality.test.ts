import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const waitForTransactionReceipt = vi.fn();

vi.mock("@/lib/genlayer/client", () => ({
  createReadClient: () => ({ waitForTransactionReceipt }),
}));

import { assertExecutionSucceeded, createFinalityStep, waitForFinality } from "@/lib/contract/finality";

describe("waitForFinality", () => {
  beforeEach(() => {
    waitForTransactionReceipt.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports FINALIZED once the node confirms leader/validator finality", async () => {
    waitForTransactionReceipt.mockResolvedValue({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" });

    const result = await waitForFinality("0xabc");

    expect(result.status).toBe("FINALIZED");
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ hash: "0xabc", status: "FINALIZED", fullTransaction: true }),
    );
  });

  it("reports CONSENSUS_FAILURE when the node times out waiting for finality", async () => {
    waitForTransactionReceipt.mockRejectedValue(new Error("Timed out waiting for transaction 0xabc"));

    const result = await waitForFinality("0xabc");

    expect(result.status).toBe("CONSENSUS_FAILURE");
    expect(result.error).toMatch(/timed out/i);
    // A genuine timeout is not the "not indexed yet" transient -- must not
    // be retried under that budget.
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(1);
  });

  it("reports CONSENSUS_FAILURE if the settled receipt never actually reached FINALIZED", async () => {
    waitForTransactionReceipt.mockResolvedValue({ statusName: "UNDETERMINED" });

    const result = await waitForFinality("0xabc");

    expect(result.status).toBe("CONSENSUS_FAILURE");
    expect(result.error).toMatch(/UNDETERMINED/);
  });

  it("retries past a transient 'transaction not found' race right after submission", async () => {
    waitForTransactionReceipt
      .mockRejectedValueOnce(new Error("Transaction not found: 0xabc"))
      .mockRejectedValueOnce(new Error("Transaction not found: 0xabc"))
      .mockResolvedValueOnce({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" });

    const resultPromise = waitForFinality("0xabc");
    // Flush the two 1s propagation-retry backoffs without a real wall-clock wait.
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("FINALIZED");
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(3);
  });

  it("gives up and reports CONSENSUS_FAILURE once the 'not found' race outlasts the retry budget", async () => {
    waitForTransactionReceipt.mockRejectedValue(new Error("Transaction not found: 0xabc"));

    const resultPromise = waitForFinality("0xabc");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("CONSENSUS_FAILURE");
    expect(result.error).toMatch(/not found/i);
    expect(waitForTransactionReceipt.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("assertExecutionSucceeded", () => {
  it("does nothing for a receipt with no data (nothing finalized yet)", () => {
    expect(() => assertExecutionSucceeded(undefined)).not.toThrow();
  });

  it("does not throw when the finalized transaction returned normally", () => {
    expect(() =>
      assertExecutionSucceeded({ txExecutionResultName: "FINISHED_WITH_RETURN" } as never),
    ).not.toThrow();
  });

  it("throws with the contract's own error message when execution failed", () => {
    expect(() =>
      assertExecutionSucceeded({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: { leader_receipt: [{ error: "gate refused: project is not currently SAFE/RECOVERED" }] },
      } as never),
    ).toThrow("gate refused: project is not currently SAFE/RECOVERED");
  });

  it("falls back to a generic message when no leader error text is available", () => {
    expect(() =>
      assertExecutionSucceeded({ txExecutionResultName: "FINISHED_WITH_ERROR" } as never),
    ).toThrow(/contract execution reverted/);
  });
});

describe("createFinalityStep", () => {
  beforeEach(() => {
    waitForTransactionReceipt.mockReset();
  });

  it("threads the finalized receipt from waitForFinality into assertExecutionSucceeded", async () => {
    waitForTransactionReceipt.mockResolvedValue({
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_ERROR",
      consensus_data: { leader_receipt: [{ error: "only owner may activate" }] },
    });

    const step = createFinalityStep();
    const outcome = await step.waitForFinality("0xabc");

    expect(outcome).toEqual({ status: "FINALIZED", error: undefined });
    expect(() => step.assertExecutionSucceeded()).toThrow("only owner may activate");
  });

  it("leaves nothing to assert when finality itself failed", async () => {
    waitForTransactionReceipt.mockRejectedValue(new Error("network unreachable"));

    const step = createFinalityStep();
    const outcome = await step.waitForFinality("0xabc");

    expect(outcome.status).toBe("CONSENSUS_FAILURE");
    expect(() => step.assertExecutionSucceeded()).not.toThrow();
  });
});
