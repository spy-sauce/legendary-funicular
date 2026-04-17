// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Cost rollup from JSONL event log.
//
// Aggregates `cost_recorded` events by organism, biome, and leaf.
// Streams the file line-by-line to handle large event logs without
// loading the entire file into memory.
//
// Contract: NUTRIENTS.md §1 (event schema), §8 (cost table).
// Scope: cost.attribution.rollup leaf.

import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { BaseEvent, CostRecordedData } from "./events.js";

/**
 * Token counts aggregated across all cost events.
 */
export interface TokenCounts {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

/**
 * Result of rolling up costs from a JSONL event log.
 *
 * All USD values are estimates based on published Anthropic rates.
 * Reconcile against actual billing for production accounting.
 */
export interface CostRollup {
  /** Total estimated USD spent in this run. */
  total_usd: number;
  /** USD estimate per biome (top-level agent). */
  by_biome: Record<string, number>;
  /** USD estimate per leaf (fully-qualified leaf ID). */
  by_leaf: Record<string, number>;
  /** Aggregate token counts across all leaves. */
  tokens: TokenCounts;
}

/**
 * Extract the biome (top-level agent) from a leaf ID.
 *
 * Leaf IDs follow the pattern: `biome.sub.sub.leaf` (lineage joined by dots).
 * The biome is always the first segment.
 *
 * @example
 * extractBiome("telemetry-agent.emitter.upgrade") // => "telemetry-agent"
 * extractBiome("cost-agent") // => "cost-agent"
 */
export function extractBiome(leafId: string): string {
  const dot = leafId.indexOf(".");
  return dot === -1 ? leafId : leafId.substring(0, dot);
}

/**
 * Type guard for cost_recorded events.
 */
function isCostRecordedEvent(
  event: BaseEvent
): event is BaseEvent & { data: CostRecordedData } {
  return event.kind === "cost_recorded";
}

/**
 * Parse a single JSONL line into a BaseEvent.
 * Returns null for malformed lines (logged as warning, never throws).
 */
function parseLine(line: string, lineNum: number): BaseEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const event = JSON.parse(trimmed) as BaseEvent;
    // Basic sanity check — all events must have v, kind, and data
    if (typeof event.v !== "number" || typeof event.kind !== "string") {
      console.warn(`[cost-rollup] Line ${lineNum}: missing required fields, skipping`);
      return null;
    }
    return event;
  } catch (err) {
    console.warn(`[cost-rollup] Line ${lineNum}: JSON parse error, skipping`);
    return null;
  }
}

/**
 * Roll up costs from a JSONL event log file.
 *
 * Streams the file line-by-line to support large event logs.
 * Filters for `cost_recorded` events and aggregates by biome and leaf.
 *
 * @param jsonlPath - Absolute path to the .jsonl event log file.
 * @returns Promise resolving to aggregated cost data.
 *
 * @example
 * ```ts
 * const rollup = await rollupFromJsonl(".mycelium/events/ddp-integration-20260417T1830Z-a7f3.jsonl");
 * console.log(`Total cost: $${rollup.total_usd.toFixed(2)}`);
 * ```
 */
export async function rollupFromJsonl(jsonlPath: string): Promise<CostRollup> {
  const rollup: CostRollup = {
    total_usd: 0,
    by_biome: {},
    by_leaf: {},
    tokens: {
      input: 0,
      output: 0,
      cache_read: 0,
      cache_write: 0,
    },
  };

  const stream = createReadStream(jsonlPath, { encoding: "utf8" });
  const rl = createInterface({
    input: stream,
    crlfDelay: Infinity, // Handle \r\n and \n
  });

  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    const event = parseLine(line, lineNum);
    if (!event) continue;

    if (!isCostRecordedEvent(event)) continue;

    const { leaf_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, usd_estimate } = event.data;

    // Aggregate total
    rollup.total_usd += usd_estimate;

    // Aggregate by leaf
    rollup.by_leaf[leaf_id] = (rollup.by_leaf[leaf_id] ?? 0) + usd_estimate;

    // Aggregate by biome
    const biome = extractBiome(leaf_id);
    rollup.by_biome[biome] = (rollup.by_biome[biome] ?? 0) + usd_estimate;

    // Aggregate token counts
    rollup.tokens.input += input_tokens;
    rollup.tokens.output += output_tokens;
    rollup.tokens.cache_read += cache_read_tokens;
    rollup.tokens.cache_write += cache_write_tokens;
  }

  return rollup;
}

/**
 * Format a token count for human display.
 *
 * @example
 * formatTokenCount(1234567) // => "1.2M"
 * formatTokenCount(45678)   // => "46k"
 * formatTokenCount(123)     // => "123"
 */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${Math.round(count / 1_000)}k`;
  }
  return String(count);
}

/**
 * Get the top N biomes by cost, sorted descending.
 *
 * @param rollup - Cost rollup result.
 * @param n - Number of top biomes to return (default: 5).
 * @returns Array of [biome, usd] pairs, sorted by USD descending.
 */
export function topBiomesByCost(
  rollup: CostRollup,
  n: number = 5
): Array<[string, number]> {
  return Object.entries(rollup.by_biome)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/**
 * Get the top N leaves by cost, sorted descending.
 *
 * @param rollup - Cost rollup result.
 * @param n - Number of top leaves to return (default: 10).
 * @returns Array of [leaf_id, usd] pairs, sorted by USD descending.
 */
export function topLeavesByCost(
  rollup: CostRollup,
  n: number = 10
): Array<[string, number]> {
  return Object.entries(rollup.by_leaf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
