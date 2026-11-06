# HYPHA — dashboard-data

## CACHE HEADER
- **SCOPE:** `DashboardState` shape + `buildDashboardState(cwd)` + JSONL event tailer — the unified data layer canvas + console both consume via `window.__DASHBOARD_STATE__`.
- **PRIMITIVES:** `DashboardState` / `AgentState` / `LeafState` / `MicroState` / `CacheState` / `EventEntry` / `AlertEntry` / `ProviderState` / `AgentSnapshot` interfaces · sync state.json read · newest-first JSONL tail.
- **RULES:** never throw on missing files (return empty shape) · only throw on malformed JSON · synchronous + pure given on-disk state (no caching, re-read every call) · malformed JSONL lines skipped with stderr log, never crash.
- **COUPLING:** canvas + console + cli all import `DashboardState` from here. Reads sporenet/state.json (existing shape preserved per cultivation rule #9) + tails `.mycelium/events/<organism>.jsonl` (existing path). Cache block consumed read-only from `state.cache` written by `cache-network-integration`.
- **LOAD WHEN:** any leaf defining or consuming `DashboardState`, reading sporenet state for dashboard purposes, or tailing the event JSONL stream.

## Scope
Implement `cli/src/lib/dashboard/state.ts` (types + builder) and `cli/src/lib/dashboard/events.ts` (JSONL tailer). Second in dashboard merge order — `dashboard-theme` lands first; `dashboard-canvas` / `dashboard-console` / `dashboard-cli` all depend on the `DashboardState` type frozen here.

## Deliverables by leaf

### `dashboard.data.types`
- File: `cli/src/lib/dashboard/state.ts` (types portion).
- Exports the full set verbatim per NUTRIENTS §2: `DashboardState`, `AgentState`, `LeafState`, `MicroState`, `CacheState`, `EventEntry`, `AlertEntry`, `ProviderState`, `AgentSnapshot`.
- Pure types. Zero I/O. Zero runtime code in this leaf.
- Union literals exactly per spec — `state: "pending" | "active" | "fruit" | "failed" | "dorm"` for agents; `state: "pending" | "active" | "done" | "failed"` for leaves; `routing: "cheap" | "full"` for micros; `category: "lifecycle" | "nutrient" | "cost" | "health" | "anomaly" | "cache"` for events.

### `dashboard.data.state-builder`
- File: `cli/src/lib/dashboard/state.ts` (builder portion, same file).
- Export `buildDashboardState(cwd: string): DashboardState` — synchronous.
- Reads `<cwd>/sporenet/state.json` via `fs.readFileSync`. Maps existing `SporeNetState` fields (per `cli/src/commands/sporenet.ts:34-42`) into `AgentState[]` / `LeafState[]`: group leaves by `agent` field → one `AgentState` per distinct biome; agent `state` derived from leaf statuses (any active → `active`, all done → `fruit`, any failed → `failed`, else `pending`).
- Reads optional `state.cache` block into `CacheState`. Defaults to `{hits:0,misses:0,entries:0,capacity:0,recent_keys:[]}` when absent (per NUTRIENTS §5 reader contract).
- Missing `sporenet/state.json` → returns shape with empty `agents`/`events`/`alerts`/`providers` arrays + defaulted `cache` + `organism` defaults (`name: ""`, `started_at: nowIso()`, `iter: 0`, `view: "multiverse"`). Never throws on missing files.
- Throws only on malformed JSON (operator concern — surfaces config drift loudly).
- Pure given the same on-disk state. No memoization or caching across calls.

### `dashboard.data.events-tailer`
- File: `cli/src/lib/dashboard/events.ts`.
- Export `tailEvents(eventsPath: string, sinceTs: string | null, maxLines: number): EventEntry[]`.
- Reads the JSONL file via `fs.readFileSync` (sync — called per-render-request, files are append-only and small). Splits on `\n`, parses each non-empty line as JSON.
- Returns newest-first (reverse line order). When `sinceTs` is provided, filters strictly greater than (`entry.ts > sinceTs` lex compare on ISO-8601). Caps result at `maxLines`.
- Malformed JSON lines: `console.error` one line, skip, continue. Never throw on bad lines.
- Missing file: return `[]`. Never throw.
- Re-export the type via `state.ts` for ergonomics; the tailer itself lives in `events.ts` to keep concerns split.

## Contract dependencies
- NUTRIENTS §2 (DashboardState shape) — frozen at contract-freeze
- NUTRIENTS §3 (event schema — especially `cache.*` event types the tailer must parse and categorize)
- NUTRIENTS §5 (sporenet state.json `cache` block — read-only consumption, treat absence as zeros)

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `buildDashboardState(cwd)` returns a valid `DashboardState` for an existing `sporenet/state.json` (hand-verified against audit-run's state.json shape).
- `buildDashboardState(cwd)` returns shape with empty arrays + zeroed cache when `sporenet/state.json` is absent — no throw.
- `buildDashboardState(cwd)` throws on malformed JSON in state.json.
- `tailEvents(path, null, 200)` returns up to 200 entries newest-first from a JSONL file.
- `tailEvents(path, "2026-05-16T00:00:00Z", 200)` filters strictly greater than `sinceTs`.
- Malformed JSONL lines are skipped without crashing (single stderr log per bad line).
- All NUTRIENTS §2 interfaces exported verbatim — name + field types match exactly.

## Out of scope
- Writing state.json or events — `cache-network-integration` and existing framework code.
- Canvas / DOM rendering — `dashboard-canvas` / `dashboard-console`.
- Theme loading — `dashboard-theme`.
- HTTP / SSE serving — `dashboard-cli`.
- Cache event aggregation / `cache.pulse` cadence — `cache-network-integration`.

## Merge instructions
Second in dashboard merge order, after `dashboard-theme`. `dashboard-canvas` / `dashboard-console` / `dashboard-cli` block on the `DashboardState` type frozen here. No changes to existing framework code outside `cli/src/lib/dashboard/`.
