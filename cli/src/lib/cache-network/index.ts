// Mycelium Framework — VibeSpace LLC — The network provides.
//
// cache-network/index.ts — barrel re-exports for the cache-network module
//
// Contract: NUTRIENTS.md §3, §4, §5
// Sub-agent: cache.store.index
//
// This is the sole import path for downstream biomes:
//   import { ... } from "../lib/cache-network/index.js"
//
// All cache-network primitives flow through this barrel. Do not import
// directly from store.ts, keys.ts, or accounting.ts — use this index.

// ─────────────────────────────────────────────────────────────────────────────
// From store.ts — types, interfaces, LRU implementation
// ─────────────────────────────────────────────────────────────────────────────

export type { CacheEvent } from "./store.js";
export type { CacheEntry } from "./store.js";
export type { CacheStore } from "./store.js";
export type { CacheStoreOpts } from "./store.js";
export type { CacheStoreInternal } from "./store.js";

export { makeCacheStore } from "./store.js";
export { makeCacheStoreWithMissRecording } from "./store.js";
export { recordMiss } from "./store.js";
export { UNIT_COST } from "./store.js";

// ─────────────────────────────────────────────────────────────────────────────
// From keys.ts — deterministic cache key derivation
// ─────────────────────────────────────────────────────────────────────────────

export type { CacheKeyInput } from "./keys.js";

export { cacheKey } from "./keys.js";

// ─────────────────────────────────────────────────────────────────────────────
// From accounting.ts — event emission, pulse aggregation, state.json writer
// ─────────────────────────────────────────────────────────────────────────────

export { emitCacheEvent } from "./accounting.js";
export { writeCachePulse } from "./accounting.js";
export { stopPulseAggregator } from "./accounting.js";
