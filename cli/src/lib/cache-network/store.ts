// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Cache-network store — Map-backed LRU cache with invalidation and stats.
//
// Contract: NUTRIENTS.md §3 (CacheEvent), §4 (CacheStore, CacheEntry)
// Sub-agent: cache.store.types + cache.store.lru
//
// LRU implementation uses JavaScript Map's insertion-order semantics.
// On every get/set touch, we delete-then-set to move the key to the end.
// The oldest entry (first in iteration order) is evicted on overflow.

import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Types — per NUTRIENTS.md §3 + §4
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cache event union — emitted to JSONL stream per NUTRIENTS §3.
 */
export type CacheEvent =
  | { type: "cache.hit"; ts: string; leaf_id: string; key_hash: string; saved_tokens: number; saved_usd: number }
  | { type: "cache.miss"; ts: string; leaf_id: string; key_hash: string }
  | { type: "cache.evict"; ts: string; key_hash: string; reason: "lru" | "iter_invalidate" | "contract_change" }
  | { type: "cache.pulse"; ts: string; window_seconds: number; hits: number; misses: number; net_saved_usd: number };

/**
 * A single cache entry — per NUTRIENTS §4.
 */
export interface CacheEntry {
  key: string;
  payload: unknown;
  hits: number;
  added_at: string;
  last_hit_at: string;
  token_cost: number;       // tokens saved on each hit
  leaf_id: string;          // origin leaf
  iter: number;             // origin iter — invalidated on advance
}

/**
 * Cache store interface — per NUTRIENTS §4.
 */
export interface CacheStore {
  get(key: string): CacheEntry | undefined;
  set(key: string, payload: unknown, tokenCost: number, leafId: string, iter: number): void;
  invalidateLeaf(leafId: string): void;
  invalidateIter(iter: number): void;
  size(): number;
  capacity(): number;
  stats(): { hits: number; misses: number; entries: number };
}

/**
 * Options for creating a cache store.
 */
export interface CacheStoreOpts {
  capacity: number;
  eventsPath?: string;
}

/**
 * Extended cache store with internal miss recording capability.
 * The integration biome uses recordMiss() when a cache lookup returns undefined.
 */
export interface CacheStoreWithMissRecording extends CacheStore {
  /** Record a miss — increments the internal miss counter. */
  recordMiss(): void;
}

/**
 * Alias for CacheStoreWithMissRecording — used by index.ts re-export.
 * @deprecated Use CacheStoreWithMissRecording directly.
 */
export type CacheStoreInternal = CacheStoreWithMissRecording;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unit cost per token (opus-4-7 input rough) — per NUTRIENTS §4.
 * Used to compute saved_usd in cache.hit events.
 */
export const UNIT_COST = 0.000003;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Module-level flag to ensure mkdir is only called once per eventsPath */
const mkdirCache = new Set<string>();

/**
 * Emit a cache event to the JSONL file.
 * Mirrors the sink-jsonl.ts pattern: never throws, logs stderr on failure.
 */
function emitCacheEventInternal(event: CacheEvent, eventsPath: string): void {
  try {
    // Ensure parent directory exists (cached per path)
    const dir = path.dirname(eventsPath);
    if (!mkdirCache.has(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      mkdirCache.add(dir);
    }

    // Append event as JSONL line
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
 * Get current timestamp in ISO-8601 format.
 */
function nowIso(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// LRU Cache Store Implementation — cache.store.lru
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Map-backed LRU cache store.
 *
 * LRU is implemented using Map's insertion-order semantics:
 * - On every get/set touch, delete-then-set moves the key to the end
 * - The first key in iteration order is the oldest (LRU)
 * - At capacity, evict the oldest before inserting a new key
 *
 * The returned store includes a `recordMiss()` method for the integration
 * biome to call when a cache lookup returns undefined. This keeps the
 * miss counter inside the store closure.
 *
 * @param opts - capacity (max entries) and optional eventsPath for JSONL emission
 * @returns A CacheStoreWithMissRecording instance
 */
export function makeCacheStore(opts: CacheStoreOpts): CacheStoreWithMissRecording {
  const { capacity: maxCapacity, eventsPath } = opts;
  const map = new Map<string, CacheEntry>();

  // Running counters for stats
  let hitCount = 0;
  let missCount = 0;

  /**
   * Emit a cache event if eventsPath is configured.
   */
  function maybeEmit(event: CacheEvent): void {
    if (eventsPath) {
      emitCacheEventInternal(event, eventsPath);
    }
  }

  /**
   * Get the oldest key (first in iteration order).
   */
  function getOldestKey(): string | undefined {
    const first = map.keys().next();
    return first.done ? undefined : first.value;
  }

  /**
   * Touch a key — delete and re-set to move it to the end (most recent).
   */
  function touch(key: string, entry: CacheEntry): void {
    map.delete(key);
    map.set(key, entry);
  }

  return {
    /**
     * Get an entry by key.
     *
     * On hit:
     * - Refresh LRU order (delete-then-set)
     * - Bump entry.hits
     * - Refresh entry.last_hit_at
     * - Emit cache.hit event with saved_tokens and saved_usd
     *
     * On miss:
     * - Return undefined
     * - Does NOT emit cache.miss (integration biome handles that with leaf_id context)
     */
    get(key: string): CacheEntry | undefined {
      const entry = map.get(key);
      if (!entry) {
        return undefined;
      }

      // Hit — update entry and refresh LRU position
      entry.hits += 1;
      entry.last_hit_at = nowIso();
      hitCount += 1;

      // Refresh LRU order
      touch(key, entry);

      // Emit cache.hit event
      const savedTokens = entry.token_cost;
      const savedUsd = savedTokens * UNIT_COST;
      maybeEmit({
        type: "cache.hit",
        ts: entry.last_hit_at,
        leaf_id: entry.leaf_id,
        key_hash: key.slice(0, 12),
        saved_tokens: savedTokens,
        saved_usd: savedUsd,
      });

      return entry;
    },

    /**
     * Set an entry.
     *
     * If key already exists, update it and refresh LRU order.
     * If at capacity and key is new, evict oldest before insert.
     * Emit cache.evict with reason "lru" on eviction.
     */
    set(key: string, payload: unknown, tokenCost: number, leafId: string, iter: number): void {
      const now = nowIso();

      // Check if key already exists
      const existing = map.get(key);
      if (existing) {
        // Update existing entry and refresh LRU
        existing.payload = payload;
        existing.token_cost = tokenCost;
        existing.leaf_id = leafId;
        existing.iter = iter;
        touch(key, existing);
        return;
      }

      // New key — check capacity
      if (map.size >= maxCapacity) {
        const oldestKey = getOldestKey();
        if (oldestKey) {
          map.delete(oldestKey);
          maybeEmit({
            type: "cache.evict",
            ts: now,
            key_hash: oldestKey.slice(0, 12),
            reason: "lru",
          });
        }
      }

      // Insert new entry
      const entry: CacheEntry = {
        key,
        payload,
        hits: 0,
        added_at: now,
        last_hit_at: now,
        token_cost: tokenCost,
        leaf_id: leafId,
        iter,
      };
      map.set(key, entry);
    },

    /**
     * Invalidate all entries from a specific leaf.
     * Emits cache.evict with reason "iter_invalidate" per entry removed.
     */
    invalidateLeaf(leafId: string): void {
      const now = nowIso();
      const keysToDelete: string[] = [];

      for (const [key, entry] of map) {
        if (entry.leaf_id === leafId) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        map.delete(key);
        maybeEmit({
          type: "cache.evict",
          ts: now,
          key_hash: key.slice(0, 12),
          reason: "iter_invalidate",
        });
      }
    },

    /**
     * Invalidate all entries from a specific iteration.
     * Emits cache.evict with reason "iter_invalidate" per entry removed.
     */
    invalidateIter(iter: number): void {
      const now = nowIso();
      const keysToDelete: string[] = [];

      for (const [key, entry] of map) {
        if (entry.iter === iter) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        map.delete(key);
        maybeEmit({
          type: "cache.evict",
          ts: now,
          key_hash: key.slice(0, 12),
          reason: "iter_invalidate",
        });
      }
    },

    /**
     * Return current number of entries.
     */
    size(): number {
      return map.size;
    },

    /**
     * Return max capacity.
     */
    capacity(): number {
      return maxCapacity;
    },

    /**
     * Return current stats: hits, misses, entries.
     */
    stats(): { hits: number; misses: number; entries: number } {
      return {
        hits: hitCount,
        misses: missCount,
        entries: map.size,
      };
    },

    /**
     * Record a miss — increments the internal miss counter.
     *
     * Called by the integration biome at the SDK chokepoint when a cache
     * lookup returns undefined. The store owns its counter; the integration
     * biome provides the leaf_id context for the cache.miss event emission.
     */
    recordMiss(): void {
      missCount += 1;
    },
  };
}

/**
 * Alias for makeCacheStore — used by index.ts re-export.
 * @deprecated Use makeCacheStore directly.
 */
export const makeCacheStoreWithMissRecording = makeCacheStore;

/**
 * Record a miss on a cache store.
 *
 * This is a standalone helper that calls store.recordMiss().
 * The integration biome can use either this function or call
 * store.recordMiss() directly on CacheStoreWithMissRecording.
 *
 * @param store - A cache store with miss recording capability
 */
export function recordMiss(store: CacheStoreWithMissRecording): void {
  store.recordMiss();
}
