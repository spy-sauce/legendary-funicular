# HYPHA — fleet-agent

## CACHE HEADER
- **SCOPE:** cross-organism dashboard + DuckDB query layer over the JSONL event log.
- **PRIMITIVES:** DuckDB WASM · JSONL glob read · aggregation queries · mini-card renderer.
- **RULES:** read-only · queries are typed wrappers, no raw SQL in routes · one mini scale.html per organism.
- **COUPLING:** reads the same JSONL that telemetry writes; extends dashboard-agent's sporenet server.
- **LOAD WHEN:** any leaf touching `/fleet`, DuckDB, or cross-organism rollups.

## Scope
One product is a tree. A fleet of products is a forest. Build the forest view — query the JSONL event logs across all organisms in `.mycelium/events/` and render a grid of mini-dashboards with aggregate health / cost / throughput.

## Deliverables by leaf

### `fleet.query.duckdb`
- File: `cli/src/lib/fleet/duckdb.ts`
- Exports: `openDuckDB(): Promise<DuckDBConnection>` and a `query<T>(sql, params): Promise<T[]>` helper.
- Uses the `duckdb` npm package (WASM-backed; **approved new dependency** per NUTRIENTS.md §10).
- Connection is lazy-initialized and reused across requests.
- Reads from `.mycelium/events/*.jsonl` using DuckDB's `read_json_auto` with `format='newline_delimited'`.

### `fleet.query.api`
- File: `cli/src/lib/fleet/queries.ts`
- Exports typed query functions — no raw SQL leaks out of this file:
  - `listOrganisms(): Promise<{ name, last_run_at, run_count }[]>`
  - `organismRollup(name): Promise<{ avg_health, total_runs, total_cost_usd, last_health, last_run_wall_ms }>`
  - `stageDurations(organism, lastN?): Promise<{ stage_id, avg_ms, p95_ms, n }[]>`
  - `leafFailureRate(organism): Promise<{ biome, fail_rate, n }[]>`
- Each function is one SELECT; no business logic beyond aggregation.

### `fleet.view.route`
- File: edits to `cli/src/commands/sporenet/` (whichever module owns routes after dashboard-agent's port)
- Adds routes:
  - `GET /fleet` — HTML page rendering the fleet overview
  - `GET /api/fleet/organisms` — calls `listOrganisms()`, returns JSON
  - `GET /api/fleet/organism/:name` — calls `organismRollup(name)` + `stageDurations(name)`
- All read-only. Reuse the existing server instance from dashboard-agent.

### `fleet.view.render`
- File: `cli/src/commands/sporenet/templates/fleet.html`
- Grid of organism cards. Each card contains: organism name, last-run timestamp, health badge, total cost, a miniature inline `scale.html` tree (sized down — reuse the same canvas code with scale params).
- Click-through on a card navigates to `/?organism=<name>` (dashboard-agent's main view scoped to that organism — if not yet supported, link to `/` with no filter).
- No external CSS framework — reuse the existing inline styles from `scale.html`. Same design language.

## Contract dependencies
- NUTRIENTS.md §1 — event schema (queries assume this)
- NUTRIENTS.md §5 — sporenet server routes (we add `/fleet` + `/api/fleet/*`)
- NUTRIENTS.md §10 — fleet query approach (DuckDB over JSONL)

## Acceptance criteria
- `npx tsc --noEmit` passes.
- `npm install duckdb` succeeds in `cli/` (add to `cli/package.json`).
- `mycelium sporenet serve` → `GET /fleet` returns HTML.
- With two or more organism JSONL logs present, the page shows both cards with correct counts.
- With zero logs, the page renders an empty state (no crashes).

## Out of scope
- Authentication (still localhost-only).
- Historical drill-down per run (phase-2 feature — link to a run URL you'll add later).
- Cross-organism DAG visualization (aspirational).

## Merge instructions
Merged sixth. Soft dependency on `dashboard-agent` (you extend the server it modified). If the server is still monolithic in `sporenet.ts`, add routes at the end of the existing handler chain. If dashboard-agent split it, add under `cli/src/commands/sporenet/routes/fleet.ts`.

Add to `cli/package.json` dependencies: `"duckdb": "^1.1.0"` (or latest stable). Do not lock to an exact version — caret is fine.
