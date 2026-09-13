import type { CheckHistoryRecord, ProjectRecord, StructuredFinding } from "@/lib/contract/types";

/**
 * Canonical demo fixtures (spec section 13, Failover-specific).
 *
 * These are static, deterministic scenarios that let a reviewer walk
 * SAFE -> RESTRICTED -> RECOVERY_PENDING -> SAFE without a live GenLayer
 * node or live external sites. They mirror exactly what the real
 * FailoverRegistry contract would store and compute (same JSON shapes,
 * same deterministic finding->status mapping), so the demo is a faithful
 * stand-in rather than a fabrication of contract behavior.
 */

export const DEMO_PROJECT_ID = "orbit-wallet";

export const CLEAN_FINDING: StructuredFinding = {
  finding: "CLEAN",
  frontend_identity: "MATCH",
  release_relation: "CURRENT",
  incident_state: "NONE",
  expected_address_relation: "MATCH",
  evidence: [
    {
      source: "frontend",
      excerpt: "Orbit Wallet v2.3 — official deposit contract 0x9f1c...4e2a",
    },
    { source: "release", excerpt: "Release v2.3.0 — tag matches deployed frontend build hash" },
    { source: "incident", excerpt: "All systems operational. No active incidents." },
  ],
  reason: "Frontend, release, and incident sources are mutually consistent with the declared project.",
};

export const COMPROMISED_FINDING: StructuredFinding = {
  finding: "COMPROMISED",
  frontend_identity: "MISMATCH",
  release_relation: "UNRELATED",
  incident_state: "NONE",
  expected_address_relation: "MISMATCH",
  evidence: [
    {
      source: "frontend",
      excerpt: "Connect wallet and approve — deposit contract 0xATTACKER0000000000000000000000000000dead",
    },
    { source: "release", excerpt: "Release v2.3.0 — tag does not reference the currently served frontend bundle" },
  ],
  reason: "Live frontend references a deposit address that does not match the expected official address.",
};

export const INCIDENT_FINDING: StructuredFinding = {
  finding: "INCIDENT_DECLARED",
  frontend_identity: "MISMATCH",
  release_relation: "UNRELATED",
  incident_state: "ACTIVE",
  expected_address_relation: "MISMATCH",
  evidence: [
    {
      source: "incident",
      excerpt: "SECURITY NOTICE: orbitwallet.app has been compromised. Do not connect your wallet.",
    },
  ],
  reason: "Official incident channel has declared an active compromise of the public frontend.",
};

export const RECOVERED_FINDING: StructuredFinding = {
  finding: "CLEAN",
  frontend_identity: "MATCH",
  release_relation: "CURRENT",
  incident_state: "RESOLVED",
  expected_address_relation: "MATCH",
  evidence: [
    { source: "frontend", excerpt: "Orbit Wallet v2.4 (recovery) — deposit contract 0x9f1c...4e2a restored" },
    { source: "release", excerpt: "Release v2.4.0-recovery — rotated deploy keys, rebuilt from clean source" },
    { source: "incident", excerpt: "RESOLVED: frontend has been restored and verified. Safe to use." },
  ],
  reason: "Recovery release restores expected frontend identity; incident channel confirms resolution.",
};

export type DemoStage = "SAFE" | "RESTRICTED" | "RECOVERY_PENDING" | "RECOVERED_TO_SAFE";

const BASE_PROJECT: Omit<ProjectRecord, "status" | "last_finding" | "version" | "release_url" | "frontend_url"> = {
  project_id: DEMO_PROJECT_ID,
  owner: "0x000000000000000000000000000000000000f00d",
  name: "Orbit Wallet",
  incident_url: "https://status.orbitwallet.app/",
  source_domains: ["app.orbitwallet.app", "github.com", "status.orbitwallet.app"],
  expected_address: "0x9f1c00000000000000000000000000000000004e2a",
  check_cooldown_seconds: 300,
  stale_release_policy: "RESTRICTED",
  unavailable_policy: "RESTRICTED",
  created_at: 1_700_000_000,
  activated_at: 1_700_000_100,
  recovery_pending: false,
};

export function demoProjectForStage(stage: DemoStage): ProjectRecord {
  switch (stage) {
    case "SAFE":
      return {
        ...BASE_PROJECT,
        frontend_url: "https://app.orbitwallet.app/",
        release_url: "https://github.com/orbit-wallet/app/releases/v2.3.0",
        status: "SAFE",
        last_finding: "CLEAN",
        version: 1,
        recovery_pending: false,
      };
    case "RESTRICTED":
      return {
        ...BASE_PROJECT,
        frontend_url: "https://app.orbitwallet.app/",
        release_url: "https://github.com/orbit-wallet/app/releases/v2.3.0",
        status: "RESTRICTED",
        last_finding: "COMPROMISED",
        version: 1,
        recovery_pending: false,
      };
    case "RECOVERY_PENDING":
      return {
        ...BASE_PROJECT,
        frontend_url: "https://app.orbitwallet.app/",
        release_url: "https://github.com/orbit-wallet/app/releases/v2.4.0-recovery",
        status: "RECOVERY_PENDING",
        last_finding: "COMPROMISED",
        version: 2,
        recovery_pending: true,
      };
    case "RECOVERED_TO_SAFE":
      return {
        ...BASE_PROJECT,
        frontend_url: "https://app.orbitwallet.app/",
        release_url: "https://github.com/orbit-wallet/app/releases/v2.4.0-recovery",
        status: "SAFE",
        last_finding: "CLEAN",
        version: 2,
        recovery_pending: false,
      };
  }
}

export function demoHistoryForStage(stage: DemoStage): CheckHistoryRecord[] {
  const history: CheckHistoryRecord[] = [
    { type: "CHECK", at: 1_700_000_200, previous_status: "SAFE", new_status: "SAFE", finding: CLEAN_FINDING, version: 1 },
  ];
  if (stage === "SAFE") return history;

  history.push({
    type: "CHECK",
    at: 1_700_010_000,
    previous_status: "SAFE",
    new_status: "RESTRICTED",
    finding: COMPROMISED_FINDING,
    version: 1,
  });
  if (stage === "RESTRICTED") return history;

  history.push({
    type: "RECOVERY_SUBMITTED",
    at: 1_700_020_000,
    previous_release_url: "https://github.com/orbit-wallet/app/releases/v2.3.0",
    new_release_url: "https://github.com/orbit-wallet/app/releases/v2.4.0-recovery",
    description: "Rotated compromised deploy keys, rebuilt frontend from a clean, audited source tree.",
    version: 2,
  });
  if (stage === "RECOVERY_PENDING") return history;

  history.push({
    type: "RECOVERY_CHECK",
    at: 1_700_030_000,
    result: "RECOVERED",
    finding: RECOVERED_FINDING,
    version: 2,
  });
  history.push({ type: "PROMOTED_SAFE", at: 1_700_030_100, version: 2 });
  return history;
}

export const DEMO_STAGE_ORDER: DemoStage[] = ["SAFE", "RESTRICTED", "RECOVERY_PENDING", "RECOVERED_TO_SAFE"];

export function nextDemoStage(stage: DemoStage): DemoStage {
  const idx = DEMO_STAGE_ORDER.indexOf(stage);
  return DEMO_STAGE_ORDER[Math.min(idx + 1, DEMO_STAGE_ORDER.length - 1)]!;
}
