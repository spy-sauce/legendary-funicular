# HYPHA — dashboard-docs

## CACHE HEADER
- **SCOPE:** Developer documentation — `DEVELOPER_GUIDE.md` Dashboard section + new `docs/dashboard-theming.md` worked example.
- **PRIMITIVES:** Markdown composition · cross-linking · per-cultivation theming worked example.
- **RULES:** **append-only edits** to `DEVELOPER_GUIDE.md` — do not rewrite existing sections (framework convention) · theming doc lives in `docs/`, not at repo root · do not duplicate NUTRIENTS content (link by section) · refer to the v9.4 prototype by path only (it is gitignored — do not link).
- **COUPLING:** documents public surface authored by the other dashboard biomes. Last in merge order among dashboard biomes; parallel-safe with `cache-network-docs` (different `DEVELOPER_GUIDE.md` sections, order-independent appends).
- **LOAD WHEN:** any leaf writing developer-facing documentation for the dashboard subsystem.

## Scope
Document the dashboard from the operator's perspective. Two artifacts: a new section appended to `DEVELOPER_GUIDE.md` (command surface, theme.yaml location, live-render behavior), and a top-level theming doc in `docs/` walking a cultivation through customizing its dashboard.

This biome lands after the other dashboard biomes so docs describe real shipped behavior, not spec hypotheticals.

## Deliverables by leaf

### `dashboard.docs.developer-guide`
- File: `DEVELOPER_GUIDE.md` — **append** a new top-level section titled "Dashboard" near the end (after existing sections, before any trailing index). Do not modify existing sections.
- Section contents:
  - **What it is** — one paragraph: live operator console rendering any cultivation's `sporenet/state.json` as a 3D canvas (Three.js fibonacci agent globe + inner cache-relay shell) plus DOM chrome. Mirrors `mycelium sporenet serve`'s live-render discipline.
  - **Command surface** — `mycelium dashboard {init,serve,render}` per NUTRIENTS §6. Table with one-line descriptions and `--port` / `--no-cache` flag notes. Reference `cli/src/commands/dashboard/` for source.
  - **`theme.yaml` location** — lives at the cultivation root next to `mycelium.yaml`. `init` writes a default; operators edit in place. Link to NUTRIENTS §1 for the schema and to `docs/dashboard-theming.md` for the worked example.
  - **How serve re-renders** — restate the `sporenet serve` pattern: every request re-reads `sporenet/state.json` + `theme.yaml` and re-runs the template. Editing `theme.yaml` and refreshing the page is the inner loop.
  - **Cache-network surfaces** — one paragraph: relays render on inner radius; hit-ring / miss-ring animations are bound to `cache.hit` / `cache.miss` JSONL events (NUTRIENTS §3). Cross-link the "Cache-Network" section (authored by `cache-network-docs`).
- Length budget: ~80 lines of new markdown. Tight.

### `dashboard.docs.theming`
- File: `docs/dashboard-theming.md` (~150-250 lines).
- Walk a cultivation through customizing its dashboard. Contents:
  - **The `theme.yaml` schema** — link to NUTRIENTS §1 for the canonical shape; do not restate verbatim. Annotate each top-level key (palette, brand, biome identity map, lifecycle modulator curves) with one line of what-it-controls-on-screen.
  - **Per-cultivation customization** — worked example: a security-focused cultivation tints `--crit-red` dominant; show the before/after `theme.yaml` diff and which on-screen surfaces change. Second mini-example: a docs-only cultivation collapses the lifecycle modulator range so dormancy reads brighter.
  - **Biome identity color rationale** — why each biome gets a stable hue (legibility across lifecycle transitions; hue stays, brightness shifts). Reference the v9.4 prototype by path (`.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html` — gitignored, refer by path, do not link). Frame the cryogenic palette choice against the cellar-design language (operator console, not consumer app — single-bulb warmth was rejected in favor of cryo-cool legibility for dense data).
  - **Lifecycle modulator curves** — explain that state transitions (germ→grow→flow→fruit→dorm) modulate brightness/saturation along curves, never hue. Show one curve worked out numerically (e.g., germ 0.4 → flow 1.0 → dorm 0.25 brightness multiplier on the identity hue).
  - **Cross-reference** — `docs/cache-network-micro-agents.md` for cache relay visual semantics (HIT_HALO is dashboard-only, not a contract).

## Contract dependencies
- NUTRIENTS.md §1 (theme schema) and §6 (CLI surface) — referenced by both deliverables; link by section, do not restate.

## Acceptance criteria
- `DEVELOPER_GUIDE.md` has a new `## Dashboard` section; `git diff DEVELOPER_GUIDE.md` shows only appended lines, no edits to existing sections.
- All `mycelium dashboard` subcommands from NUTRIENTS §6 appear in the command-surface table.
- `docs/dashboard-theming.md` exists with the security-cultivation worked example and at least one numeric lifecycle modulator curve.
- Theming doc cross-references `docs/cache-network-micro-agents.md` and refers to the v9.4 prototype by path (not as a link).
- Terse engineering voice — no marketing prose, no sales framing.

## Out of scope
- Cache-network DEVELOPER_GUIDE section — owned by `cache-network-docs`.
- `theme.yaml` schema or loader code — owned by `dashboard-theme`.
- `mycelium dashboard` CLI code — owned by `dashboard-cli`.
- Canvas / console implementation docs beyond what an operator needs to mold a theme.
- Auto-generating docs from code annotations — manual prose is fine for v1.

## Merge instructions
Last in merge order among dashboard biomes. Reads from every other dashboard biome's shipped behavior — do not start writing until the others have produced their files. Parallel-safe with `cache-network-docs` (different `DEVELOPER_GUIDE.md` sections — order-independent appends; if a textual conflict arises at the end of the file, both appends survive). If this leaf wakes up before another dashboard biome's files exist, halt and emit FRUIT_FAILED with the missing path.
