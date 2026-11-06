# Mycelium Dashboard — Design Spec

> Status: design captured from brainstorming session (2026-05-15). Not yet implemented in the framework.
> Reference visual prototypes live in `.superpowers/brainstorm/` (gitignored — file paths in §10).

---

## 1 · Purpose

A live operator console for Mycelium cultivations. Surfaces what each agent (HYPHA biome) and subagent (leaf) is doing in real time, how they communicate via the BIOME BUS (nutrient flows), and lets the operator intervene (pause / kill / respawn) when things go wrong. Intended to be cultivated *via* `mycelium cultivate` itself, mirroring the audit-run dogfood pattern.

## 2 · Decisions taken (locked)

| Decision | Choice | Why |
|---|---|---|
| Direction | **Hybrid** — canvas hero + operator chrome around it | File-1 (canvas network) is poetic but low information density; file-2 (operator console) is dense but doesn't show the organism breathing. Hybrid keeps both audiences. |
| Hierarchy | **Adaptive zoom**: organism → agents → leaves | Real Mycelium organisms have 50+ leaves; flat layout doesn't scale. Map-style zoom is honest. |
| Data source | **State.json snapshot + existing JSONL events** (v1) | Use what the framework already emits. Don't expand the frozen event schema yet. |
| CLI surface | New `mycelium dashboard` command (`init`, `serve`, `render`) | Keeps `mycelium sporenet` as the minimal-state-render fallback; dashboard owns the rich surface. |
| Cultivation | **Dogfood** — `mycelium cultivate` builds the dashboard | Same path proved on audit-run (332s, 22/22 FRUIT_READY). |

## 3 · Aesthetic — "Cryogenic instrument"

The cultivation is observed as if through a dilution refrigerator. Cold, precise, scientific-instrument feel.

**Palette (CSS vars):**
- `--ink: #060912` · `--ink-2: #0A0E18` · `--ink-3: #11161F` (base, near-black with blue undertone)
- `--ice: #E8EEF5` · `--ice-2: #A8B4C5` · `--ice-3: #6A7585` (text — cold whites)
- `--rule: #1A2030` · `--rule-2: #232B3D` (dividers)
- `--cryo: #7AE5FF` (the single phosphorescent accent — heartbeat, active flows, primary highlights)
- Lifecycle (desaturated, cool sub-spectrum):
  - `--life-germ: #B7A8E8` (pale violet)
  - `--life-grow: #7BC9C0` (ice teal)
  - `--life-flow: #8BB8E0` (cyan blue)
  - `--life-fruit: #D9C390` (pale gold — *cool*, not warm)
  - `--life-dorm: #5A6471` (slate)
- Severities (desaturated, not screaming red):
  - `--sev-warn: #D9B85A` · `--sev-alert: #E08A5C` · `--sev-crit: #DB5C6E`

**Typography:**
- Display: **Geist** (weight 200 / 300) — cold, technical, distinctive
- Mono / data: **Geist Mono** (weight 400) — labels, numbers, timestamps
- No italic. No serifs.

**Texture & atmosphere:**
- Faint SVG turbulence noise overlay at `opacity: 0.025` with `mix-blend-mode: screen` — fights flatness
- `THREE.FogExp2` with density `0.025`, matched to `--ink` — distant elements recede
- Two scattered point shells around the scene (outer pale-blue + inner cryo-tinted) — stars/dust for depth

## 4 · Canvas architecture (WebGL via Three.js)

### 4.1 Single-product view (current `lumen-launch` demo)

- **Globe radius `4.6`**, centered at origin.
- **Wireframe orientation rings**: equator + 2 orthogonal meridians + 4 parallels at low opacity. Provides spatial frame.
- **10 agent nodes** distributed on the globe surface via **fibonacci-sphere** for even spacing.
- **Each agent** is a **Bloch-sphere wireframe** (three orthogonal `TorusGeometry` rings) with:
  - Rotating internal vector (`Line` from center to surface point), spin rate per-agent
  - Vector head as a small `SphereGeometry`
  - Central pip sphere (radius `0.05`) — the raycaster hit target. Wrap in a larger invisible `SphereGeometry` (radius `0.6`) so clicks land easily.
  - Uncertainty jitter on position (high-frequency tremor at amplitude `0.012`)
  - Lifecycle color via emissive material
- **Routing edges**: straight `Line` segments through 3D space between agent positions. Dim `--rule-2` at rest, bright `--cryo` with photon packet when a nutrient flows.
- **Photon packets**: small bright spheres with motion trails (6-segment trail with decreasing opacity), travel `0→1` along edge curves over `~2s`. One spawned per active `nutrient.flow` event.
- **Leaves** (subagents): small wireframe icospheres orbiting each parent agent at radius `1.3`. Each has its own canvas-texture **label sprite** (short id like `findings.writer`) that faces the camera. Fade in as camera approaches the agent (via smoothstep on `zoomDistanceCurrent`).
- **Center fiducial**: two concentric `TorusGeometry` rings + 3-axis crosshair lines at origin. Measurement frame, not a glowing core.

### 4.2 Adaptive zoom

Three preset distances (`zoomDistanceTarget`) with smooth tween (`0.07` per-frame lerp toward target). Wheel-zoom **disabled on OrbitControls** and re-bound to a custom handler so the manual tween isn't fought.

- `globe` — distance 14, see all 10 agents
- `agents` — distance 7.5, agents fill the view
- `leaves` — distance 2.8, leaves orbiting the focused agent visible

`+` / `−` / `reset` buttons in a bottom-left cluster; mouse wheel scrubs continuously and snaps the readout to the nearest preset.

### 4.3 5D / ψ axis → heal-loop iteration

The "5th dimension" is **iteration history**, not fictional probability branches. Each agent has a `history[]` array; on each `heal-loop` advancement, current state is snapshotted, `state.iter += 1`, failed leaves reset to pending. Ghost wireframes around each agent represent the same agent at `iter-1`, `iter-2`, `iter-3` (color = state at that iteration). The slider lets the operator scrub back to view prior iterations (with an amber "viewing iter N · live = M" banner across the top).

### 4.4 Lifecycle visual states

- `pending` — dim wire, no fill
- `active` (germ/grow/flow) — full wire, fill, pulsing scale 1.0↔1.15 @ 2.5Hz
- `fruit` (done) — full wire + soft fruit-colored fill
- `failed` (`FRUIT_FAILED`) — broken icosphere geometry with independent shudder jitter, crit-red color, dim wire only, red halo at close zoom

### 4.5 Collapse rings

When a lifecycle event fires (`leaf_started`, `leaf_fruited`), a thin `RingGeometry` ring expands outward from the agent (scale `0.5 → 2.1`) and fades over ~1s. Billboarded to face the camera.

## 5 · Operator chrome (DOM-side, around the canvas)

**Top — titlebar:**
- Heartbeat dot (pulses at 1.6Hz cryo color) + uptime counter (`HH:MM:SS` monospace)
- Brand seal: `mycelium · lumen-launch` (Geist 200, 14-16px)
- Stamp: `organism · {name} · {N} agents · {M} leaves · gate · contract-freeze · t = 0.012 K · heal-loop coupled` (Geist Mono 9px, ellipsizes when narrow)

**Below titlebar — 5-cell metric strip:**
| Health | Agents · Leaves | Spend 24h | Events | Alerts |
| --- | --- | --- | --- | --- |
| `94%` (cryo) | `10 · 32` | `$0.842` | `1,247` | `0` (cryo when stable, crit-red when active) |

Each cell has a small `mtick` bar across the top (thin cryo line) for Health, representing % visually. Values are Geist 200 ~18-25px tabular-nums; labels are Geist Mono 8-9px tracking 0.16em uppercase.

**Right rail (240px wide on default, collapses on narrow):**
- Providers section: 4 LLM providers (anthropic, openai, ollama_local, google) with up/down dots and live latency
- Agents section: 10 rows, each row shows agent name + current lifecycle state pill (color-coded). Click any row → pin that agent's inspect panel.

**Bottom — feedbar + feed:**
- Feedbar: filter chips (`all / lifecycle / nutrient / cost / health / anomaly`)
- Feed: 60-90px scrolling event log, monospace. Each row: icon · timestamp · source · message. Left-border color by severity. Auto-scrolls.

**Alert ribbon (overlay)**: when an anomaly fires, an absolute-positioned banner slides in at the top of the stage area (does NOT take frame height) — crit-red gradient with `⚠ anomaly` badge + message. Auto-dismisses after ~15s.

## 6 · Inspect panel (click-to-pin)

Click any agent (on canvas) or any agent row (in rail) → 300-420px wide panel slides in from the left of the stage.

**Sections (top-down):**

1. **Header** — eyebrow `agent · pinned`, h-title (agent id), h-tag (`agent[n] · contracts §N · §M`), close `[esc]` button, state pill.
2. **Synopsis** — plain-English description of what the agent owns.
3. **Operator actions** — three buttons: `[pause | resume]` `[kill agent]` `[respawn (N)]` — respawn enabled only when N>0 failed leaves exist.
4. **Identity** — contracts owned, leaves planned, leaves done, leaves failed (red), paused (y/n), provider.
5. **Current focus** — which leaf is active, its scope, current phase, progress %.
6. **Leaf queue** — every leaf as a row: state dot, leaf id (+ truncated scope), duration, commit hash. Click a row → switches panel to leaf-detail mode.
7. **Recent nutrient flow** — last 6 in/out flows with neighbor and payload kind.
8. **Files produced** — real paths of committed artifacts.
9. **Cost** — tokens · USD · wall time.

**Leaf detail mode** (when a leaf row is clicked):

- Header: `leaf · pinned · owned by {agent}`, `[↑ agent]` button to return
- Sections: synopsis · scope · execution (status, duration, commit, tokens, est. cost) · failure reason (red, if failed) · artifacts (file paths) · parent agent · last events
- Same operator action row: `[pause]` `[kill leaf]` `[respawn]`

## 7 · Multiverse (deferred to v2)

The ecosystem-level view: multiple product globes in a higher view. Click any to zoom into its full single-product view. **Deferred from v1** because it added click-routing complexity that destabilized the working single-product flow. Re-introduce as an optional toggle once v1 is rock-solid.

Sketch when revisited:
- 5 product mini-globes arranged in a row at `y=0` with mild `z` variation
- Each is a small wireframe sphere with agent dots + name label + status sub-label
- Product-to-product edges show ecosystem-wide shared flows (auth, billing, analytics)
- Continuous cryo packets travel between products
- Camera hard-teleports (no tween) when clicking a product mini-globe

## 8 · Simulator — the demo's source of life

The dashboard is driven by a cultivation simulator that mirrors real framework behavior. For the audit-run cultivation it uses **the real 22-leaf list** from `sporenet/state.json` — actual scopes, commits, durations, token counts, synopses.

**Event sources:**
- Lifecycle: `leaf_started` (germ→grow), `leaf_fruited` (grow/flow→fruit), `FRUIT_FAILED` (~8% rate at iter 0, drops to ~2% on heal-loop iterations)
- Nutrient flow: every leaf-fruited emits a downstream nutrient to a routing-defined neighbor with real payload kinds (`Finding[]`, `TesterDef`, etc.)
- DDP stages: random `gate · entered` / `gate · cleared` events for `lint/typecheck/test/build/deploy-stg/smoke/deploy-prod`
- Health pulses: provider latencies (mostly healthy, occasional T2 collapse)
- Anomalies: random alerts (latency spike, cost surge, spawn flood, auth probe)

**Heal-loop trigger**: when any leaf fails, schedule iteration advancement in 6-9s. Advancement = snapshot all agents to `history[iter]`, increment `state.iter`, reset failed leaves to pending in target biomes.

## 9 · Biome decomposition (for the cultivation that builds this)

6-biome split mirroring audit-run's proven shape (7 biomes, 22 leaves, 332s wall-clock):

| Biome | Owns |
|---|---|
| `dashboard-theme` | `theme.yaml` schema + loader + default theme (lifecycle colors, palette, brand, biome→node mapping) |
| `dashboard-data` | `state.json` reader + JSONL event tailer; exposes unified `DashboardState` to the renderers |
| `dashboard-canvas` | Adaptive-zoom Bloch-wire renderer; agents, leaves, edges, packets, ghost iterations |
| `dashboard-console` | Operator chrome: metric cards, alert ribbon, event feed, provider rail, agent rail, inspect panel |
| `dashboard-cli` | `mycelium dashboard {init,serve,render}` Commander wiring; HTTP/SSE serve loop |
| `dashboard-docs` | Theming guide, extending guide, examples |

NUTRIENTS to draft (frozen sections cultivate.yaml reads):
- §1 — `theme.yaml` schema (palette + lifecycle colors + biome→node mapping)
- §2 — `DashboardState` shape (consumed by canvas + console)
- §3 — JSONL event stream subset the dashboard tails
- §4 — Inspect panel payload shape (per-agent + per-leaf)
- §5 — Operator action API (pause, kill, respawn — bridge to framework intents)

## 10 · Visual prototype reference

Per-iteration mockups live in `.superpowers/brainstorm/4035-1778891130/content/` (gitignored). For posterity:

| File | What it locked in |
|---|---|
| `hybrid-v1.html` | "Specimen under glass" warm 2D — first hybrid mockup |
| `hybrid-v2-quantum.html` | Cold cryogenic palette + Geist typography + hex lattice |
| `hybrid-v3-quantum-5d.html` | 3D Three.js with wireframe Bloch spheres + ψ ghosts |
| `hybrid-v4-live-demo.html` | Real audit-run data + click-to-pin inspect panel |
| `hybrid-v5-leaves-clickable.html` | Bigger labeled leaves + leaf-detail inspect mode |
| `hybrid-v6-heal-loop-ops.html` | ψ → iter axis + FRUIT_FAILED + operator action buttons |
| `hybrid-v7-globe-10agents.html` | **Current baseline** — 10 agents on a fibonacci-sphere globe |
| `hybrid-v8-multiverse.html` | Multiverse-of-products attempt — deferred to v2 |

## 11 · What's still open

- **Testing-view variant** — same canvas, but agents/leaves represent test runs (pass/fail), driven by tester output. Toggle via top-right `[build | test]` chip. Re-themes colors (fruit-gold → test-pass-green, crit-red for fail).
- **DDP pipeline lamp column** — vertical 8-stage strip on the right edge of the stage. Per the v6 critique, the DDP gate sequence is fundamental framework architecture and should be a structural surface, not buried in the feed.
- **Per-leaf provider chip** — each active leaf shows which model is currently running it (`claude-opus-4-7`, `claude-haiku-4-5`). Recolors mid-run when provider failover lands.
- **Cost gauge per leaf** — thin gauge ring around each leaf showing budget consumed. Operators care about runaway spend.
- **Time-direction progress arc** — thin arc around the center fiducial that fills as cultivation wall-clock approaches `ship_target`.
- **Multiverse (§7)** — re-introduce once v1 is stable.
