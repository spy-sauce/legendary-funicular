# HYPHA — dashboard-agent

## CACHE HEADER
- **SCOPE:** port `templates/scale.html` into the `mycelium sporenet` server as a live data-driven dashboard.
- **PRIMITIVES:** HTML template · canvas tree + pool renderer · SSE stream · JSON data slot.
- **RULES:** keep all existing DOM/CSS/canvas code verbatim · replace only simulation logic · preserve standalone `?demo=1` mode.
- **COUPLING:** reads from `telemetry-agent` event log + existing `sporenet/state.json`.
- **LOAD WHEN:** any leaf touching `cli/src/commands/sporenet*`, the HTML template, or the data-binding slot.

## Scope
The visual shell already exists (`templates/scale.html`). Make it read live data instead of running a local simulation. Preserve the existing `mycelium sporenet` CLI surface (`init`, `render`, `mark`, `serve` subcommands).

## Deliverables by leaf

### `dashboard.template.port`
- Copy `templates/scale.html` to `cli/src/commands/sporenet/templates/scale.html`.
- Strip from the `<script>` block: `handleBtn`, `startSim`, `tick`, `endCultivation`, `runDDPStage` simulation internals, random oscillation, and the `sl-*` slider inputs DOM in **live mode only**. Wrap the stripped controls in `<div class="demo-only">` visible only when `?demo=1`.
- Leave `drawTree`, `drawPool`, `updateStats`, `buildPipeline`, timer render functions untouched.

### `dashboard.template.databind`
- Add a `<script id="mycelium-data" type="application/json">{{DATA_JSON}}</script>` slot per NUTRIENTS.md §9.
- New entry point `renderLive()` parses this JSON, hydrates `curT`, `done`, biome labels, DDP state, `elapsedMs`, phase — then calls existing renderers.
- Add SSE client: `new EventSource('/api/events/stream')` updates the data object and re-renders on each new event.
- `?demo=1` query param bypasses all of this and falls back to the original simulation.

### `dashboard.live.state`
- Extend `cli/src/commands/sporenet.ts` (or split to `cli/src/commands/sporenet/index.ts` + `server.ts`, preserving all existing exports).
- Add `GET /api/state` → returns parsed `sporenet/state.json` as JSON.
- Initial page render (`GET /`) reads `state.json` + latest JSONL tail and inlines the merged data into the `mycelium-data` slot.
- Phase inference: no events yet → 0; any `leaf_started` → 1; ≥80% fruited → 2; any `ddp_stage_started` → 3; `run_ended` with health ≥ threshold → 4.

### `dashboard.live.events`
- Add `GET /api/events?since=<ts>&limit=<n>` → reads `.mycelium/events/<current_run>.jsonl`, filters, returns as JSON array.
- Locate "current run" by: reading most-recent file in `.mycelium/events/`, cross-referenced with organism from `mycelium.yaml`. If no events file, return `[]`.

### `dashboard.live.poll`
- Add `GET /api/events/stream` — SSE endpoint.
- Tail the current JSONL file using `fs.watchFile` (polling, 500ms). On each new line, emit as SSE `data: <json>\n\n`.
- Close connection gracefully on client disconnect. Clean up watchers.

## Contract dependencies
- NUTRIENTS.md §1 — event schema (for parsing)
- NUTRIENTS.md §4 — sporenet/state.json shape (do not mutate)
- NUTRIENTS.md §5 — sporenet server routes (this biome owns them)
- NUTRIENTS.md §9 — scale.html data-binding slots
- `templates/scale.html` — the source of truth for the shell (already in repo)

## Acceptance criteria
- `mycelium sporenet serve --port 3333` launches and serves the scale.html at `/`.
- With no `state.json`, page renders in an "idle" phase with zeros — no JS errors.
- With a populated `state.json`, the tree + pool + stats match the data.
- Navigating to `/?demo=1` shows the original interactive simulation unchanged.
- New events appended to the JSONL appear on the page within 1s (SSE).

## Out of scope
- Rendering multiple organisms (that is `fleet-agent`).
- Writing to `state.json` — that is done by `cultivate` and the existing `sporenet mark` command. All new routes are read-only.
- Authentication — assume localhost only, document in DEVELOPER_GUIDE.

## Merge instructions
Depends on `telemetry-agent` for the event schema. Merged fifth. Touch only `cli/src/commands/sporenet*` and new files under `cli/src/commands/sporenet/templates/`. If you need to split `sporenet.ts`, preserve its entire public API.
