# HYPHA — cache-network-micros

## CACHE HEADER
- **SCOPE:** Deterministic MICRO fan-out per leaf — seeded PRNG, 2-4 micros, cheap/full routing split, in-memory registry feeding `LeafState.micros[]`.
- **PRIMITIVES:** `spawnMicros(opts)` · xorshift32 seeded from `sha256(leafId)[0..4]` · `MicroRegistry` keyed by `leafId` · NUTRIENTS §2 `MicroState`.
- **RULES:** bookkeeping only — no separate processes, no LLM calls, no events emitted from this biome · output is a pure function of `leafId` (+ `severity`) · registry never silently drops; repeat `registerLeaf(sameLeafId)` is idempotent (returns the already-stored array).
- **COUPLING:** `dashboard-data` calls `MicroRegistry.getMicros(leafId)` to populate `LeafState.micros[]`. `cache-network-integration` calls `MicroRegistry.registerLeaf(leaf)` at leaf-active. No other biome imports from here.
- **LOAD WHEN:** any leaf defining MICRO spawn, registry plumbing, or populating `LeafState.micros[]` from cultivate-side state.

## Scope
Implement `cli/src/lib/micro-agents/` — `spawn.ts` (deterministic MICRO factory), `registry.ts` (per-cultivation `MicroRegistry`), `index.ts` (re-exports). Pure TS, Node stdlib only. No new deps. Lands after `cache-network-store`; parallel with `cache-network-integration` (different files; integration imports from this biome).

## Deliverables by leaf

### `cache.micros.spawn`
- File: `cli/src/lib/micro-agents/spawn.ts`
- Exports: `MicroSpawnOpts` interface (`{ leafId: string; severity?: "critical" | "major" | "minor" }`) and `spawnMicros(opts: MicroSpawnOpts): MicroState[]` — shape per NUTRIENTS §2.
- Seed: `crypto.createHash("sha256").update(leafId).digest()` first 4 bytes → unsigned 32-bit int (big-endian). Implement xorshift32 inline in 5-10 lines; do not import a PRNG package.
- Count: PRNG → uniform integer in `[2, 5)` (i.e., `2`, `3`, or `4`).
- Routing per micro: if `severity === "critical"`, 50/50 `cheap`/`full`; else 70% `cheap` / 30% `full`. Each draw advances the PRNG once.
- Each `MicroState`: `idx` (0-based), `routing`, `last_call_was_hit: false`, `fire_count: 0`.
- Pure function — no I/O, no module-level mutable state, no `Date.now()`. Same `leafId` always returns deep-equal output.

### `cache.micros.registry`
- File: `cli/src/lib/micro-agents/registry.ts`
- Exports: `class MicroRegistry` with:
  - `registerLeaf(leaf: { id: string; severity?: "critical" | "major" | "minor" }): MicroState[]` — calls `spawnMicros` if `leaf.id` unseen, stores the result, returns it. Repeat calls for the same `leaf.id` return the already-stored array (no re-spawn).
  - `getMicros(leafId: string): MicroState[]` — returns the stored array, or `[]` if `leafId` not registered (never throws).
  - `clear(): void` — drops all stored entries (used by cultivation reset / heal-loop iter advance handler in `cache-network-integration`).
- Backing store: `Map<string, MicroState[]>`. Single instance is fine — the integration biome wires a singleton via `index.ts`.

### `cache.micros.index`
- File: `cli/src/lib/micro-agents/index.ts`
- Re-exports: `spawnMicros`, `MicroSpawnOpts`, `MicroRegistry`. Also export a module-level singleton `microRegistry = new MicroRegistry()` for the integration biome to share without passing references through cultivate.ts.

## Contract dependencies
- NUTRIENTS.md §2 (`MicroState` shape consumed by `dashboard-data` via `LeafState.micros[]`) — frozen at contract-freeze.
- NUTRIENTS.md §4 (MicroAgent fan-out section — spawn signature, 2-4 count, 70/30 vs 50/50 routing split) — frozen at contract-freeze.

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `spawnMicros({ leafId: "abc" })` returns deep-equal output across repeated calls (deterministic).
- 100 distinct `leafId` inputs produce 100 distinct output arrays (no obvious collisions; informal check).
- Across 100 random `leafId` calls, `length` is always in `{2, 3, 4}`; non-critical routing skews near 70/30 cheap/full (statistical, not strict).
- `MicroRegistry.registerLeaf({ id: "x" })` then `getMicros("x")` returns the same array reference (or deep-equal) as the first call.
- `getMicros("never-registered")` returns `[]` and does not throw.

## Out of scope
- `CacheStore`, cache events, accounting — `cache-network-store`.
- Wiring `MicroRegistry.registerLeaf` into the cultivate leaf-active hook + `clear()` on iter advance — `cache-network-integration`.
- Visualizing micros as orbiting spheres on canvas — `dashboard-canvas`.
- Promotion logic (cheap → full on confidence signal) — not in v1; current shape is spawn-time only.
- Documentation prose — `cache-network-docs`.

## Merge instructions
Land after `cache-network-store` (shares no files, but ordering keeps cache-runtime cohesion auditable). Parallel with `cache-network-integration`. Integration biome imports `microRegistry` from `cli/src/lib/micro-agents/index.ts`; do not pre-empt its wiring here. No changes to existing framework code outside `cli/src/lib/micro-agents/`.
