/**
 * /projects and /incidents must read live FailoverRegistry state
 * (list_project_ids / get_project / get_history) and must NEVER silently
 * fall back to lib/fixtures/demoProject.ts on a read failure -- they show a
 * visible fail-closed error state instead. Fixture-driven walkthroughs only
 * live under /demo.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const readProjectIds = vi.fn();
const readProject = vi.fn();
const readHistory = vi.fn();

vi.mock("@/lib/contract/registryAdapter", () => ({
  readProjectIds: (...args: unknown[]) => readProjectIds(...args),
  readProject: (...args: unknown[]) => readProject(...args),
  readHistory: (...args: unknown[]) => readHistory(...args),
}));

vi.mock("@/lib/contract/addresses", () => ({
  FAILOVER_REGISTRY_ADDRESS: "0x" + "a".repeat(40),
  isDeployed: (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr),
}));

import ProjectsPage from "@/app/projects/page";
import IncidentsPage from "@/app/incidents/page";

describe("live /projects listing", () => {
  beforeEach(() => {
    readProjectIds.mockReset();
    readProject.mockReset();
  });

  it("renders real registry projects, not fixture data", async () => {
    readProjectIds.mockResolvedValue(["orbit-wallet"]);
    readProject.mockResolvedValue({
      project_id: "orbit-wallet",
      name: "Orbit Wallet Live",
      status: "SAFE",
      owner: "0xowner",
    });

    const ui = await ProjectsPage();
    render(ui as React.ReactElement);

    await waitFor(() => expect(screen.getByText("Orbit Wallet Live")).toBeInTheDocument());
    expect(screen.getByText("orbit-wallet")).toBeInTheDocument();
  });

  it("shows a fail-closed error state on a read failure instead of falling back to fixtures", async () => {
    readProjectIds.mockRejectedValue(new Error("registry unreachable"));

    const ui = await ProjectsPage();
    render(ui as React.ReactElement);

    expect(screen.getByText(/registry read failed/i)).toBeInTheDocument();
    expect(screen.getByText(/registry unreachable/i)).toBeInTheDocument();
    // Must not silently render the fixture demo project name.
    expect(screen.queryByText(/orbit wallet live/i)).not.toBeInTheDocument();
  });
});

describe("live /incidents timeline", () => {
  beforeEach(() => {
    readProjectIds.mockReset();
    readHistory.mockReset();
  });

  it("renders merged real registry history across projects, not fixture data", async () => {
    readProjectIds.mockResolvedValue(["orbit-wallet"]);
    readHistory.mockResolvedValue([
      { type: "CHECK", at: 1700000000, previous_status: "PENDING_FIRST_CHECK", new_status: "SAFE" },
    ]);

    const ui = await IncidentsPage();
    render(ui as React.ReactElement);

    await waitFor(() => expect(screen.getByText(/safety check/i)).toBeInTheDocument());
    expect(screen.getByText(/PENDING_FIRST_CHECK/)).toBeInTheDocument();
  });

  it("shows a fail-closed error state on a read failure instead of falling back to fixtures", async () => {
    readProjectIds.mockRejectedValue(new Error("history read failed"));

    const ui = await IncidentsPage();
    render(ui as React.ReactElement);

    expect(screen.getByText(/history read failed — refusing/i)).toBeInTheDocument();
  });
});
