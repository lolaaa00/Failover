/**
 * Frontend mirror of the contract-side web-evidence hardening rules
 * (see contracts/FailoverRegistry.py: validate_public_url / canonicalize_url).
 *
 * This exists purely as a fast, friendly pre-validation before a user
 * submits a transaction -- the contract re-validates authoritatively and
 * is the only source of truth. Keep both implementations in lockstep;
 * tests/frontend/urls.test.ts cross-checks representative cases against
 * the same fixtures used by the Python unit tests.
 */

export const MAX_URL_LENGTH = 512;

const PRIVATE_HOST_PREFIXES = ["localhost", "127.", "0.0.0.0", "::1", "10.", "192.168.", "169.254."];

const PRIVATE_172_RE = /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const HOST_LABEL_RE = /^[a-z0-9-]+$/;

export class UrlValidationError extends Error {}

function parseUrlStrict(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlValidationError("URL is not well-formed");
  }
  return url;
}

/** Canonicalize: lowercase host, drop default port, drop trailing slash
 * (except root), drop fragment. Mirrors contracts/FailoverRegistry.py. */
export function canonicalizeUrl(raw: string): string {
  const url = parseUrlStrict(raw);
  const host = url.hostname.toLowerCase();
  validateHost(host);
  const port = url.port && url.port !== "443" ? `:${url.port}` : "";
  let path = url.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return `https://${host}${port}${path}`;
}

function isIpv4Literal(host: string): boolean {
  if (!IPV4_RE.test(host)) return false;
  return host.split(".").every((part) => Number(part) <= 255);
}

function validateHost(host: string): void {
  if (!host || host.length > 253) {
    throw new UrlValidationError("URL host is invalid");
  }
  if (host.includes(":") || isIpv4Literal(host)) {
    throw new UrlValidationError("URL must not use IP literals");
  }
  if (!host.includes(".")) {
    throw new UrlValidationError("URL host must be a fully qualified domain");
  }
  if (host.includes("..")) {
    throw new UrlValidationError("URL host is invalid");
  }
  for (const label of host.split(".")) {
    if (!label || label.length > 63 || label.startsWith("-") || label.endsWith("-") || !HOST_LABEL_RE.test(label)) {
      throw new UrlValidationError("URL host is invalid");
    }
  }
}

export function validatePublicUrl(raw: string): string {
  if (!raw || typeof raw !== "string") {
    throw new UrlValidationError("URL is required");
  }
  if (raw.length > MAX_URL_LENGTH) {
    throw new UrlValidationError(`URL exceeds ${MAX_URL_LENGTH} characters`);
  }
  if (!raw.startsWith("https://")) {
    throw new UrlValidationError("URL must use https://");
  }

  const url = parseUrlStrict(raw);

  if (url.username || url.password) {
    throw new UrlValidationError("URL must not embed credentials");
  }
  if (url.hash) {
    throw new UrlValidationError("URL must not carry an identity-affecting fragment");
  }

  const host = url.hostname.toLowerCase();
  validateHost(host);
  for (const prefix of PRIVATE_HOST_PREFIXES) {
    if (host === prefix || host.startsWith(prefix)) {
      throw new UrlValidationError("URL resolves to a private/localhost target");
    }
  }
  if (PRIVATE_172_RE.test(host)) {
    throw new UrlValidationError("URL resolves to a private network target");
  }
  if (url.port && url.port !== "443") {
    throw new UrlValidationError("URL must use https standard port 443");
  }

  return canonicalizeUrl(raw);
}

/** Canonical host used to group sources so two pages on one domain never
 * count as independent evidence. */
export function canonicalDomain(raw: string): string {
  const url = parseUrlStrict(raw);
  return url.hostname.toLowerCase();
}

export function assertNoDuplicateUrls(urls: string[]): void {
  const canon = urls.map((u) => validatePublicUrl(u));
  const unique = new Set(canon);
  if (unique.size !== canon.length) {
    throw new UrlValidationError("duplicate URL across registration fields");
  }
}
