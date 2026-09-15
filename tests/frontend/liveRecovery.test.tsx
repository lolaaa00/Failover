import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const readStatus = vi.fn();
const submitRunRecoveryCheck = vi.fn();
const submitMarkRecoveredSafe = vi.fn();
const submitRecovery = vi.fn();
const assertExecutionSucceeded = vi.fn();

vi.mock("@/lib/contract/registryAdapter", () => ({
  readStatus: (...args: unknown[]) => readStatus(...args),
  submitRunRecoveryCheck: (...args: unknown[]) => submitRunRecoveryCheck(...args),
  submitMarkRecoveredSafe: (...args: unknown[]) => submitMarkRecoveredSafe(...args),
  submitRecovery: (...args: unknown[]) => submitRecovery(...args),
}));

vi.mock("@/lib/contract/finality", () => ({
  createFinalityStep: () => ({
    waitForFinality: async () => ({ status: "FINALIZED" as const }),
    assertExecutionSucceeded: () => assertExecutionSucceeded(),
  }),
}));

vi.mock("@/lib/wallet/WalletProvider", () => ({
  useWallet: () => ({
    status: "CONNECTED",
    address: "0xowner000000000000000000000000000000000a",
    chainId: 61999,
    provider: {},
    connect: vi.fn(),
    switchToStudionet: vi.fn(),
  }),
  isWriteReady: () => true,
}));

// These are the same permissionless recovery-flow panels rendered by
// app/p/[id]/recovery/page.tsx once it reads the project's live status --
// exercised directly here (rather than through the page, which unwraps
// Next's `params` promise via `use()`) so the tx-wiring itself is covered
// without depending on a Suspense-capable test renderer.
import {
  RunRecoveryCheckPanel,
  PromoteToSafePanel,
  SubmitRecoveryForm,
} from "@/app/p/[id]/recovery/page";

const OWNER = "0xowner000000000000000000000000000000000a";

describe("live recovery panels", () => {
  beforeEach(() => {
    readStatus.mockReset();
    submitRunRecoveryCheck.mockReset().mockResolvedValue("0xtx1");
    submitMarkRecoveredSafe.mockReset().mockResolvedValue("0xtx2");
    submitRecovery.mockReset().mockResolvedValue("0xtx3");
    assertExecutionSucceeded.mockReset();
  });

  it("RunRecoveryCheckPanel triggers the permissionless run_recovery_check write, not a self-unpause", async () => {
    readStatus.mockResolvedValue("RECOVERY_PENDING");
    const onChecked = vi.fn();

    render(<RunRecoveryCheckPanel projectId="orbit-wallet" onChecked={onChecked} />);
    fireEvent.click(screen.getByRole("button", { name: /run recovery check/i }));

    await waitFor(() =>
      expect(submitRunRecoveryCheck).toHaveBeenCalledWith(OWNER, {}, "orbit-wallet"),
    );
    await waitFor(() => expect(onChecked).toHaveBeenCalled());
  });

  it("PromoteToSafePanel triggers mark_recovered_safe only once RECOVERED is already consensus-confirmed", async () => {
    readStatus.mockResolvedValue("SAFE");
    const onPromoted = vi.fn();

    render(<PromoteToSafePanel projectId="orbit-wallet" onPromoted={onPromoted} />);
    fireEvent.click(screen.getByRole("button", { name: /promote to safe/i }));

    await waitFor(() =>
      expect(submitMarkRecoveredSafe).toHaveBeenCalledWith(OWNER, {}, "orbit-wallet"),
    );
    await waitFor(() => expect(onPromoted).toHaveBeenCalled());
  });

  it("PromoteToSafePanel reports STATE_MISMATCH instead of a false success when the reread still shows RECOVERED", async () => {
    // Execution itself succeeded (no revert), but the reread still observes
    // RECOVERED (e.g. a stale RPC replica). mark_recovered_safe's
    // postcondition is always SAFE once it doesn't revert, so this must not
    // be reported as success just because it's self-consistent.
    readStatus.mockResolvedValue("RECOVERED");
    const onPromoted = vi.fn();

    render(<PromoteToSafePanel projectId="orbit-wallet" onPromoted={onPromoted} />);
    fireEvent.click(screen.getByRole("button", { name: /promote to safe/i }));

    await waitFor(() =>
      expect(screen.getByText(/post-write state did not match expected outcome/i)).toBeInTheDocument(),
    );
  });

  it("RunRecoveryCheckPanel reports EXECUTION_ERROR instead of a false success when the check reverts", async () => {
    readStatus.mockResolvedValue("RECOVERY_PENDING");
    assertExecutionSucceeded.mockImplementation(() => {
      throw new Error("project is not pending recovery");
    });
    const onChecked = vi.fn();

    render(<RunRecoveryCheckPanel projectId="orbit-wallet" onChecked={onChecked} />);
    fireEvent.click(screen.getByRole("button", { name: /run recovery check/i }));

    await waitFor(() => expect(screen.getByText(/project is not pending recovery/i)).toBeInTheDocument());
    expect(onChecked).not.toHaveBeenCalled();
  });

  it("SubmitRecoveryForm still submits a new recovery release while RESTRICTED", async () => {
    readStatus.mockResolvedValue("RECOVERY_PENDING");
    const onSubmitted = vi.fn();

    render(<SubmitRecoveryForm projectId="orbit-wallet" onSubmitted={onSubmitted} />);

    fireEvent.change(screen.getByPlaceholderText(/releases\/v2-recovery/i), {
      target: { value: "https://github.com/example/app/releases/v2" },
    });
    fireEvent.change(screen.getByPlaceholderText(/rotated compromised deploy keys/i), {
      target: { value: "rotated compromised deploy keys and rebuilt from a clean source tree" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit recovery$/i }));

    await waitFor(() =>
      expect(submitRecovery).toHaveBeenCalledWith(
        OWNER,
        {},
        "orbit-wallet",
        "https://github.com/example/app/releases/v2",
        null,
        "rotated compromised deploy keys and rebuilt from a clean source tree",
      ),
    );
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });
});
