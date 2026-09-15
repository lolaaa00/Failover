import { describe, expect, it } from "vitest";
import { findReceiptOutcome } from "@/app/gate/[id]/page";

function receipt(actionHash: string, outcome: string) {
  return JSON.stringify({ kind: "high_risk", action_hash: actionHash, outcome, at: 1, caller: "0xabc" });
}

describe("findReceiptOutcome", () => {
  it("finds the outcome recorded for this exact action_hash", () => {
    const receipts = [receipt("0xaaa", "EXECUTED"), receipt("0xbbb", "REFUSED_NOT_SAFE")];
    expect(findReceiptOutcome(receipts, "0xbbb")).toBe("REFUSED_NOT_SAFE");
  });

  it("is unaffected by a concurrent caller's unrelated receipt landing in between", () => {
    // Simulates another wallet's action being recorded between our
    // submission and our reread -- the aggregate list grew, but our own
    // action_hash's outcome is still found precisely.
    const receipts = [receipt("0xours", "EXECUTED"), receipt("0xsomeone-elses", "EXECUTED")];
    expect(findReceiptOutcome(receipts, "0xours")).toBe("EXECUTED");
  });

  it("returns null when no receipt for this action_hash exists yet", () => {
    const receipts = [receipt("0xaaa", "EXECUTED")];
    expect(findReceiptOutcome(receipts, "0xnotyet")).toBeNull();
  });

  it("returns null on an empty receipts list", () => {
    expect(findReceiptOutcome([], "0xaaa")).toBeNull();
  });

  it("skips unparseable entries instead of throwing", () => {
    const receipts = ["not json", receipt("0xaaa", "EXECUTED")];
    expect(findReceiptOutcome(receipts, "0xaaa")).toBe("EXECUTED");
  });

  it("returns the most recent entry when the same action_hash appears more than once", () => {
    const receipts = [receipt("0xaaa", "REFUSED_NOT_SAFE"), receipt("0xaaa", "EXECUTED")];
    expect(findReceiptOutcome(receipts, "0xaaa")).toBe("EXECUTED");
  });
});
