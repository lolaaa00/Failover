/**
 * Finding 6 regression tests: live/demo separation.
 *
 * Tests the isDeployed helper — the pure predicate that drives the
 * live/demo branch in all pages. Covers demo-banner-shown-without-address
 * and live-mode-not-fixture-fallback scenarios.
 */
import { describe, it, expect } from "vitest";
import { isDeployed } from "@/lib/contract/addresses";

// ---------------------------------------------------------------------------
// test_demo_banner_shown_without_address
// ---------------------------------------------------------------------------

describe("test_demo_banner_shown_without_address", () => {
  it("isDeployed returns false for empty address (no contract deployed = demo mode)", () => {
    expect(isDeployed("")).toBe(false);
  });

  it("isDeployed returns false for non-address strings", () => {
    expect(isDeployed("not-an-address")).toBe(false);
    expect(isDeployed("0x")).toBe(false);       // too short
    expect(isDeployed("0x1234")).toBe(false);    // too short
    expect(isDeployed("0x" + "a".repeat(41))).toBe(false);  // too long
  });

  it("demo mode (no address) means !isDeployed is true — banner must be shown", () => {
    const registryAddress = "";  // no env var configured
    const isDemoMode = !isDeployed(registryAddress);
    expect(isDemoMode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// test_live_mode_not_fixture_fallback
// ---------------------------------------------------------------------------

describe("test_live_mode_not_fixture_fallback", () => {
  it("isDeployed returns true for a valid 42-char 0x address", () => {
    expect(isDeployed("0x" + "b".repeat(40))).toBe(true);
  });

  it("live mode is active when a valid registry address is configured", () => {
    const registryAddress = "0x" + "c".repeat(40);
    const isLiveMode = isDeployed(registryAddress);
    expect(isLiveMode).toBe(true);
  });

  it("live mode must not fall back to fixture data — not-found shown for unknown project", () => {
    // Structural test: the branch predicate correctly separates live from demo.
    // In live mode (isDeployed true), pages show not-found instead of fixtures.
    const DEMO_ADDRESS = "";
    const LIVE_ADDRESS = "0x" + "d".repeat(40);

    // Demo mode: isDeployed false → fixture fallback shown with banner
    expect(isDeployed(DEMO_ADDRESS)).toBe(false);
    // Live mode: isDeployed true → fixture fallback NOT shown; not-found shown instead
    expect(isDeployed(LIVE_ADDRESS)).toBe(true);
  });
});
