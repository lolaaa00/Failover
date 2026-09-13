import { describe, expect, it } from "vitest";
import { canonicalDomain, canonicalizeUrl, UrlValidationError, validatePublicUrl } from "./urls";

describe("frontend URL hardening (mirrors contracts/FailoverRegistry.py)", () => {
  it("accepts a well-formed https URL", () => {
    expect(validatePublicUrl("https://example.com/status")).toBe("https://example.com/status");
  });

  it("canonicalizes host case, default port, and trailing slash", () => {
    expect(canonicalizeUrl("https://Example.COM:443/a/")).toBe("https://example.com/a");
    expect(canonicalizeUrl("https://example.com")).toBe("https://example.com/");
  });

  it("rejects http://", () => {
    expect(() => validatePublicUrl("http://example.com")).toThrow(UrlValidationError);
  });

  it.each(["https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.1/x", "https://192.168.0.1/x"])(
    "rejects private/localhost target %s",
    (bad) => {
      expect(() => validatePublicUrl(bad)).toThrow(UrlValidationError);
    },
  );

  it("rejects embedded credentials", () => {
    expect(() => validatePublicUrl("https://user:pass@example.com/")).toThrow(UrlValidationError);
  });

  it("rejects an identity-affecting fragment", () => {
    expect(() => validatePublicUrl("https://example.com/x#frag")).toThrow(UrlValidationError);
  });

  it("rejects over-length URLs", () => {
    const long = "https://example.com/" + "a".repeat(600);
    expect(() => validatePublicUrl(long)).toThrow(UrlValidationError);
  });

  it("groups two paths on the same host under one canonical domain", () => {
    expect(canonicalDomain("https://example.com/a")).toBe(canonicalDomain("https://example.com/b"));
  });
});
