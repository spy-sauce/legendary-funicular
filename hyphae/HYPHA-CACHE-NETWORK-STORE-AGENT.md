# HYPHA — cache-network-store

## CACHE HEADER
- **SCOPE:** In-process LRU `CacheStore` + deterministic `cacheKey` + JSONL accounting + 1.4s `cache.pulse` aggregator + `sporenet/state.json` cache-block writer.
- **PRIMITIVES:** Node `Map` (insertion-order LRU) · `crypto.createHash("sha256")` · JSONL append · atomic temp/rename · serialized promise chain · stable `JSON.stringify` (sorted keys).
- **RULES:** never throw on filesystem error (mirrors `cli/src/lib/telemetry/sink-jsonl.ts:append`) · `cacheKey` deterministic regardless of arg key order · LRU touch = delete-then-set · `cache.pulse` silent when hits+misses == 0 in the window · `writeCachePulse` serialized so concurrent calls never tear.
- **COUPLING:** `cache-network-integration` imports `makeCacheStore`, `cacheKey`, `emitCacheEvent`, `UNIT_COST` from here to wrap the cultivate SDK chokepoint. `cache-network-micros` reads `CacheStore.stats()` and `CacheState` shape. Dashboard (`dashboard-data`) reads the `cache` block written by `writeCachePulse`. No other biome writes to `cli/src/lib/cache-network/`.
- **LOAD WHEN:** any leaf defining or consuming `CacheStore` / `CacheEntry` / `CacheEvent`, touching `cli/src/lib/cache-network/`, or wiring cache accounting into `sporenet/state.json`.

## Scope
Implement `cli/src/lib/cache-network/` — the cache runtime. First in cache-network merge order. No `cache-network-*` biome can land before this freezes the `CacheStore` interface, key derivation, and event-emission semantics.

## Deliverables by leaf

### `cache.store.types`
- File: `cli/src/lib/cache-network/store.ts` (types section)
- Exports: `CacheStore`, `CacheEntry`, `CacheEvent` — shapes exactly per NUTRIENTS §3 + §4. Pure types. No I/O.
- `CacheEvent` is the discriminated union from NUTRIENTS §3 (`cache.hit | cache.miss | cache.evict | cache.pulse`); re-export so `accounting.ts` and consumers share one source.

### `cache.store.lru`
- File: `cli/src/lib/cache-network/store.ts`
- `makeCacheStore(opts: { capacity: number; eventsPath?: string }): CacheStore` — Map-backed. LRU via Map insertion order (delete-then-set on every `get`/`set` touch; first iterator key is oldest).
- `set(key, payload, tokenCost, leafId, iter)`: if at capacity AND key not already present, evict oldest before insert; on eviction emit `cache.evict` with `reason: "lru"` (only if `eventsPath` provided).
- `get(key)`: returns `undefined` on miss (does NOT emit `cache.miss` — that's the integration biome's job, since cache-miss accounting needs the leaf_id context). On hit, refresh LRU order (delete-then-set), bump `hits`, refresh `last_hit_at` to ISO-8601 now, and emit `cache.hit` with `saved_tokens` from `entry.token_cost` and `saved_usd = saved_tokens * UNIT_COST`.
- `invalidateLeaf(leafId)`: iterate entries, delete matches, emit `cache.evict` with `reason: "iter_invalidate"` per entry removed (closest reason in the union; design doc §3 treats leaf/iter invalidations as the same family).
- `invalidateIter(iter)`: iterate entries, delete matches, emit `cache.evict` with `reason: "iter_invalidate"` per removed entry.
- `size()`, `capacity()`, `stats()`: cheap reads from the running counters (`hits`, `misses`, `entries`).
- Internal counters: track `hits` and `misses` for `stats()`. `misses` is incremented by the integration biome via a `recordMiss(leafId)` helper exported from this file (small surface so the store owns its counter rather than the wrapper).

### `cache.store.keys`
- File: `cli/src/lib/cache-network/keys.ts`
- `cacheKey(input: { tool_name: string; args: unknown; contract_hash: string }): string` — returns full lowercase hex sha256 (64 chars). Consumers slice to first 12 for `key_hash` per NUTRIENTS §3.
- Normalize `args` via a stable stringifier that sorts object keys recursively (arrays preserve order; primitives pass through). Implement inline — do NOT add `json-stable-stringify` dep.
- Hashed input: `tool_name + "|" + stableStringify(args) + "|" + contract_hash`. Use Node `crypto.createHash("sha256")`. Pure function; no I/O.

### `cache.store.accounting`
- File: `cli/src/lib/cache-network/accounting.ts`
- Export `UNIT_COST = 0.000003` (opus-4-7 input rough, per NUTRIENTS §4).
- `emitCacheEvent(event: CacheEvent, eventsPath: string): void` — synchronous `fs.appendFileSync` of `JSON.stringify(event) + "\n"`. Mirror `cli/src/lib/telemetry/sink-jsonl.ts:append`: try/catch around append, single `console.error` on failure, never throw. Creates parent dir via `fs.mkdirSync(..., {recursive:true})` once at first call (cache it on a module-level boolean).
- **Pulse aggregator:** module-level state holds `windowHits`, `windowMisses`, `windowNetSavedUsd` and a `setInterval` timer started lazily on first `emitCacheEvent` call. Every 1.4s: if `windowHits + windowMisses > 0`, emit `cache.pulse` with `window_seconds: 1.4`, then zero the counters. If both are zero, silent (no emit). `cache.hit` events update `windowHits` and add `saved_usd` to `windowNetSavedUsd`; `cache.miss` events update `windowMisses`. Export `stopPulseAggregator()` for test/shutdown.
- `writeCachePulse(stateDir: string, cacheState: { hits: number; misses: number; entries: number; capacity: number }): Promise<void>` — read `<stateDir>/sporenet/state.json`, deep-merge `cache: { ...cacheState, last_updated: nowIso() }` onto the existing object, write to `<path>.tmp.<pid>.<counter>`, then `fs.promises.rename` over the original. Serialize all calls on a module-level promise chain (mirror `writeLeafState` in `cli/src/commands/cultivate.ts` post-2026-05-10). Never throw — log stderr once on failure. Tolerate missing state.json (create new object containing only the `cache` block).

### `cache.store.index`
- File: `cli/src/lib/cache-network/index.ts`
- Re-export everything: `CacheStore`, `CacheEntry`, `CacheEvent`, `makeCacheStore`, `cacheKey`, `emitCacheEvent`, `writeCachePulse`, `UNIT_COST`, `stopPulseAggregator`.
- Sole import path for downstream biomes: `import { ... } from "../lib/cache-network/index.js"`.

## Contract dependencies
- NUTRIENTS.md §3 (cache event schema — `CacheEvent` union, `key_hash` 12-char prefix rule, 1.4s pulse cadence)
- NUTRIENTS.md §4 (`CacheStore` interface, `CacheEntry` shape, LRU eviction, `cacheKey` signature, `UNIT_COST`)
- NUTRIENTS.md §5 (sporenet `cache` block shape — additive, `last_updated` written by `writeCachePulse`)

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `makeCacheStore({capacity: 256})` returns valid `CacheStore`; `capacity()` returns 256; `size()` returns 0 initially.
- `set` at capacity evicts oldest by insertion order and emits `cache.evict` with `reason: "lru"` (when `eventsPath` provided).
- `get` on existing key refreshes LRU order (subsequent over-capacity `set` evicts a *different* entry) and emits `cache.hit` with correct `saved_tokens`/`saved_usd`.
- `cacheKey({tool_name:"x", args:{a:1,b:2}, contract_hash:"h"}) === cacheKey({tool_name:"x", args:{b:2,a:1}, contract_hash:"h"})` — reordered keys hash identically.
- `emitCacheEvent` to a non-writable `eventsPath` does NOT throw; logs once to stderr.
- `writeCachePulse` invoked 10× concurrently produces a final state.json with `cache.hits` == the last caller's value, with no JSON parse errors mid-run (atomic temp/rename + serialized chain).
- Pulse aggregator: feeding 3 `cache.hit` + 2 `cache.miss` then waiting 1.4s emits exactly one `cache.pulse` with `hits: 3, misses: 2`; waiting another 1.4s with no activity emits zero `cache.pulse`.

## Out of scope
- Wrapping the SDK call at `cultivate.ts:480` (or wherever it's drifted) — `cache-network-integration`.
- Micro-agent fan-out / `spawnMicros` — `cache-network-micros`.
- Dashboard consumption of `state.cache` — `dashboard-data`.
- `--no-cache` flag plumbing on `mycelium cultivate` — `cache-network-integration` (passthrough decision lives at the wrap site).
- Cache-layer biome docs / runbook — `cache-network-docs`.

## Merge instructions
First in cache-network merge order. `cache-network-integration` has `blocked_by: cache-network-store` and imports exclusively through `cli/src/lib/cache-network/index.ts`. No changes to existing framework code outside `cli/src/lib/cache-network/`. Do not touch `cli/src/commands/cultivate.ts`, `cli/src/commands/sporenet.ts`, or `cli/src/lib/telemetry/`.
