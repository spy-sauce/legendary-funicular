// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Dashboard JSONL event tailer — reads events newest-first for dashboard feed.
//
// Per NUTRIENTS.md §3 and HYPHA-DASHBOARD-DATA-AGENT.md:
// - Synchronous read (called per-render-request, files are append-only and small)
// - Returns newest-first (reverse line order)
// - Filters by timestamp when sinceTs provided (strictly greater than)
// - Malformed lines logged to stderr and skipped, never throws
// - Missing file returns empty array, never throws

import * as fs from "node:fs";
import type { EventEntry } from "./state.js";

/**
 * Tail events from a JSONL event stream file.
 *
 * Reads the JSONL file synchronously (appropriate for per-render-request calls),
 * parses each line as JSON, converts to EventEntry format, and returns the
 * results newest-first.
 *
 * Per NUTRIENTS.md §3, the event stream may contain various event types including:
 * - cache.hit / cache.miss / cache.evict / cache.pulse (cache events)
 * - lifecycle, cost, health, anomaly events from the existing telemetry system
 *
 * @param eventsPath - Absolute path to the JSONL file
 * @param sinceTs - ISO-8601 timestamp for filtering; only events strictly greater
 *                  than this timestamp are returned. Pass null for no filtering.
 * @param maxLines - Maximum number of events to return
 * @returns Array of EventEntry objects, newest-first, capped at maxLines
 */
export function tailEvents(
  eventsPath: string,
  sinceTs: string | null,
  maxLines: number
): EventEntry[] {
  // Missing file: return empty array, never throw
  if (!fs.existsSync(eventsPath)) {
    return [];
  }

  let content: string;
  try {
    content = fs.readFileSync(eventsPath, { encoding: "utf-8" });
  } catch (err) {
    // Read failure: log and return empty, never throw
    console.error(
      `[dashboard.events] warning: failed to read ${eventsPath}:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }

  // Split on newlines, filter empty lines
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  // Parse each line, skip malformed
  const parsed: EventEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const entry = rawToEventEntry(raw);
      if (entry) {
        parsed.push(entry);
      }
    } catch (parseErr) {
      // Malformed JSON: log one line to stderr, skip, continue
      console.error(
        `[dashboard.events] warning: malformed JSON at line ${i + 1} in ${eventsPath}`
      );
      // Per spec: single stderr log per bad line, do not include error details
    }
  }

  // Reverse to get newest-first
  const newestFirst = parsed.reverse();

  // Filter by sinceTs if provided (strictly greater than, lexicographic on ISO-8601)
  let filtered = newestFirst;
  if (sinceTs !== null) {
    filtered = newestFirst.filter((entry) => entry.ts > sinceTs);
  }

  // Cap at maxLines
  return filtered.slice(0, maxLines);
}

/**
 * Convert a raw JSON object from the JSONL stream to an EventEntry.
 *
 * Maps the event type to the appropriate category and extracts fields.
 * Returns null if the object doesn't have the required fields.
 *
 * Event type → category mapping per NUTRIENTS.md §3:
 * - cache.hit / cache.miss / cache.evict / cache.pulse → "cache"
 * - lifecycle.* → "lifecycle"
 * - cost.* → "cost"
 * - health.* → "health"
 * - anomaly.* → "anomaly"
 * - nutrient.* → "nutrient"
 * - Unknown types default to source-based heuristics
 */
function rawToEventEntry(raw: Record<string, unknown>): EventEntry | null {
  // Required fields: ts must exist
  const ts = raw.ts;
  if (typeof ts !== "string") {
    return null;
  }

  // Extract type field — determines category and short_type
  const type = typeof raw.type === "string" ? raw.type : "";

  // Determine category from type prefix
  const category = categorizeEvent(type, raw);

  // Determine source: prefer explicit source field, else derive from leaf_id or fallback
  let source = "operator";
  if (typeof raw.source === "string" && raw.source) {
    source = raw.source;
  } else if (typeof raw.leaf_id === "string" && raw.leaf_id) {
    // Extract biome from leaf_id (e.g., "dashboard.data.types" → "dashboard-data")
    const parts = raw.leaf_id.split(".");
    if (parts.length >= 2) {
      source = `${parts[0]}-${parts[1]}`;
    } else {
      source = raw.leaf_id;
    }
  } else if (typeof raw.biome_id === "string" && raw.biome_id) {
    source = raw.biome_id;
  }

  // Determine severity: prefer explicit, else infer from type/category
  let severity: EventEntry["severity"] = "info";
  if (typeof raw.severity === "string" && isValidSeverity(raw.severity)) {
    severity = raw.severity;
  } else {
    // Infer severity from type patterns
    if (type.includes("fail") || type.includes("error") || type.includes("crit")) {
      severity = "crit";
    } else if (type.includes("alert")) {
      severity = "alert";
    } else if (type.includes("warn") || type.includes("evict")) {
      severity = "warn";
    }
  }

  // Build short_type: format type for display (e.g., "cache.hit" → "cache · hit")
  const short_type = formatShortType(type);

  // Build message: prefer explicit message, else construct from fields
  let message = "";
  if (typeof raw.message === "string" && raw.message) {
    message = raw.message;
  } else {
    message = buildEventMessage(type, raw);
  }

  return {
    ts,
    category,
    source,
    severity,
    short_type,
    message,
  };
}

/**
 * Categorize an event based on its type prefix.
 *
 * Per NUTRIENTS.md §3 categories:
 * - "lifecycle" | "nutrient" | "cost" | "health" | "anomaly" | "cache"
 */
function categorizeEvent(
  type: string,
  raw: Record<string, unknown>
): EventEntry["category"] {
  // Cache events per NUTRIENTS.md §3
  if (
    type === "cache.hit" ||
    type === "cache.miss" ||
    type === "cache.evict" ||
    type === "cache.pulse"
  ) {
    return "cache";
  }

  // Standard category prefixes
  if (type.startsWith("lifecycle.") || type.startsWith("lifecycle_")) {
    return "lifecycle";
  }
  if (type.startsWith("cost.") || type.startsWith("cost_")) {
    return "cost";
  }
  if (type.startsWith("health.") || type.startsWith("health_")) {
    return "health";
  }
  if (type.startsWith("anomaly.") || type.startsWith("anomaly_")) {
    return "anomaly";
  }
  if (type.startsWith("nutrient.") || type.startsWith("nutrient_")) {
    return "nutrient";
  }

  // Fallback: check explicit category field
  if (typeof raw.category === "string" && isValidCategory(raw.category)) {
    return raw.category;
  }

  // Default to lifecycle for unrecognized types
  return "lifecycle";
}

/**
 * Format event type as a readable short_type.
 * "cache.hit" → "cache · hit"
 * "lifecycle.leaf.done" → "lifecycle · leaf · done"
 */
function formatShortType(type: string): string {
  if (!type) {
    return "event";
  }
  // Replace dots and underscores with " · " for readability
  return type.replace(/[._]/g, " · ");
}

/**
 * Build a human-readable message from event fields when no explicit message exists.
 */
function buildEventMessage(type: string, raw: Record<string, unknown>): string {
  // Cache events: include relevant details
  if (type === "cache.hit") {
    const saved = typeof raw.saved_tokens === "number" ? raw.saved_tokens : 0;
    const leafId = typeof raw.leaf_id === "string" ? raw.leaf_id : "unknown";
    return saved > 0
      ? `Cache hit for ${leafId}, saved ${saved} tokens`
      : `Cache hit for ${leafId}`;
  }

  if (type === "cache.miss") {
    const leafId = typeof raw.leaf_id === "string" ? raw.leaf_id : "unknown";
    return `Cache miss for ${leafId}`;
  }

  if (type === "cache.evict") {
    const reason = typeof raw.reason === "string" ? raw.reason : "unknown";
    return `Cache entry evicted (${reason})`;
  }

  if (type === "cache.pulse") {
    const hits = typeof raw.hits === "number" ? raw.hits : 0;
    const misses = typeof raw.misses === "number" ? raw.misses : 0;
    const saved = typeof raw.net_saved_usd === "number" ? raw.net_saved_usd : 0;
    return `Cache pulse: ${hits} hits, ${misses} misses, $${saved.toFixed(4)} saved`;
  }

  // Lifecycle events
  if (type.includes("leaf") && type.includes("done")) {
    const leafId = typeof raw.leaf_id === "string" ? raw.leaf_id : "";
    return leafId ? `Leaf ${leafId} completed` : "Leaf completed";
  }

  if (type.includes("leaf") && type.includes("fail")) {
    const leafId = typeof raw.leaf_id === "string" ? raw.leaf_id : "";
    const reason = typeof raw.failure_reason === "string" ? raw.failure_reason : "";
    const base = leafId ? `Leaf ${leafId} failed` : "Leaf failed";
    return reason ? `${base}: ${reason}` : base;
  }

  // Fallback: use type as message
  return type || "Event";
}

/**
 * Type guard for valid severity values.
 */
function isValidSeverity(s: string): s is EventEntry["severity"] {
  return s === "info" || s === "warn" || s === "alert" || s === "crit";
}

/**
 * Type guard for valid category values.
 */
function isValidCategory(c: string): c is EventEntry["category"] {
  return (
    c === "lifecycle" ||
    c === "nutrient" ||
    c === "cost" ||
    c === "health" ||
    c === "anomaly" ||
    c === "cache"
  );
}

// Re-export EventEntry for ergonomics (per HYPHA spec: re-export via state.ts for ergonomics)
export type { EventEntry } from "./state.js";
