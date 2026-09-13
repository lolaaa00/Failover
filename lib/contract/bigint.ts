/**
 * BigInt-safe helpers. Failover holds no GEN value (spec: value-transfer
 * machinery from generic section 8 is out of scope), but timestamps,
 * cooldowns, and version counters still cross the JSON boundary from
 * u256 contract storage and must never silently lose precision through
 * plain Number parsing of large values.
 */

export function safeBigIntFromUnknown(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`unsafe integer ${value} cannot be converted to bigint without precision loss`);
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new Error(`cannot convert ${JSON.stringify(value)} to bigint`);
}

export function formatUnixSeconds(seconds: number | bigint): string {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms)) return "unknown";
  return new Date(ms).toISOString();
}

export function jsonStringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}
