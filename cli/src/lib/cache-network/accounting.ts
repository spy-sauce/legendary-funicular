// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Cache-network accounting — JSONL event emission + pulse aggregation +
// atomic state.json cache-block writer.
//
// Contract: NUTRIENTS.md §3 (cache event schema, 1.4s pulse cadence)
//           NUTRIENTS.md §4 (UNIT_COST)
//           NUTRIENTS.md §5 (sporenet/state.json cache block)
// Sub-agent: cache.store.accounting
//
// Rules (from HYPHA):
// - Never throw on filesystem error (mirrors sink-jsonl.ts pattern)
// - cache.pulse silent when hits+misses == 0 in the window
// - writeCachePulse serialized so concurrent calls never tear

import * as fs from "node:fs";
import * as path from "node:path";
import type { CacheEvent } from "./store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unit cost per token (opus-4-7 input rough) — per NUTRIENTS §4.
 */
export const UNIT_COST = 0.000003;

/**
 * Pulse aggregation interval in milliseconds (1.4s per NUTRIENTS §3).
 */
const PULSE_INTERVAL_MS = 1400;

// ─────────────────────────────────────────────────────────────────────────────
// Module-level state — pulse aggregator
// ─────────────────────────────────────────────────────────────────────────────

/** Whether we've created the events directory for the current eventsPath. */
let dirCreated = false;
let lastEventsPath = "";

/** Pulse aggregator counters (reset every 1.4s). */
let windowHits = 0;
let windowMisses = 0;
let windowNetSavedUsd = 0;

/** Timer handle for the pulse aggregator. */
let pulseTimerId: ReturnType<typeof setInterval> | null = null;

/** Events path for pulse emission. */
let pulseEventsPath: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get current timestamp in ISO-8601 format.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Ensure the events directory exists. Cached per eventsPath.
 */
function ensureEventsDir(eventsPath: string): void {
  if (dirCreated && eventsPath === lastEventsPath) {
    return;
  }

  try {
    const dir = path.dirname(eventsPath);
    fs.mkdirSync(dir, { recursive: true });
    dirCreated = true;
    lastEventsPath = eventsPath;
  } catch (err) {
    // Log but don't throw — mirrors sink-jsonl.ts contract
    console.error(
      `[cache-network] warning: could not create events directory for ${eventsPath}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Emit a pulse event if there was any activity in the window.
 */
function emitPulse(): void {
  if (!pulseEventsPath) {
    return;
  }

  // Silent when hits+misses == 0 (per HYPHA rule)
  if (windowHits + windowMisses === 0) {
    return;
  }

  const pulseEvent: CacheEvent = {
    type: "cache.pulse",
    ts: nowIso(),
    window_seconds: PULSE_INTERVAL_MS / 1000,
    hits: windowHits,
    misses: windowMisses,
    net_saved_usd: windowNetSavedUsd,
  };

  // Emit the pulse event
  emitCacheEventInternal(pulseEvent, pulseEventsPath);

  // Reset counters
  windowHits = 0;
  windowMisses = 0;
  windowNetSavedUsd = 0;
}

/**
 * Internal emit without pulse tracking (used for pulse event itself).
 */
function emitCacheEventInternal(event: CacheEvent, eventsPath: string): void {
  ensureEventsDir(eventsPath);

  try {
    const line = JSON.stringify(event) + "\n";
    fs.appendFileSync(eventsPath, line, { encoding: "utf-8" });
  } catch (err) {
    // Never throw — log and continue (mirrors sink-jsonl.ts contract)
    console.error(
      `[cache-network] warning: failed to emit cache event to ${eventsPath}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Start the pulse aggregator timer if not already running.
 */
function ensurePulseTimer(eventsPath: string): void {
  // Update the events path for pulse emission
  pulseEventsPath = eventsPath;

  if (pulseTimerId !== null) {
    return;
  }

  pulseTimerId = setInterval(emitPulse, PULSE_INTERVAL_MS);

  // Don't keep the process alive just for pulses
  if (typeof pulseTimerId === "object" && "unref" in pulseTimerId) {
    pulseTimerId.unref();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emit a cache event to the JSONL stream.
 *
 * Mirrors `cli/src/lib/telemetry/sink-jsonl.ts:append` pattern:
 * - Synchronous fs.appendFileSync
 * - Creates parent directory if missing
 * - Never throws — logs to stderr on failure
 *
 * Pulse aggregator:
 * - Lazily starts a 1.4s interval timer on first call
 * - cache.hit events increment windowHits and add saved_usd to windowNetSavedUsd
 * - cache.miss events increment windowMisses
 * - Every 1.4s, if hits+misses > 0, emits cache.pulse event
 *
 * @param event - The cache event to emit
 * @param eventsPath - Absolute path to the JSONL file
 */
export function emitCacheEvent(event: CacheEvent, eventsPath: string): void {
  // Start pulse aggregator timer on first call
  ensurePulseTimer(eventsPath);

  // Update pulse aggregator counters based on event type
  if (event.type === "cache.hit") {
    windowHits += 1;
    windowNetSavedUsd += event.saved_usd;
  } else if (event.type === "cache.miss") {
    windowMisses += 1;
  }
  // cache.evict and cache.pulse don't affect the aggregator

  // Emit the raw event
  emitCacheEventInternal(event, eventsPath);
}

/**
 * Stop the pulse aggregator timer.
 *
 * Call this on shutdown or in tests to clean up the interval timer.
 * Any pending pulse is flushed before stopping.
 */
export function stopPulseAggregator(): void {
  if (pulseTimerId === null) {
    return;
  }

  // Flush any pending pulse before stopping
  emitPulse();

  clearInterval(pulseTimerId);
  pulseTimerId = null;
  pulseEventsPath = null;

  // Reset counters
  windowHits = 0;
  windowMisses = 0;
  windowNetSavedUsd = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// State.json cache-block writer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cache state for writeCachePulse — matches sporenet/state.json cache block.
 */
export interface CachePulseState {
  hits: number;
  misses: number;
  entries: number;
  capacity: number;
}

/**
 * Module-level promise chain for serialized writeCachePulse calls.
 * Mirrors the writeLeafState serialization fix in cultivate.ts (2026-05-10).
 */
let writeChain: Promise<void> = Promise.resolve();

/**
 * Atomic counter for temp file naming.
 */
let tempFileCounter = 0;

/**
 * Write the cache block to sporenet/state.json atomically.
 *
 * Contract (NUTRIENTS §5):
 * - Deep-merge cache block onto existing state.json
 * - Atomic write via temp-file/rename pattern
 * - Serialized via promise chain to prevent concurrent tearing
 * - Never throws — logs to stderr on failure
 * - Tolerates missing state.json (creates new object with just cache block)
 *
 * @param stateDir - Directory containing sporenet/state.json (usually cwd)
 * @param cacheState - Current cache stats
 */
export function writeCachePulse(
  stateDir: string,
  cacheState: CachePulseState
): Promise<void> {
  // Chain this write after all previous writes
  writeChain = writeChain.then(() => writeCachePulseInternal(stateDir, cacheState));
  return writeChain;
}

/**
 * Internal implementation — actually performs the atomic write.
 */
async function writeCachePulseInternal(
  stateDir: string,
  cacheState: CachePulseState
): Promise<void> {
  const statePath = path.join(stateDir, "sporenet", "state.json");

  try {
    // Read existing state.json or start with empty object
    let existingState: Record<string, unknown> = {};

    try {
      const content = await fs.promises.readFile(statePath, { encoding: "utf-8" });
      existingState = JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      // Tolerate missing or malformed state.json
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        // Log malformed JSON but continue with empty object
        console.error(
          `[cache-network] warning: could not parse ${statePath}, starting fresh:`,
          err instanceof Error ? err.message : err
        );
      }
      // ENOENT is expected on first run — no log needed
    }

    // Deep-merge cache block
    const updatedState = {
      ...existingState,
      cache: {
        hits: cacheState.hits,
        misses: cacheState.misses,
        entries: cacheState.entries,
        capacity: cacheState.capacity,
        last_updated: nowIso(),
      },
    };

    // Ensure sporenet directory exists
    const sporenetDir = path.dirname(statePath);
    await fs.promises.mkdir(sporenetDir, { recursive: true });

    // Atomic write: write to temp file, then rename
    tempFileCounter += 1;
    const tempPath = `${statePath}.tmp.${process.pid}.${tempFileCounter}`;

    await fs.promises.writeFile(tempPath, JSON.stringify(updatedState, null, 2) + "\n", {
      encoding: "utf-8",
    });

    await fs.promises.rename(tempPath, statePath);
  } catch (err) {
    // Never throw — log and continue (per HYPHA rule)
    console.error(
      `[cache-network] warning: failed to write cache pulse to ${statePath}:`,
      err instanceof Error ? err.message : err
    );
  }
}
