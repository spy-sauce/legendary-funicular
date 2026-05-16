# HYPHA — dashboard-canvas

## CACHE HEADER
- **SCOPE:** Three.js WebGL canvas inside `templates/dashboard.html` — fibonacci agent globe + leaf orbits + micros + cache relay inner shell + slow directional pulses + adaptive zoom + multiverse view + Star Wars HUD overlays.
- **PRIMITIVES:** `THREE.Scene` · wireframe Bloch rings (3 orthogonal tori) · octahedron relays · `BufferGeometry` packet tweens · `MathUtils.lerp` cam target.
- **RULES:** every animation ≥ 1.5s (slow-pulse discipline) · per-agent identity hue stable (lifecycle modulates brightness only, not hue) · cache relays distinct shape + inner radius vs agents · no DOM mutation from this biome (chrome lives in `dashboard-console`) · bind to `window.__DASHBOARD_STATE__` + `window.__DASHBOARD_THEME__` only, never re-fetch.
- **COUPLING:** consumes `DashboardTheme` (NUTRIENTS §1) and `DashboardState` (NUTRIENTS §2) at boot via the inlined globals; co-owns `templates/dashboard.html` with `dashboard-console` on disjoint sections (canvas vs DOM chrome) so the two leaves merge cleanly.
- **LOAD WHEN:** any leaf touching the `<canvas id="webgl">` element, Three.js scene/camera/renderer, biome wires, micros, cache relays, pulse animations, zoom controller, or HUD overlays in `templates/dashboard.html`.

## Scope
Port the canvas surfaces from `.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html` (visual ground truth — gitignored, local-only) into `templates/dashboard.html`, replacing the prototype's simulator data with reads from `window.__DASHBOARD_STATE__` and `window.__DASHBOARD_THEME__`. The render pipeline (Bloch wires, leaf orbits, micros, cache relays, packets, multiverse mini-globes, HUD) is preserved as-is; only the data sources change. Faithful port, not a redesign.

## Deliverables by leaf

### `dashboard.canvas.scaffold`
- Modify: `templates/dashboard.html` — base HTML scaffold, `<canvas id="webgl">` element, Three.js ES-module import from `https://unpkg.com/three@0.161.0/build/three.module.js` (CDN, no vendoring). Scene + perspective camera + WebGLRenderer setup, devicePixelRatio capped at 2, antialiased, transparent clearcolor over `theme.palette.ink`. Resize handler on `window`. Mirror v9.4 lines ~1080-1110.
- No simulator constants — `BIOMES` / `PRODUCTS` / `ROUTING` from v9.4 are replaced by `window.__DASHBOARD_STATE__` reads.

### `dashboard.canvas.agent-globe`
- Place each `state.agents[i]` on a fibonacci sphere at radius 4.6 (mirror v9.4 `createBiomeWires` golden-angle distribution). Each agent renders as a wireframe Bloch ring — 3 orthogonal `TorusGeometry` rings.
- Hue from `theme.identity[agent.id]` (stable per biome). Brightness modulated by `agent.state` via `theme.modulator` (`pending_brightness` / `active_brightness` / `fruit_brightness` / `failed_brightness`; `dorm` uses `pending_brightness`).
- Slow breath via `sin(t * theme.modulator.active_pulse_hz * TAU)` on `active` agents only — clamp `active_pulse_hz` ≤ 1.5.

### `dashboard.canvas.leaves-and-micros`
- Leaves orbit each agent at radius 1.3 (mirror v9.4 lines 1275-1311). One small sphere per `agent.leaves[i]`. Visible only when parent agent is the focused agent (zoom preset `agents` or `leaves`).
- Micros orbit each leaf at radius 0.4 (mirror v9.4 lines 2497-2530). Count from `leaf.micros.length` (2-4). Color by `micro.routing`: `cheap` → `theme.lifecycle.germ` (`--life-germ` equivalent); `full` → `theme.palette.cryo`.
- Orbit speeds: leaves 0.18 rad/s, micros 0.32 rad/s — both well under the 1.5Hz ceiling.

### `dashboard.canvas.cache-relays`
- 4-6 `OctahedronGeometry` relay nodes at inner radius 2.6 (vs agent radius 4.6), color `theme.identity["cache-network-store"]` (default `#1E9EBF`). Fibonacci-distributed (mirror v9.4 lines 1517-1632).
- Each agent edges to its 3D-nearest relay (`LineSegments` with `LineBasicMaterial`). Relays form a 2-neighbor mesh among themselves.
- Slow breath via `sin(t * 0.8 + relayIndex)` — 0.8 rad/s, under the ceiling.

### `dashboard.canvas.pulses`
- Three slow directional pulse families, all ≥ 1.5s traversal:
  - **Routing packets** — agent→agent on outer mesh, 6s traversal. Triggered by `EventEntry { category: "lifecycle" }` arrivals in `state.events`.
  - **Cache queries** — leaf→relay, 3s traversal. Cyan-teal (`theme.palette.cryo`) for `cache.hit` events, gold (`theme.severity.warn`) for `cache.miss` plus a brief relay dim (1.6s decay).
  - **Subagent dashflow** — agent→leaf, 4s traversal, when leaf transitions to `active`.
- Implement as point tweens along precomputed `BufferGeometry` curves. No `setTimeout < 1500ms`; no `requestAnimationFrame` frequency higher than the slow-pulse ceiling.

### `dashboard.canvas.adaptive-zoom`
- Three presets: `globe` d=14, `agents` d=7.5, `leaves` d=2.8. `zoomDistanceTarget` lerped 0.07 per frame toward the active preset's distance (mirror v9.4's `zoomDistanceTarget` pattern).
- Wheel-zoom rebound to a custom handler that snaps to the nearest preset on release. Click on an agent → preset `agents`; click on a leaf → preset `leaves`; double-click empty space → preset `globe`.
- Focus target written to a module-local ref (no DOM mutation from this biome — `dashboard-console` reads via a small event the canvas dispatches on `document`).

### `dashboard.canvas.multiverse`
- When `state.organism.view === "multiverse"`, render mini-globes for each product in an outer ring (mirror v9.4 multiverse group + product-strip).
- Click a mini-globe → dispatch a `dashboard:enter-product` CustomEvent on `document` with `{ product_id }`. `dashboard-console` flips `state.organism.view` to `"product"` and sets `active_product_id`; canvas re-reads on next render tick.
- When `view === "product"`, mini-globes hidden; main globe shows agents filtered to `active_product_id`.

### `dashboard.canvas.hud-overlays`
- Targeting reticle — 4 corner brackets converging on the focused agent (mirror v9.4 lines ~798-820). Animates in over 1.6s.
- Scan beam — vertical sweep across the focused agent during a `dive` transition (preset change `globe`→`agents` or `agents`→`leaves`). 1.8s duration.
- Depth HUD readout — small Geist Mono label near the reticle showing `agent.id` + `agent.state` + `iter`. Updates on focus change only (no per-frame redraw).

## Contract dependencies
- NUTRIENTS.md §1 — `DashboardTheme` shape (palette + identity + modulator). Read once at boot from `window.__DASHBOARD_THEME__`.
- NUTRIENTS.md §2 — `DashboardState` shape (`agents` / `cache` / `events` / `organism.view`). Read once at boot from `window.__DASHBOARD_STATE__`; re-read on full-page reload only.
- Visual ground truth: `.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html` (local-only, gitignored).

## Acceptance criteria
- `templates/dashboard.html` opens standalone via `file://` with a minimal injected `window.__DASHBOARD_STATE__` + `window.__DASHBOARD_THEME__` and renders the canvas without console errors.
- Three.js loads from CDN (no vendoring, no new npm dep).
- `grep -nE 'setTimeout|setInterval' templates/dashboard.html` shows no sub-1500ms values; sinusoidal animation frequencies ≤ 1.5Hz.
- Per-agent identity colors applied — visual diff shows distinct hues across agents, not a single lifecycle color.
- Cache relays render at inner radius 2.6 as octahedrons in `#1E9EBF`-family, visually distinct from agent Bloch rings.
- `npx tsc --noEmit` clean (no TS in this file, but the build that emits `templates/` must stay green).

## Out of scope
- DOM operator chrome — metric strip, event feed, inspect panel, alert ribbon, multiverse toggle UI → `dashboard-console`.
- `theme.yaml` schema + loader + default theme → `dashboard-theme`.
- `state.json` reader + JSONL event tailer + `DashboardState` builder → `dashboard-data`.
- HTTP serving the template + `mycelium dashboard {init,serve,render}` wiring → `dashboard-cli`.
- DEVELOPER_GUIDE.md / docs/dashboard-theming.md → `dashboard-docs`.

## Merge instructions
Lands after `dashboard-theme` + `dashboard-data` freeze their exported types (consumes both shapes). May land in parallel with `dashboard-console`: the two biomes edit DIFFERENT sections of `templates/dashboard.html` — canvas section (`<canvas id="webgl">` + Three.js block) vs DOM chrome (metric strip, event feed, inspect panel) — and merge cleanly if leaves stay in their lanes. Stream tag `MYC/DASHBOARD`.
