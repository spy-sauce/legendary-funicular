# Brief — Mycelium Dashboard + Cache-Network Cultivation

> **Operator-authored** (audit-run precedent). Reference doc for HYPHA authors and cultivated leaves. Not consumed by `mycelium plant` — framework-internal cultivations skip plant.

## Purpose

Ship two interlocked subsystems in one parallel cultivation:

1. **Dashboard** — operator console rendering the live state of any Mycelium cultivation as a 3D canvas (Three.js wireframe Bloch-sphere agents on a fibonacci globe) + operator chrome (metric strip, alert ribbon, event feed, inspect panel).
2. **Cache-network** — framework runtime layer: each leaf fans out into 2-4 micro-agents that share a cache. Cache hits replace redundant LLM/API calls. Hit-rate + entries + calls-saved are first-class metrics. The dashboard renders the cache topology as **dedicated cache relay nodes on an inner radius**, with slow directional pulses showing agent→relay queries.

## Why now

- Dashboard is the framework's UX surface. Static `sporenet/index.html` doesn't show the organism breathing; the dashboard does.
- Cache-network is the framework's call-reduction layer. Per `docs/cache-network-micro-agents.md`: shared cache between micros → fewer calls → less downstream DB development (cache absorbs the read pattern). The `cache-layer` biome named in `docs/bus-router-livegrid-architecture-pack.md` line 154 finally gets built.
- They ship together because the dashboard is the legibility surface for the cache-network. Building one without the other leaves either an invisible runtime or a mock-data UI.

## Visual ground truth

`.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html` is the canonical visual reference (gitignored, local-only). Leaves working on canvas/console MUST read it. Key surfaces locked in v9.4:

- **Cryogenic palette** — `--ink #060912`, `--ice #E8EEF5`, `--cryo #7AE5FF` accent; lifecycle hues desaturated/cool; Geist 200/300 display + Geist Mono data + Cormorant Infant italic marginalia.
- **Per-agent identity colors** — each biome agent has a stable hue from a 10-color identity palette. Lifecycle state (germ/grow/flow/fruit/dorm) modulates brightness/saturation, not hue. Palette in v9.4 `BIOME_IDENTITY` map.
- **Cache relay nodes** — 4-6 cyan-teal `#1E9EBF` octahedrons on inner radius 2.6 (vs agent radius 4.6). Each biome agent edges to its 3D-nearest relay; relays form a 2-neighbor mesh.
- **Slow pulse discipline** — every animation ≥ 1.5s. Packet traversal 6s, dashflow 4s, hit-ring 1.4s, miss-ring 2.0s, biome breath ~0.9 rad/s. No fast blinks.
- **Adaptive zoom** — three presets (globe d=14 / agents d=7.5 / leaves d=2.8) with smooth tween.
- **Multiverse view** — `view: 'multiverse' | 'product'`. Mini-globes per product on outer layer; click to dive into a product's full canvas.
- **Star Wars HUD** — targeting reticle, scan beam, depth HUD on focus.
- **Inspect panel** — click-to-pin per-agent and per-leaf detail; subagent mini-diagram inside.

## Architectural ground truth

`docs/cache-network-micro-agents.md` is the canonical runtime reference. Key contracts:

- **MICRO** — 2-4 per leaf, spawn when leaf transitions to `active`, die when leaf transitions to `done`/`failed`. Color-coded `--life-germ` (cheap routing) vs `--cryo` (full-model routing).
- **CACHE_NET** — keyed by `(tool_name, normalized_args, contract_hash)`. LRU eviction, capacity configurable (default 256 entries per cultivation). Per-leaf invalidation on heal-loop iteration advance. Cache lookup precedes Router classification (not after). Bus emits aggregate cache pulses, not per-call events.
- **HIT_HALO is NOT a contract** — purely visual, lives in dashboard biomes only.

## Required outputs

### Dashboard cultivation outputs

- New CLI command `mycelium dashboard {init,serve,render}` registered in `cli/src/commands/dashboard/`.
- `mycelium dashboard init` writes a default `theme.yaml` into the cwd cultivation, plus a static `dashboard.html` snapshot.
- `mycelium dashboard serve --port 3334` runs an HTTP server that re-reads `sporenet/state.json` + `theme.yaml` per request and re-renders the canvas-driving HTML on the fly. Mirror existing `mycelium sporenet serve` live-render behavior.
- `mycelium dashboard render` writes a static one-shot HTML to `sporenet/dashboard.html`.
- `theme.yaml` per-cultivation moldability: palette (cryo accent + ink + ice family), brand (title + tagline), biome→identity-color mapping, lifecycle modulator curves.
- `templates/dashboard.html` is the template — derives from v9.4 prototype but reads `theme.yaml` at server-render time. Inline Three.js (CDN or vendored) acceptable.
- Adaptive-zoom canvas, fibonacci agent globe, cache relay inner shell, subagent map in inspect panel, multiverse view, slow-pulse discipline. **NOT a re-design** — port v9.4 surfaces faithfully and bind to live data.

### Cache-network runtime outputs

- `cli/src/lib/cache-network/` module: `store.ts` (in-process LRU Map with capacity), `keys.ts` (deterministic key derivation), `accounting.ts` (hits/misses/entries counters + JSONL emission).
- `cli/src/lib/micro-agents/spawn.ts` — given a leaf, spawn 2-4 micros with cheap/full routing split (deterministic per leaf id; e.g., 70% cheap when leaf is non-critical, 50/50 when critical).
- Integration with `cli/src/commands/cultivate.ts` — at the leaf-call chokepoint (around line 480; grep `sdkCall\|claude-agent-sdk` for actual anchor), check cache before SDK call. On hit, emit a `cache.hit` JSONL event + return cached payload. On miss, fall through to SDK + record into cache.
- New `cache.hit` / `cache.miss` / `cache.evict` JSONL event types — register in event schema (NUTRIENTS §3).
- Sporenet state.json extension — add optional `cache: { hits, misses, entries, capacity }` block. Optional means existing readers don't break.
- Embedding-side adapters (`impl/python/mycelium/cache_network.py` + `impl/java/.../CacheNetwork.java`) are NICE-TO-HAVE, not required for v1. If a leaf chooses to ship them, follow existing embedding-package shape.

### Docs outputs

- `DEVELOPER_GUIDE.md` gets append-only sections: "Dashboard" + "Cache-Network". Existing content untouched.
- `docs/cache-network-micro-agents.md` is reference-only — leaves should LINK to it, not duplicate it.
- New top-level doc `docs/dashboard-theming.md` explaining `theme.yaml` schema with worked example.

## Constraints

- **No new npm deps for cache-network.** Use Node stdlib `Map` for LRU. If a leaf needs a real LRU library, document why in FRUIT_READY.
- **Three.js OK as CDN** in templates/dashboard.html (consistent with prototype). Do not vendor unless a leaf has strong justification.
- **Preserve `sporenet/state.json` shape.** Only add optional fields. See `cli/src/commands/sporenet.ts:34-42` for current shape.
- **Preserve cultivate.ts public contract.** Cache-network plugs in at the SDK-call chokepoint only; no new flags affect existing behavior. `--no-cache` is the one new flag — defaults ON.
- **Frozen vocab additions:** `MICRO`, `CACHE_NET` enter the canonical Mycelium vocabulary. Do not redefine `HYPHA` / `BIOME BUS` / `NUTRIENTS` / `FRUITING BODY`.
- **No tests for the framework repo itself** (rule 5). Cultivated apps may have tests; the framework is gated by `tsc --noEmit` + `cultivate --dry-run`.

## Biome decomposition (operator-authored — final, not a hint)

10 biomes, each with one HYPHA file at `hyphae/HYPHA-<biome>-AGENT.md`:

| Biome | Owns | Stream tag |
|---|---|---|
| `dashboard-theme` | `theme.yaml` schema + loader + default theme | `MYC/DASHBOARD` |
| `dashboard-data` | sporenet state.json reader + JSONL event tailer + `DashboardState` builder | `MYC/DASHBOARD` |
| `dashboard-canvas` | Three.js canvas (agents + leaves + cache relays + slow pulses) | `MYC/DASHBOARD` |
| `dashboard-console` | DOM chrome (metric strip, event feed, inspect panel, alert ribbon, multiverse view) | `MYC/DASHBOARD` |
| `dashboard-cli` | `mycelium dashboard {init,serve,render}` Commander wiring + HTTP/SSE serve loop | `MYC/DASHBOARD` |
| `dashboard-docs` | DEVELOPER_GUIDE.md append + new docs/dashboard-theming.md | `MYC/DOCS` |
| `cache-network-store` | `cli/src/lib/cache-network/{store,keys,accounting}.ts` | `MYC/CACHE` |
| `cache-network-integration` | cultivate.ts chokepoint integration + new JSONL event types + state.json extension | `MYC/CACHE` |
| `cache-network-micros` | `cli/src/lib/micro-agents/{spawn,registry}.ts` | `MYC/CACHE` |
| `cache-network-docs` | DEVELOPER_GUIDE.md cache section + cross-link to design doc | `MYC/DOCS` |

## Ship target

7-10 days wall-clock from contract-freeze. Audit-run precedent: 22 leaves in 332s wall on `-c 30`. Expect similar ratio.

## Reference reading order for leaves

Every leaf reads, in order:
1. Root `NUTRIENTS.md` (frozen contracts) — the dashboard+cache version on this branch
2. Its own `hyphae/HYPHA-<biome>-AGENT.md`
3. The relevant section of this brief (cited by HYPHA)
4. Visual leaves: `.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html`
5. Cache leaves: `docs/cache-network-micro-agents.md`
