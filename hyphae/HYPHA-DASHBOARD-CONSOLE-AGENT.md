# HYPHA — dashboard-console

## CACHE HEADER
- **SCOPE:** DOM operator chrome wrapping the canvas — titlebar, 5+2 metric strip, providers/agents right rail, feedbar with filter chips, scrolling event feed, slide-in alert ribbon, click-to-pin inspect panel with subagent map.
- **PRIMITIVES:** read-only bindings against `window.__DASHBOARD_STATE__` + `window.__DASHBOARD_THEME__` · CSS custom properties from theme · custom events on `window` for cross-section signals (canvas relay-pivot, agent select).
- **RULES:** zero hardcoded numbers — every value reads from state · no animation under 1.5s (slow-pulse discipline) · cache chip pivots canvas via `CustomEvent("dashboard:filter", { detail: "cache" })` — console does not touch Three.js · severity → border color via `theme.severity` only · `Esc` closes inspect panel · second click on same agent pins, third click unpins.
- **COUPLING:** consumes the `DashboardState` shape frozen in NUTRIENTS §2 + theme tokens from §1 + event categories from §3. Co-owns `templates/dashboard.html` with `dashboard-canvas` — canvas owns the `<canvas>` + Three.js block; console owns every other DOM region.
- **LOAD WHEN:** any leaf touching DOM regions in `templates/dashboard.html` outside the Three.js canvas, or wiring operator interactions (filter, inspect, alert dismissal).

## Scope
Port the v9.4 prototype's DOM chrome into `templates/dashboard.html`, replacing simulator-driven values with reads from `window.__DASHBOARD_STATE__`. Visual ground truth: `.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html`. Theme tokens drive every color via CSS custom properties injected by the render pipeline.

## Deliverables by leaf

### `dashboard.console.titlebar`
- DOM: top strip with heartbeat dot · brand title + tagline + `logo_char` (from `theme.brand`) · uptime counter computed from `state.organism.started_at` (HH:MM:SS).
- Heartbeat dot pulses at `theme.modulator.active_pulse_hz` Hz via CSS `@keyframes` with `animation-duration` set inline from JS.
- Mirror v9.4 corner-HUD line treatment (Geist Mono · ice_2 color · 0.06em letter-spacing).

### `dashboard.console.metric-strip`
- DOM: 7 cells (5 core + 2 cache) under titlebar, equal-width grid.
- Cells, in order: **Health** (ratio of `state.agents` not `failed`/`dorm`, rendered as % + colored dot via `theme.severity`) · **Agents · Leaves** (count of `state.agents` · sum of `state.agents[].leaves.length`) · **Spend 24h** (sum `state.agents[].cost_usd`, formatted `$N.NN`) · **Events** (count of `state.events` with `ts` within last 24h) · **Alerts** (length of `state.alerts`, red when > 0) · **Cache hit %** (`hits / (hits + misses)` from `state.cache`, `—` if denominator 0) · **Calls saved** (sum of `saved_tokens` from `cache.hit` events in `state.events`, or fall back to `state.cache.hits * 280`).
- Each cell: small uppercase label (Geist Mono 10px, ice_2) · large value (Geist 300, ice) · trend caret optional.

### `dashboard.console.providers-rail`
- DOM: top section of right rail, fixed width 220-280px.
- Iterates `state.providers[]` — one row per provider: identity dot (color from `theme.identity[provider.id]`, fallback cryo) · provider name · up/down status (green/severity.crit) · `latency_ms` right-aligned.
- Section header "PROVIDERS" in marginalia treatment (Cormorant Infant italic, ice_2).

### `dashboard.console.agents-rail`
- DOM: bottom section of right rail under providers, scrollable.
- Iterates `state.agents[]` — one row per agent: 3px left border colored by `theme.identity[agent.id]` modulated by `theme.modulator[<state>_brightness]` · agent name · lifecycle pill (text from `agent.state`, background from `theme.lifecycle[<germ|grow|flow|fruit|dorm>]` mapped per state).
- Click handler fires `selectAgent(agent.id)` which dispatches `CustomEvent("dashboard:agent-select", { detail: agent.id })` and opens the inspect panel.

### `dashboard.console.feedbar`
- DOM: fixed bottom-anchored bar above the event feed.
- Filter chips, left-to-right: `all` · `lifecycle` · `nutrient` · `cost` · `health` · `anomaly` · `cache` — categories exactly per NUTRIENTS §2 `EventEntry.category` union plus `all`.
- Active chip: `theme.palette.cryo` background, `ink` text. Inactive: `rule` border, `ice_2` text.
- Selecting a chip sets a module-scope `state.feedFilter` and re-renders the event feed.
- The `cache` chip ALSO dispatches `CustomEvent("dashboard:filter", { detail: "cache" })` for the canvas to listen for (it dims outer mesh + brightens relay topology). Switching away from `cache` dispatches `detail: "default"`.

### `dashboard.console.event-feed`
- DOM: 60-90px tall (responsive) scrollable column above the feedbar. Newest at top.
- Reads `state.events[]` filtered by `state.feedFilter` (no filter if `all`).
- Row layout: category icon (12px glyph, identity from `theme.severity[event.severity]`) · ts (HH:MM:SS) · source biome (truncated to 14ch) · `short_type` (Geist Mono) · message (Geist 300, ellipsis on overflow).
- 2px left border per row colored by `theme.severity[event.severity]` (`info` falls back to `palette.ice_2`).
- No auto-scroll if operator has manually scrolled away from top within the last 4s.

### `dashboard.console.alert-ribbon`
- DOM: absolute-positioned banner top:0, full width, z-index above all chrome.
- Slides in (transform translateY) when `state.alerts[]` gains a new entry since last render (compare by `ts + message` tuple).
- Auto-dismiss after 15s (single setTimeout per alert) OR on click. Slow slide-out transition (1.5s ease).
- Background: linear-gradient using `theme.severity.crit` → transparent. Text: ice. Severity-`warn` alerts use `severity.warn`, `alert` uses `severity.alert`.

### `dashboard.console.inspect-panel`
- DOM: 300-420px slide-in panel from left edge. Hidden by default. Opens on `dashboard:agent-select` event.
- Sections, top-down:
  1. **Header** — agent id + lifecycle pill + close button (×).
  2. **Synopsis** — single-line contracts summary (`agent.contracts.join(" · ")`) and provider tag (`theme.identity[agent.provider]` dot + name).
  3. **Operator actions** — buttons: `pause` / `resume` (toggles based on `agent.paused`) · `kill` · `respawn`. v1: stubs that emit `CustomEvent("dashboard:operator-action", { detail: { agent_id, action } })`. No-op handler attached.
  4. **Identity** — contracts list · leaves count · provider · cost · tokens.
  5. **Current focus** — first leaf where `leaf.state === "active"`; show `leaf.id` + scope. Empty state: "no active leaf".
  6. **Leaf queue** — every `agent.leaves[]` as a row: state pill · scope · duration · files count · subagent mini-diagram.
  7. **Subagent mini-diagram** — per leaf: 2-4 small circles (one per `MicroState` in `leaf.micros`) colored by `routing` (`cheap` → `theme.lifecycle.germ`, `full` → `theme.palette.cryo`). Each circle has a flow-out arrow toward a central "cache" glyph and a flow-in arrow back; arrows use SVG `stroke-dasharray` with 4s `dashoffset` animation. No animation under 1.5s.
  8. **Recent nutrient flow** — last 4 events from `state.events[]` where `source === agent.id`.
  9. **Files produced** — flat list `agent.leaves[].files` (de-duped, truncated to 12, "+N more" if over).
  10. **Cost** — `cost_usd` + `tokens` from agent, plus per-leaf breakdown.
- Click on background agent in right rail again → pin (sticky open). Third click → unpin + close.
- `Esc` keypress closes (and unpins).

## Contract dependencies
- NUTRIENTS.md §1 — theme palette · lifecycle · severity · identity · modulator (drive every color + animation rate).
- NUTRIENTS.md §2 — `DashboardState` shape, especially `agents[]`, `leaves[]`, `micros[]`, `events[]`, `alerts[]`, `providers[]`, `cache`.
- NUTRIENTS.md §3 — `EventEntry` shape + `cache.hit.saved_tokens` for the Calls-saved metric cell.

## Acceptance criteria
- `npx tsc --noEmit` clean (no TS in this biome, but template HTML must validate).
- Zero hardcoded numeric values in metric strip, rail, feed, or panel — every value reads from `window.__DASHBOARD_STATE__`.
- Cache chip in feedbar dispatches `dashboard:filter` custom event with `detail: "cache"` (verified by manual DOM event log).
- Inspect panel opens on agent click, closes on `Esc`, pins on second click of same agent, unpins on third.
- Subagent mini-diagram renders 2-4 micros per leaf with `routing`-colored fill and 4s `dashoffset` flow animation.
- No CSS `animation-duration` or `transition-duration` under 1.5s anywhere in the chrome.
- Empty-state rendering: missing `state.cache` → cells show `—`; empty `agents[]` → rail shows "no agents"; empty `alerts[]` → ribbon stays hidden.

## Out of scope
- Three.js canvas + Bloch wires + relay mesh + multiverse view — `dashboard-canvas`.
- `theme.yaml` schema, loader, default theme file — `dashboard-theme`.
- `buildDashboardState` + event tailer + JSONL parsing — `dashboard-data`.
- HTTP serving, SSE stream, Commander wiring — `dashboard-cli`.
- `DEVELOPER_GUIDE.md` / `docs/dashboard-theming.md` — `dashboard-docs`.

## Merge instructions
Lands after `dashboard-theme` (needs theme token shape) and `dashboard-data` (needs `DashboardState` builder). Parallel-safe with `dashboard-canvas` — both edit `templates/dashboard.html` but in disjoint DOM regions (canvas owns the `<canvas>` block and Three.js script; console owns every other region). If both biomes touch the same wrapper element, the boundary is the `<canvas id="stage">` — canvas inside, console outside.
