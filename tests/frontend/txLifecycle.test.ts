import { describe, expect, it } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTxLifecycle } from "@/lib/contract/txLifecycle";

describe("useTxLifecycle", () => {
  it("walks the full success path to STATE_REREAD", async () => {
    const { result } = renderHook(() => useTxLifecycle<{ ok: true }>());

    await act(async () => {
      await result.current.run({
        submit: async () => "0xtxhash",
        waitForFinality: async () => ({ status: "FINALIZED" }),
        readExecutionResult: async () => ({ ok: true }),
        rereadAndValidate: async () => true,
      });
    });

    await waitFor(() => expect(result.current.state.phase).toBe("STATE_REREAD"));
  });

  it("reports USER_REJECTED on a signature rejection (code 4001)", async () => {
    const { result } = renderHook(() => useTxLifecycle<{ ok: true }>());

    await act(async () => {
      await result.current.run({
        submit: async () => {
          const err = new Error("rejected") as Error & { code: number };
          err.code = 4001;
          throw err;
        },
        waitForFinality: async () => ({ status: "FINALIZED" }),
        readExecutionResult: async () => ({ ok: true }),
        rereadAndValidate: async () => true,
      });
    });

    expect(result.current.state.phase).toBe("USER_REJECTED");
  });

  it("reports CONSENSUS_FAILURE and never advances past it", async () => {
    const { result } = renderHook(() => useTxLifecycle<{ ok: true }>());

    await act(async () => {
      await result.current.run({
        submit: async () => "0xtxhash",
        waitForFinality: async () => ({ status: "CONSENSUS_FAILURE", error: "validators disagreed" }),
        readExecutionResult: async () => ({ ok: true }),
        rereadAndValidate: async () => true,
      });
    });

    expect(result.current.state.phase).toBe("CONSENSUS_FAILURE");
  });

  it("reports STATE_MISMATCH when the post-write reread disagrees", async () => {
    const { result } = renderHook(() => useTxLifecycle<{ ok: true }>());

    await act(async () => {
      await result.current.run({
        submit: async () => "0xtxhash",
        waitForFinality: async () => ({ status: "FINALIZED" }),
        readExecutionResult: async () => ({ ok: true }),
        rereadAndValidate: async () => false,
      });
    });

    expect(result.current.state.phase).toBe("STATE_MISMATCH");
  });

  it("reports EXECUTION_ERROR when reading the execution result throws", async () => {
    const { result } = renderHook(() => useTxLifecycle<{ ok: true }>());

    await act(async () => {
      await result.current.run({
        submit: async () => "0xtxhash",
        waitForFinality: async () => ({ status: "FINALIZED" }),
        readExecutionResult: async () => {
          throw new Error("execution reverted");
        },
        rereadAndValidate: async () => true,
      });
    });

    expect(result.current.state.phase).toBe("EXECUTION_ERROR");
  });
});
