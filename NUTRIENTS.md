# NUTRIENTS.md — Dashboard + Cache-Network

Frozen contracts for the **dashboard-cache** cultivation — shipping `mycelium dashboard {init,serve,render}` and `cli/src/lib/cache-network/` into the framework simultaneously. Every leaf consumes these. Do not redesign at leaf-time; halt and flag if a contract is wrong.

Source brief: `cultivations/dashboard-cache/brief.md`. Visual ground truth: `.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html` (gitignored, local-only). Architectural ground truth: `docs/cache-network-micro-agents.md`.

Two interlocked subsystems in one parallel cultivation: dashboard renders the live cache-network topology; cache-network feeds real hit/miss data to the dashboard. Contract-freeze gates all 10 biomes; biomes germinate in parallel; cross-biome data flows through these sections only.

---

## 1. Theme schema — per-cultivation `theme.yaml`

**Location:** `theme.yaml` at cwd. Loaded by `cli/src/lib/dashboard/theme.ts` via `yaml` (existing dep); fallback to `templates/theme.default.yaml` if missing.

```yaml
# theme.yaml — example
brand:
  title: "mycelium · dashboard-cache"
  tagline: "decentralized · cryogenic · live"
  logo_char: "Ψ"

palette:
  ink:    "#060912"
  ink_2:  "#0A0E18"
  ice:    "#E8EEF5"
  ice_2:  "#A8B4C5"
  cryo:   "#7AE5FF"
  rule:   "#1A2030"

lifecycle:
  germ:  "#B7A8E8"
  grow:  "#7BC9C0"
  flow:  "#8BB8E0"
  fruit: "#D9C390"
  dorm:  "#5A6471"

severity:
  warn:  "#D9B85A"
  alert: "#E08A5C"
  crit:  "#DB5C6E"

identity:
  # biome_id → stable hue. lifecycle state modulates brightness, not hue.
  "dashboard-canvas":          "#7AE5FF"
  "dashboard-console":         "#C9A84C"
  "dashboard-theme":           "#B7A8E8"
  "dashboard-data":            "#88AAFF"
  "dashboard-cli":             "#9FE870"
  "dashboard-docs":            "#E8B4D4"
  "cache-network-store":       "#1E9EBF"
  "cache-network-integration": "#D4820A"
  "cache-network-micros":      "#7B5EA7"
  "cache-network-docs":        "#FF8C5A"

modulator:
  pending_brightness: 0.30
  active_brightness:  1.00
  fruit_brightness:   0.90
  failed_brightness:  0.45
  active_pulse_hz:    0.9     # slow-pulse discipline; max 1.5
```

**TypeScript shape (exported from `cli/src/lib/dashboard/theme.ts`):**

```ts
export interface DashboardTheme {
  brand: { title: string; tagline: string; logo_char: string };
  palette: Record<"ink"|"ink_2"|"ice"|"ice_2"|"cryo"|"rule", string>;
  lifecycle: Record<"germ"|"grow"|"flow"|"fruit"|"dorm", string>;
  severity: Record<"warn"|"alert"|"crit", string>;
  identity: Record<string, string>;  // biome_id → hex
  modulator: {
    pending_brightness: number;
    active_brightness: number;
    fruit_brightness: number;
    failed_brightness: number;
    active_pulse_hz: number;
  };
}

export function loadTheme(cwd: string): DashboardTheme;
export const DEFAULT_THEME_PATH: string;  // resolved templates/theme.default.yaml
```

**Loader contract:** `loadTheme(cwd)` reads `<cwd>/theme.yaml`, deep-merges over `templates/theme.default.yaml`, validates structurally (each required key present, hex strings match `/^#[0-9A-Fa-f]{6}$/`, modulator numbers in `[0, 2]`). Throws `ThemeValidationError` on malformed input. Synchronous (called per-render-request).

---

## 2. DashboardState — unified shape consumed by canvas + console

**Producer:** `cli/src/lib/dashboard/state.ts:buildDashboardState(cwd)`. Reads `<cwd>/sporenet/state.json` + tails JSONL events in `<cwd>/.mycelium/events/` (existing path). Synchronous read at server-render time.

**Consumers:** canvas renderer + console DOM, both reading `window.__DASHBOARD_STATE__` inlined into served HTML.

```ts
export interface DashboardState {
  organism: {
    name: string;
    started_at: string;        // ISO-8601
    iter: number;              // heal-loop iteration count
    view: "multiverse" | "product";
    active_product_id?: string;
  };
  agents: AgentState[];        // one per biome
  cache: CacheState;
  events: EventEntry[];        // last 200, newest first
  alerts: AlertEntry[];        // active only
  providers: ProviderState[];
}

export interface AgentState {
  id: string;
  state: "pending" | "active" | "fruit" | "failed" | "dorm";
  paused: boolean;
  contracts: string[];          // NUTRIENTS sections owned
  provider: string;             // "anthropic" | "openai" | ...
  leaves: LeafState[];
  history: AgentSnapshot[];     // per heal-loop iter
  cost_usd: number;
  tokens: number;
}

export interface LeafState {
  id: string;
  state: "pending" | "active" | "done" | "failed";
  scope: string;
  files: string[];              // produced artifacts
  commit: string;               // git sha or ""
  duration_seconds: number;
  tokens: number;
  failure_reason?: string;
  micros: MicroState[];         // 2-4 per leaf
}

export interface MicroState {
  idx: number;
  routing: "cheap" | "full";    // cheap = haiku-class, full = opus-class
  last_call_was_hit: boolean;
  fire_count: number;
}

export interface CacheState {
  hits: number;
  misses: number;
  entries: number;
  capacity: number;
  recent_keys: string[];        // last 16 key_hash prefixes (12 chars each)
}

export interface EventEntry {
  ts: string;                   // ISO-8601
  category: "lifecycle" | "nutrient" | "cost" | "health" | "anomaly" | "cache";
  source: string;               // biome_id or "operator"
  severity: "info" | "warn" | "alert" | "crit";
  short_type: string;           // e.g., "cache · hit"
  message: string;
}

export interface AlertEntry { severity: "warn" | "alert" | "crit"; message: string; ts: string; }
export interface ProviderState { id: string; up: boolean; latency_ms: number; model: string; }
export interface AgentSnapshot { iter: number; state: AgentState["state"]; tokens: number; cost_usd: number; }
```

**Builder contract:** `buildDashboardState(cwd: string): DashboardState` is synchronous and pure given the same on-disk state. Re-reads on every call (no caching). Tolerates missing state.json (returns shape with empty `agents`/`events`/`alerts`, defaulted `cache: {hits:0,misses:0,entries:0,capacity:0,recent_keys:[]}`). Never throws on missing files — only on malformed JSON.

---

## 3. Event schema — new cache events

Extends the existing JSONL event stream emitted to `.mycelium/events/<organism>.jsonl`. Existing event types unchanged.

```ts
export type CacheEvent =
  | { type: "cache.hit";   ts: string; leaf_id: string; key_hash: string; saved_tokens: number; saved_usd: number }
  | { type: "cache.miss";  ts: string; leaf_id: string; key_hash: string }
  | { type: "cache.evict"; ts: string; key_hash: string; reason: "lru" | "iter_invalidate" | "contract_change" }
  | { type: "cache.pulse"; ts: string; window_seconds: number; hits: number; misses: number; net_saved_usd: number };
```

**Emitter:** `cli/src/lib/cache-network/accounting.ts:emitCacheEvent(event, eventsPath)`. Appends JSONL line, fsync-on-batch (mirror existing `cli/src/lib/telemetry/sink-jsonl.ts:append` pattern — never throws on filesystem error, single stderr log on failure).

**Tailer:** `cli/src/lib/dashboard/events.ts:tailEvents(path, sinceTs, maxLines)`. Returns last `maxLines` events newest-first. Filters by category for the `cache` chip in feedbar.

**Key hashing:** `key_hash` is the first 12 chars of `sha256(tool_name + "|" + normalized_args + "|" + contract_hash)`. Operators see prefix only — never raw args (may contain prompts/secrets). Use Node `crypto.createHash("sha256")`.

**Aggregation cadence:** `cache.pulse` events emit every 1.4s when any hit or miss occurred in that window. Raw `cache.hit`/`cache.miss` events still emit per-call (dashboard uses them for canvas pulse animations); `cache.pulse` is for ticker readouts.

---

## 4. Cache-network runtime — `CacheStore` + `MicroAgent` + integration

**Location:** `cli/src/lib/cache-network/index.ts` exports:

```ts
export interface CacheStore {
  get(key: string): CacheEntry | undefined;
  set(key: string, payload: unknown, tokenCost: number, leafId: string, iter: number): void;
  invalidateLeaf(leafId: string): void;
  invalidateIter(iter: number): void;
  size(): number;
  capacity(): number;
  stats(): { hits: number; misses: number; entries: number };
}

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

export function makeCacheStore(opts: { capacity: number; eventsPath?: string }): CacheStore;
export function cacheKey(input: { tool_name: string; args: unknown; contract_hash: string }): string;
```

**Eviction:** LRU. On `set` when at capacity, evict the entry with the oldest `last_hit_at`. Emit `cache.evict` with reason `lru` (only if `eventsPath` provided).

**Iter invalidation:** when heal-loop advances iter, call `invalidateIter(prevIter)` from the cultivate iter-advance handler. Evicts all entries with matching `iter`. Emit `cache.evict` with reason `iter_invalidate`.

**Cost accounting:** `get` increments `hits`, refreshes `last_hit_at` to now, and emits `cache.hit` with `saved_tokens` from the entry's `token_cost`. `saved_usd` computed as `saved_tokens * UNIT_COST` where `UNIT_COST = 0.000003` (opus-4-7 input rough) — exported constant from `accounting.ts`.

**Integration point (cultivate.ts):** at the SDK-call chokepoint (grep `claude-agent-sdk\|query\(` in `cli/src/commands/cultivate.ts` for actual anchor; design doc cited line 480 but file may have drifted), wrap the SDK call:

```ts
// pseudocode — integration leaf must read actual file before editing
const key = cacheKey({ tool_name: "claude-agent-sdk", args: prompt, contract_hash });
const hit = store.get(key);
if (hit) {
  // get() emits cache.hit internally
  return hit.payload;
}
emitCacheEvent({ type: "cache.miss", ts: nowIso(), leaf_id, key_hash: key.slice(0, 12) }, eventsPath);
const payload = await sdkCall(prompt);
store.set(key, payload, payload.usage?.input_tokens ?? 0, leaf_id, currentIter);
return payload;
```

**Disable flag:** `--no-cache` on `mycelium cultivate` skips the wrapper entirely (pure passthrough). Default ON.

**MicroAgent fan-out:** `cli/src/lib/micro-agents/spawn.ts` exports:

```ts
export interface MicroSpawnOpts { leafId: string; severity?: "critical" | "major" | "minor"; }
export function spawnMicros(opts: MicroSpawnOpts): MicroState[];
```

Deterministic per `opts.leafId` — use Node `crypto.createHash("sha256").update(leafId).digest()` first 4 bytes as a seed for a small xorshift PRNG. Spawn 2-4 micros (seeded uniform in `[2, 5)`). Routing split: 70% `cheap` / 30% `full` for `severity ≠ "critical"`; 50/50 for `severity === "critical"`. Returns `MicroState[]` with `fire_count: 0`, `last_call_was_hit: false`.

**Bus visibility:** raw `cache.hit`/`cache.miss` events publish to the JSONL stream (existing bus). Aggregate `cache.pulse` emits at 1.4s cadence (see §3) for dashboard ticker.

---

## 5. Sporenet state.json — additive `cache` block

**Constraint:** existing fields (per `cli/src/commands/sporenet.ts:34-42`) MUST remain present and unchanged. New `cache` block is optional — readers gate on `state.cache != null`.

```ts
// addition only; existing fields elided
interface SporenetState {
  // ... existing fields preserved ...
  cache?: {
    hits: number;
    misses: number;
    entries: number;
    capacity: number;
    last_updated: string;     // ISO-8601, written on each pulse aggregate
  };
}
```

**Writer:** `cli/src/lib/cache-network/accounting.ts:writeCachePulse(stateDir, cacheState)`. Reads current `state.json`, deep-merges new `cache` block, atomic temp-file/rename (mirror the `writeLeafState` serialization fix in `cli/src/commands/cultivate.ts` from 2026-05-10 entry — serialized promise chain, never lose writes).

**Reader:** dashboard `buildDashboardState` reads `state.cache` if present; treats absence as `{hits:0, misses:0, entries:0, capacity:0, recent_keys:[]}`.

---

## 6. Dashboard CLI surface — `mycelium dashboard {init,serve,render}`

**Registration:** `cli/src/commands/dashboard/index.ts` exports `registerDashboardCommand(program: Command): void`. Wire into `cli/src/index.ts` main program.

**Subcommands:**

```
mycelium dashboard init [--cwd <path>] [--force]
  - Writes <cwd>/theme.yaml (copy of templates/theme.default.yaml) if missing.
  - Writes <cwd>/sporenet/dashboard.html (static one-shot snapshot).
  - --force overwrites existing theme.yaml.

mycelium dashboard serve [--port <n>] [--cwd <path>]
  - HTTP server on port (default 3334; sporenet uses 3333).
  - GET / → re-reads state.json + theme.yaml per request, renders templates/dashboard.html with state + theme inlined as window.__DASHBOARD_STATE__ + window.__DASHBOARD_THEME__.
  - GET /events/stream → SSE stream of new JSONL events since connection time.
  - GET /static/* → serves templates/ assets if any (Three.js is CDN-loaded, so /static is mostly empty in v1).
  - Logs each request with ms timing to stdout.
  - SIGINT cleanly shuts down (no orphaned port).

mycelium dashboard render [--cwd <path>] [--out <path>]
  - One-shot static render to <cwd>/sporenet/dashboard.html (or --out path).
  - No server.
```

**Render function:** `cli/src/lib/dashboard/render.ts:renderDashboard(state, theme, templatePath): string`. Pure: state + theme → HTML string. No DOM, no fs reads beyond the template read. Inlines state + theme as `<script>window.__DASHBOARD_STATE__ = ${JSON.stringify(state)};window.__DASHBOARD_THEME__ = ${JSON.stringify(theme)};</script>` immediately before the closing `</body>`.

**Template:** `templates/dashboard.html` is a single self-contained HTML file. Inline `<style>` + `<script>`. Three.js loaded from CDN `https://unpkg.com/three@0.161.0/build/three.module.js` (consistent with v9.4 prototype). Same canvas + chrome shape as v9.4 but reads `window.__DASHBOARD_STATE__` and `window.__DASHBOARD_THEME__` at boot instead of using the simulator.

**Template substitution:** the simulator block in v9.4 (BIOMES/PRODUCTS/ROUTING constants + biomeTick simulator) is REPLACED in `templates/dashboard.html` with a binding to `window.__DASHBOARD_STATE__`. The render pipeline (canvas Bloch wires, micros, cache relays, packets, inspect panel, multiverse, Star Wars HUD) is preserved as-is.

---

## 7. Frozen vocab additions

Two new terms enter the canonical Mycelium vocabulary. Both are case-sensitive uppercase identifiers when used in NUTRIENTS / HYPHA / docs prose; lowercase when used as code identifiers.

- **MICRO** — a sub-leaf worker. 2-4 per leaf. Spawned at leaf `active`, retired at leaf `done`/`failed`. Routes between `cheap` and `full` providers. Not a separate process — bookkeeping only. Visible on canvas as small spheres orbiting each leaf.
- **CACHE_NET** — the framework-level cache layer. Shared across all biomes in a cultivation. Keyed by `tool + normalized_args + contract_hash`. LRU-evicted. Iter-invalidated on heal-loop advance. Emits `cache.hit` / `cache.miss` / `cache.evict` / `cache.pulse` events on the BIOME BUS.

`HIT_HALO` is REJECTED as canonical vocab — purely visual, lives in dashboard biome internals only. Do not promote.

Existing vocab (HYPHA, HYPHAE, NUTRIENTS, BIOME BUS, FRUITING BODY, SPORULATION, PRUNING, HPP, NFA) unchanged.
