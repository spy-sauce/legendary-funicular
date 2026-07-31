# HYPHA — dashboard-cli

## CACHE HEADER
- **SCOPE:** Commander wiring for `mycelium dashboard {init,serve,render}` + the HTTP/SSE serve loop. The public command surface for the dashboard subsystem.
- **PRIMITIVES:** Commander.js · Node `http` stdlib · SSE long-poll · per-request live re-render (mirror `sporenet serve`) · pure `renderDashboard(state, theme, templatePath)` helper shared by `serve` and `render`.
- **RULES:** CLI surface from NUTRIENTS §6 is the public contract — **additions only, no renames or removals** (framework rule #3) · register in `cli/src/index.ts` following the existing `registerSporenetCommand(program)` pattern · single-line addition to index.ts, do not rewrite the file · port default `3334` (sporenet owns `3333`) · SIGINT closes cleanly (no orphaned port).
- **COUPLING:** integration biome — consumes `loadTheme` from `dashboard-theme` (§1), `buildDashboardState` from `dashboard-data` (§2), and the populated `templates/dashboard.html` from `dashboard-canvas` + `dashboard-console`. Last in merge order before `dashboard-docs`.
- **LOAD WHEN:** any leaf touching `cli/src/commands/dashboard/*.ts`, the top-level command registration, or the live-render serve loop.

## Scope
Implement the CLI entry point. Wire `dashboard-theme` + `dashboard-data` together behind three subcommands. Add the HTTP server with per-request re-render and `/events/stream` SSE. Register in the top-level program. No new framework primitives — purely composition.

## Deliverables by leaf

### `dashboard.cli.scaffold`
- File: `cli/src/commands/dashboard/index.ts`
- Exports `registerDashboardCommand(program: Command): void`. Mirrors the shape of `cli/src/commands/sporenet.ts:registerSporenetCommand` (line ~1167).
- Creates a `dashboard` parent command, attaches three subcommands (`init`, `serve`, `render`) from sibling modules in the same directory.
- Also modify `cli/src/index.ts`: add the import alongside the existing `registerSporenetCommand` import and a single-line `registerDashboardCommand(program);` call next to line 61. **One-line addition only — do not rewrite the file or reorder existing registrations.**

### `dashboard.cli.init`
- File: `cli/src/commands/dashboard/init.ts`
- Flags per NUTRIENTS §6: `--cwd <path>` (default `process.cwd()`), `--force`.
- Resolves `<cwd>/theme.yaml`. If missing or `--force`, copies `templates/theme.default.yaml` → `<cwd>/theme.yaml`. Otherwise prints "theme.yaml exists; pass --force to overwrite" and continues.
- Ensures `<cwd>/sporenet/` exists. Reads state via `buildDashboardState(cwd)`, theme via `loadTheme(cwd)`, template path resolved to `templates/dashboard.html`. Calls `renderDashboard(state, theme, templatePath)` and writes the result to `<cwd>/sporenet/dashboard.html`.
- Stdout: one line per artifact written (`wrote theme.yaml`, `wrote sporenet/dashboard.html`). Exit `0` on success.

### `dashboard.cli.render`
- File: `cli/src/commands/dashboard/render.ts`
- Flags per NUTRIENTS §6: `--cwd <path>` (default `process.cwd()`), `--out <path>` (default `<cwd>/sporenet/dashboard.html`).
- One-shot static render. Reads state via `buildDashboardState(cwd)`, theme via `loadTheme(cwd)`, template from `templates/dashboard.html`. Calls `renderDashboard` and writes the returned string atomically (temp-file + rename) to `<out>`.
- Stdout: one confirmation line with the resolved output path + byte count. Exit `0` on success; non-zero with a stderr message on `ThemeValidationError` or template-read failure.

### `dashboard.cli.serve`
- File: `cli/src/commands/dashboard/serve.ts`
- Flags per NUTRIENTS §6: `--port <n>` (default `3334`), `--cwd <path>` (default `process.cwd()`).
- HTTP server using Node `http` stdlib (no new deps). Routes:
  - `GET /` → re-read `state.json` + `theme.yaml` per request via `buildDashboardState` + `loadTheme`, re-render `templates/dashboard.html` via `renderDashboard`, respond `200 text/html; charset=utf-8` with the result. Mirrors the live re-render behavior in `cli/src/commands/sporenet.ts` (the F5 fix from 2026-05-10 — `serve`'s `/` re-renders on each request).
  - `GET /events/stream` → SSE stream (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`). Re-tails `<cwd>/.mycelium/events/<organism>.jsonl` every 1.4s using the `tailEvents` helper (NUTRIENTS §3) and pushes any new lines as `data: <json>\n\n` frames. Closes when client disconnects.
  - `GET /static/*` → serve files from `templates/` if any (Three.js is CDN-loaded; v1 mostly empty).
  - Any other route → `404 text/plain`.
- Per-request logging: one stdout line `GET <path> <status> <ms>ms`.
- `SIGINT` handler: `server.close()` then `process.exit(0)`. No orphaned ports.

### `dashboard.cli.render-helper`
- File: `cli/src/lib/dashboard/render.ts`
- Exports `renderDashboard(state: DashboardState, theme: DashboardTheme, templatePath: string): string`.
- Reads `templatePath` (sync `readFileSync` — render is sync per NUTRIENTS §2). Injects state + theme as a single `<script>` tag immediately before the closing `</body>`:
  ```
  <script>window.__DASHBOARD_STATE__ = ${JSON.stringify(state)};window.__DASHBOARD_THEME__ = ${JSON.stringify(theme)};</script>
  ```
- Pure: no fs writes, no DOM, no network. Same inputs → same output. Throws if `</body>` not present in the template (template integrity error from canvas/console biomes).

## Contract dependencies
- NUTRIENTS.md §6 (Dashboard CLI surface) — your section, frozen.
- NUTRIENTS.md §1 (consumes `loadTheme` from `dashboard-theme`).
- NUTRIENTS.md §2 (consumes `buildDashboardState` from `dashboard-data`).

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `mycelium dashboard --help` lists three subcommands (`init`, `serve`, `render`) with their flags.
- `mycelium dashboard init` in an empty cwd writes `theme.yaml` + `sporenet/dashboard.html` and exits `0`.
- `mycelium dashboard serve --port 3334` starts the HTTP server; `curl http://localhost:3334/` returns HTML containing both `window.__DASHBOARD_STATE__` and `window.__DASHBOARD_THEME__` script tags immediately before `</body>`.
- `mycelium dashboard render --out /tmp/test.html` writes a static HTML file and exits `0`.
- `SIGINT` on `serve` exits cleanly with no port left bound.

## Out of scope
- `theme.yaml` schema + loader — `dashboard-theme`.
- `buildDashboardState` + JSONL event tailer — `dashboard-data`.
- Three.js canvas, agent globe, cache relay shell, packet pulses — `dashboard-canvas`.
- DOM operator chrome (metric strip, event feed, inspect panel, alert ribbon, multiverse view) — `dashboard-console`.
- DEVELOPER_GUIDE + theming docs — `dashboard-docs`.
- Cache-network runtime, micros, integration — `cache-network-*` biomes.
- Modifying `cli/src/commands/cultivate.ts` (framework rule #2) or any existing command's flags (rule #3).

## Merge instructions
After `dashboard-theme` + `dashboard-data` + `dashboard-canvas` + `dashboard-console`. Consumes their exports (`loadTheme`, `buildDashboardState`, populated `templates/dashboard.html`). Registers in `cli/src/index.ts` following the existing single-line `registerSporenetCommand(program)` pattern at line 61. No new npm deps.
