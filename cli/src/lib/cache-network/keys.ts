/**
 * cache-network/keys.ts — deterministic cache key derivation
 *
 * Scope: cacheKey({tool_name, args, contract_hash}) → sha256 hex (64 chars)
 * Contract: NUTRIENTS.md §4 — key derivation must be stable regardless of
 * object key insertion order.
 */

import { createHash } from "node:crypto";

/**
 * Recursively sorts object keys for stable JSON stringification.
 * Arrays preserve order; primitives pass through unchanged.
 *
 * @param value - Any JSON-serializable value
 * @returns A canonical representation suitable for stable hashing
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (typeof value !== "object") {
    // Primitives: string, number, boolean
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    // Arrays: preserve order, recurse on elements
    const elements = value.map((el) => stableStringify(el));
    return "[" + elements.join(",") + "]";
  }

  // Object: sort keys lexicographically, recurse on values
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (key) => JSON.stringify(key) + ":" + stableStringify(obj[key])
  );
  return "{" + pairs.join(",") + "}";
}

/**
 * Input shape for cache key derivation.
 */
export interface CacheKeyInput {
  tool_name: string;
  args: unknown;
  contract_hash: string;
}

/**
 * Derives a deterministic cache key from tool invocation parameters.
 *
 * Key derivation formula (per NUTRIENTS §4):
 *   sha256(tool_name + "|" + stableStringify(args) + "|" + contract_hash)
 *
 * Object key order does not affect the output — keys are sorted recursively
 * before hashing. Arrays preserve element order. Primitives pass through.
 *
 * Returns full lowercase hex sha256 (64 characters). Consumers may slice to
 * first 12 chars for the `key_hash` field in cache events (per NUTRIENTS §3).
 *
 * @param input - Tool name, arguments, and contract hash
 * @returns 64-character lowercase hex sha256 digest
 *
 * @example
 * // These produce identical keys regardless of object key order:
 * cacheKey({ tool_name: "x", args: { a: 1, b: 2 }, contract_hash: "h" })
 * cacheKey({ tool_name: "x", args: { b: 2, a: 1 }, contract_hash: "h" })
 */
export function cacheKey(input: CacheKeyInput): string {
  const { tool_name, args, contract_hash } = input;

  // Build the canonical input string per NUTRIENTS §4
  const canonical = tool_name + "|" + stableStringify(args) + "|" + contract_hash;

  // Hash with sha256, output as lowercase hex
  return createHash("sha256").update(canonical).digest("hex");
}
