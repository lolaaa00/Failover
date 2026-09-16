import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { evaluateGateBinding } from "@/app/gate/[id]/page";

describe("evaluateGateBinding (pure)", () => {
  it("allows the live gate when the route project and registry both match", () => {
    const result = evaluateGateBinding({
      routeProjectId: "orbit-wallet",
      linkedProject: "orbit-wallet",
      gateRegistryAddress: "0xAAAA00000000000000000000000000000000000A",
      configuredRegistryAddress: "0xaaaa00000000000000000000000000000000000a",
    });
    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("fails closed when the route project does not match the gate's linked project", () => {
    const result = evaluateGateBinding({
      routeProjectId: "some-other-project",
      linkedProject: "orbit-wallet",
      gateRegistryAddress: "0xAAAA00000000000000000000000000000000000A",
      configuredRegistryAddress: "0xAAAA00000000000000000000000000000000000A",
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/some-other-project/);
    expect(result.reasons.join(" ")).toMatch(/orbit-wallet/);
  });

  it("fails closed when the gate's registry does not match the configured registry", () => {
    const result = evaluateGateBinding({
      routeProjectId: "orbit-wallet",
      linkedProject: "orbit-wallet",
      gateRegistryAddress: "0xBBBB00000000000000000000000000000000000B",
      configuredRegistryAddress: "0xAAAA00000000000000000000000000000000000A",
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/0xBBBB00000000000000000000000000000000000B/);
    expect(result.reasons.join(" ")).toMatch(/0xAAAA00000000000000000000000000000000000A/);
  });

  it("reports both reasons when both the project and the registry mismatch", () => {
    const result = evaluateGateBinding({
      routeProjectId: "some-other-project",
      linkedProject: "orbit-wallet",
      gateRegistryAddress: "0xBBBB00000000000000000000000000000000000B",
      configuredRegistryAddress: "0xAAAA00000000000000000000000000000000000A",
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });
});

const readGateLinkedProject = vi.fn();
const readGateRegistryAddress = vi.fn();
const readIsGateOpen = vi.fn();
const readGateCounts = vi.fn();
const readGateReceipts = vi.fn();

vi.mock("@/lib/contract/gateAdapter", () => ({
  readGateLinkedProject: (...args: unknown[]) => readGateLinkedProject(...args),
  readGateRegistryAddress: (...args: unknown[]) => readGateRegistryAddress(...args),
  readIsGateOpen: (...args: unknown[]) => readIsGateOpen(...args),
  readGateCounts: (...args: unknown[]) => readGateCounts(...args),
  readGateReceipts: (...args: unknown[]) => readGateReceipts(...args),
  submitExecuteHighRisk: vi.fn(),
  submitExecuteLowRisk: vi.fn(),
  submitTryExecuteHighRiskOrRecordRefusal: vi.fn(),
}));

const { CONFIGURED_REGISTRY, CONFIGURED_GATE } = vi.hoisted(() => ({
  CONFIGURED_REGISTRY: "0xAAAA00000000000000000000000000000000000A",
  CONFIGURED_GATE: "0xCCCC00000000000000000000000000000000000C",
}));

vi.mock("@/lib/contract/addresses", () => ({
  isDeployed: (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr),
  FAILOVER_GATE_ADDRESS: CONFIGURED_GATE,
  FAILOVER_REGISTRY_ADDRESS: CONFIGURED_REGISTRY,
}));

vi.mock("@/lib/contract/finality", () => ({
  createFinalityStep: () => ({
    waitForFinality: async () => ({ status: "FINALIZED" as const }),
    assertExecutionSucceeded: () => {},
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

import LiveGatePage from "@/app/gate/[id]/page";

// React's `use()` treats an already-fulfilled thenable (status/value already
// set) as resolved synchronously, avoiding a Suspense boundary that this
// version of the test renderer never seems to flush for a fresh
// Promise.resolve() -- this is the same shape Next.js's own resolved params
// promises carry once the router has already resolved them.
function resolvedParams(id: string) {
  return {
    status: "fulfilled",
    value: { id },
    then(onFulfilled: (v: { id: string }) => void) {
      onFulfilled({ id });
    },
  } as unknown as Promise<{ id: string }>;
}

describe("live gate binding enforcement", () => {
  beforeEach(() => {
    readGateLinkedProject.mockReset();
    readGateRegistryAddress.mockReset();
    readIsGateOpen.mockReset().mockResolvedValue(true);
    readGateCounts.mockReset().mockResolvedValue({ high_risk_executed: 0, low_risk_executed: 0, refused: 0 });
    readGateReceipts.mockReset().mockResolvedValue([]);
  });

  it("allows the live gate when the route project matches the gate's authoritative binding", async () => {
    readGateLinkedProject.mockResolvedValue("orbit-wallet");
    readGateRegistryAddress.mockResolvedValue(CONFIGURED_REGISTRY);

    render(<LiveGatePage params={resolvedParams("orbit-wallet")} />);

    // Binding must be re-read from the deployed contract on every load,
    // never trusted from local config or cached.
    await waitFor(() => expect(readGateLinkedProject).toHaveBeenCalled());
    await waitFor(() => expect(readGateRegistryAddress).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByRole("button", { name: /execute_high_risk/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /execute_low_risk/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fails closed when the route project does not match the gate's linked project", async () => {
    readGateLinkedProject.mockResolvedValue("orbit-wallet");
    readGateRegistryAddress.mockResolvedValue(CONFIGURED_REGISTRY);

    render(<LiveGatePage params={resolvedParams("some-other-project")} />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/binding mismatch/i)).toBeInTheDocument();
    expect(screen.getByText(/some-other-project/)).toBeInTheDocument();

    // No write action is ever rendered while the binding is wrong.
    expect(screen.queryByRole("button", { name: /execute_high_risk/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute_low_risk/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try_high_risk_or_record_refusal/i })).not.toBeInTheDocument();

    // And the gate is never read or shown as if it were valid for this route.
    expect(readIsGateOpen).not.toHaveBeenCalled();
    expect(screen.queryByText(/OPEN/)).not.toBeInTheDocument();
  });

  it("fails closed when the gate's bound registry does not match the configured registry", async () => {
    readGateLinkedProject.mockResolvedValue("orbit-wallet");
    readGateRegistryAddress.mockResolvedValue("0xBBBB00000000000000000000000000000000000B");

    render(<LiveGatePage params={resolvedParams("orbit-wallet")} />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/binding mismatch/i)).toBeInTheDocument();
    expect(screen.getByText(/0xBBBB00000000000000000000000000000000000B/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute_high_risk/i })).not.toBeInTheDocument();
    expect(readIsGateOpen).not.toHaveBeenCalled();
  });

  it("never shows a stale valid gate state while a binding mismatch is being reported", async () => {
    readGateLinkedProject.mockResolvedValue("orbit-wallet");
    readGateRegistryAddress.mockResolvedValue("0xBBBB00000000000000000000000000000000000B");

    render(<LiveGatePage params={resolvedParams("orbit-wallet")} />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText(/gate state/i)).not.toBeInTheDocument();
    expect(readGateCounts).not.toHaveBeenCalled();
    expect(readGateReceipts).not.toHaveBeenCalled();
  });
});
