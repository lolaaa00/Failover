import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const submitActivateProject = vi.fn();
const readStatus = vi.fn();
const routerRefresh = vi.fn();
const assertExecutionSucceeded = vi.fn();
const finalityWaitForFinality = vi.fn();

vi.mock("@/lib/contract/registryAdapter", () => ({
  submitActivateProject: (...args: unknown[]) => submitActivateProject(...args),
  readStatus: (...args: unknown[]) => readStatus(...args),
}));

vi.mock("@/lib/contract/finality", () => ({
  createFinalityStep: () => ({
    waitForFinality: (...args: unknown[]) => finalityWaitForFinality(...args),
    assertExecutionSucceeded: () => assertExecutionSucceeded(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
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

import { ActivateProjectButton } from "@/components/project/ActivateProjectButton";

const OWNER = "0xowner000000000000000000000000000000000a";

describe("ActivateProjectButton", () => {
  beforeEach(() => {
    submitActivateProject.mockReset().mockResolvedValue("0xtxhash");
    readStatus.mockReset();
    routerRefresh.mockReset();
    assertExecutionSucceeded.mockReset();
    finalityWaitForFinality.mockReset().mockResolvedValue({ status: "FINALIZED" });
  });

  it("activates a DRAFT project and reflects PENDING_FIRST_CHECK once finalized", async () => {
    readStatus.mockResolvedValue("PENDING_FIRST_CHECK");

    render(<ActivateProjectButton projectId="orbit-wallet" owner={OWNER} />);

    fireEvent.click(screen.getByRole("button", { name: /activate project/i }));

    await waitFor(() => expect(submitActivateProject).toHaveBeenCalledWith(OWNER, {}, "orbit-wallet"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/confirmed/i));
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("surfaces EXECUTION_ERROR instead of a false success when the chain rejects a non-owner activation", async () => {
    readStatus.mockResolvedValue("DRAFT");
    assertExecutionSucceeded.mockImplementation(() => {
      throw new Error("only owner may activate");
    });

    render(<ActivateProjectButton projectId="orbit-wallet" owner="0xsomeoneelse00000000000000000000000000" />);

    fireEvent.click(screen.getByRole("button", { name: /activate project/i }));

    await waitFor(() => expect(screen.getByText(/only owner may activate/i)).toBeInTheDocument());
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("reports STATE_MISMATCH instead of a false success when the reread still shows DRAFT", async () => {
    // Execution itself succeeded (no revert), but every read -- including
    // the post-finality reread -- still observes DRAFT (e.g. a stale RPC
    // replica). The postcondition activate_project guarantees is
    // PENDING_FIRST_CHECK, so this must not be reported as success just
    // because two back-to-back reads happen to agree with each other.
    readStatus.mockResolvedValue("DRAFT");

    render(<ActivateProjectButton projectId="orbit-wallet" owner={OWNER} />);
    fireEvent.click(screen.getByRole("button", { name: /activate project/i }));

    await waitFor(() =>
      expect(screen.getByText(/post-write state did not match expected outcome/i)).toBeInTheDocument(),
    );
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("warns in the UI when the connected wallet is not the project owner", () => {
    readStatus.mockResolvedValue("DRAFT");
    render(<ActivateProjectButton projectId="orbit-wallet" owner="0xsomeoneelse00000000000000000000000000" />);
    expect(screen.getByText(/not the project owner/i)).toBeInTheDocument();
  });
});
