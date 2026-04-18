// Mycelium Framework — VibeSpace LLC — The network provides.
//
// SDK usage metadata reconciliation.
//
// Parses token counts from Claude SDK response objects and converts them
// to a normalized cost payload suitable for telemetry emission.
//
// NOTE: USD estimates are based on published rates — reconcile against
// actual billing externally.

import { getCost, type CostEntry } from "./cost-table.js";

/**
 * SDK usage object shape. The SDK may include different fields depending
 * on version; we handle missing fields gracefully.
 */
export interface SDKUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  // Legacy field names (older SDK versions)
  cache_write_tokens?: number;
  cache_read_tokens?: number;
}

/**
 * Reconciled usage with normalized token counts and USD estimate.
 */
export interface ReconciledUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd_estimate: number;
}

/**
 * Track which missing-field warnings we've already emitted this run.
 * Prevents log spam while still alerting users to potential issues.
 */
const warnedFields = new Set<string>();

/**
 * Log a one-time warning about a missing field.
 */
function warnOnceMissing(field: string, model: string): void {
  const key = `${field}:${model}`;
  if (!warnedFields.has(key)) {
    warnedFields.add(key);
    console.warn(
      `[cost-reconcile] Warning: Missing '${field}' in SDK usage for model '${model}'; defaulting to 0. ` +
      `This may indicate an older SDK version or unexpected response shape.`
    );
  }
}

/**
 * Reset warning state. Call at the start of a new run to re-enable
 * one-time warnings for that run.
 */
export function resetWarnings(): void {
  warnedFields.clear();
}

/**
 * Calculate USD estimate from token counts and cost entry.
 *
 * @param tokens - Token counts per category
 * @param costs - USD per million tokens for each category
 * @returns USD estimate (rounded to 6 decimal places)
 */
function calculateUSD(
  tokens: { input: number; output: number; cache_read: number; cache_write: number },
  costs: CostEntry
): number {
  const MILLION = 1_000_000;
  const usd =
    (tokens.input * costs.input) / MILLION +
    (tokens.output * costs.output) / MILLION +
    (tokens.cache_read * costs.cache_read) / MILLION +
    (tokens.cache_write * costs.cache_write) / MILLION;

  // Round to 6 decimal places to avoid floating-point noise
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/**
 * Safely extract a numeric value from SDK usage, defaulting to 0 for
 * missing/invalid values.
 *
 * @param value - Value from SDK (may be undefined, null, or non-number)
 * @param fieldName - Field name for warning messages
 * @param model - Model name for warning context
 * @param warnOnMissing - Whether to emit a warning for missing values
 * @returns Numeric value, or 0 if missing/invalid
 */
function safeNumber(
  value: unknown,
  fieldName: string,
  model: string,
  warnOnMissing: boolean
): number {
  if (value === undefined || value === null) {
    if (warnOnMissing) {
      warnOnceMissing(fieldName, model);
    }
    return 0;
  }
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    warnOnceMissing(`${fieldName} (invalid value: ${value})`, model);
    return 0;
  }
  return Math.floor(num); // Ensure integer
}

/**
 * Reconcile SDK usage metadata into a normalized cost payload.
 *
 * Handles multiple SDK response shapes:
 * - Modern SDK: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
 * - Legacy SDK: `input_tokens`, `output_tokens`, `cache_write_tokens`, `cache_read_tokens`
 * - Partial responses: any subset of the above
 *
 * @param sdkUsage - Usage object from SDK response (may be partial or undefined)
 * @param model - Model identifier for cost lookup and warnings
 * @returns Normalized usage with token counts and USD estimate
 *
 * @example
 * ```ts
 * const usage = reconcileUsage(
 *   { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200 },
 *   "claude-sonnet-4-6"
 * );
 * // { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 200, cache_write_tokens: 0, usd_estimate: 0.010650 }
 * ```
 */
export function reconcileUsage(
  sdkUsage: SDKUsage | null | undefined,
  model: string
): ReconciledUsage {
  // Handle null/undefined usage object
  if (!sdkUsage) {
    warnOnceMissing("usage object", model);
    return {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      usd_estimate: 0,
    };
  }

  // Extract token counts, handling both modern and legacy field names
  const input_tokens = safeNumber(
    sdkUsage.input_tokens,
    "input_tokens",
    model,
    true
  );

  const output_tokens = safeNumber(
    sdkUsage.output_tokens,
    "output_tokens",
    model,
    true
  );

  // Cache read: try modern field name first, fall back to legacy
  const cache_read_tokens = safeNumber(
    sdkUsage.cache_read_input_tokens ?? sdkUsage.cache_read_tokens,
    "cache_read_input_tokens",
    model,
    false // Don't warn — cache fields are optional
  );

  // Cache write: try modern field name first, fall back to legacy
  const cache_write_tokens = safeNumber(
    sdkUsage.cache_creation_input_tokens ?? sdkUsage.cache_write_tokens,
    "cache_creation_input_tokens",
    model,
    false // Don't warn — cache fields are optional
  );

  // Look up cost rates for this model
  const costs = getCost(model);

  // Calculate USD estimate
  const usd_estimate = calculateUSD(
    {
      input: input_tokens,
      output: output_tokens,
      cache_read: cache_read_tokens,
      cache_write: cache_write_tokens,
    },
    costs
  );

  return {
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_write_tokens,
    usd_estimate,
  };
}

/**
 * Extract usage from various SDK response shapes.
 *
 * The Claude SDK may return usage in different locations depending on
 * the API used (Messages API vs Conversations API vs Agent SDK).
 * This helper probes common locations.
 *
 * @param result - SDK response object (any shape)
 * @returns Usage object if found, undefined otherwise
 */
export function extractUsageFromResult(result: unknown): SDKUsage | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const obj = result as Record<string, unknown>;

  // Direct usage field (Messages API)
  if (obj.usage && typeof obj.usage === "object") {
    return obj.usage as SDKUsage;
  }

  // Nested in message (Agent SDK)
  if (obj.message && typeof obj.message === "object") {
    const msg = obj.message as Record<string, unknown>;
    if (msg.usage && typeof msg.usage === "object") {
      return msg.usage as SDKUsage;
    }
  }

  // Nested in response (some SDK wrappers)
  if (obj.response && typeof obj.response === "object") {
    const resp = obj.response as Record<string, unknown>;
    if (resp.usage && typeof resp.usage === "object") {
      return resp.usage as SDKUsage;
    }
  }

  // Check for aggregated usage (multi-turn conversations)
  if (obj.total_usage && typeof obj.total_usage === "object") {
    return obj.total_usage as SDKUsage;
  }

  return undefined;
}

/**
 * Extract model name from various SDK response shapes.
 *
 * @param result - SDK response object (any shape)
 * @returns Model name if found, "unknown" otherwise
 */
export function extractModelFromResult(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "unknown";
  }

  const obj = result as Record<string, unknown>;

  // Direct model field
  if (typeof obj.model === "string" && obj.model) {
    return obj.model;
  }

  // Nested in message
  if (obj.message && typeof obj.message === "object") {
    const msg = obj.message as Record<string, unknown>;
    if (typeof msg.model === "string" && msg.model) {
      return msg.model;
    }
  }

  // Nested in response
  if (obj.response && typeof obj.response === "object") {
    const resp = obj.response as Record<string, unknown>;
    if (typeof resp.model === "string" && resp.model) {
      return resp.model;
    }
  }

  return "unknown";
}
