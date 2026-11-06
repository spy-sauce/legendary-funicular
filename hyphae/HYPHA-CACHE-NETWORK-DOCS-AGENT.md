# HYPHA — cache-network-docs

## CACHE HEADER
- **SCOPE:** Developer documentation — append a `## Cache-Network` section to `DEVELOPER_GUIDE.md` describing MICRO + CACHE_NET vocab, the `--no-cache` flag, cache events, `state.cache`, cost accounting, and tuning knobs from an operator's perspective.
- **PRIMITIVES:** Markdown composition · cross-linking · operator-voice prose.
- **RULES:** **append-only edits** to `DEVELOPER_GUIDE.md` — do not modify existing sections (framework convention) · cross-link `docs/cache-network-micro-agents.md` for design rationale, do NOT duplicate it · do not restate NUTRIENTS sections verbatim, link by section number · voice matches existing DEVELOPER_GUIDE engineering tone (terse, declarative, no marketing).
- **COUPLING:** documents shipped behavior produced by `cache-network-store`, `cache-network-integration`, `cache-network-micros`. Last in merge order among cache-network biomes. Parallel-safe with `dashboard-docs` — different `DEVELOPER_GUIDE.md` sections, order-independent appends.
- **LOAD WHEN:** writing the operator-facing Cache-Network section.

## Scope
Document the cache-network subsystem from the operator's perspective. One artifact: a new `## Cache-Network` section appended to `DEVELOPER_GUIDE.md` (after the Dashboard section authored by `dashboard-docs`, or wherever it merges cleanly). The design doc `docs/cache-network-micro-agents.md` is the rationale source — this section is shipped-behavior reference, not vision.

This biome lands after the three cache-network code biomes so docs reference real shipped behavior, not spec hypotheticals.

## Deliverables by leaf

### `cache.docs.developer-guide`
- File: `DEVELOPER_GUIDE.md` — **append** a new top-level section titled `## Cache-Network`. Do not modify existing sections.
- Section contents:
  - **What CACHE_NET is** — one paragraph framing the framework-level shared cache layer per NUTRIENTS §7. Link to `docs/cache-network-micro-agents.md` for design rationale.
  - **What MICRO is** — one paragraph framing the 2–4-per-leaf sub-worker unit per NUTRIENTS §7. Link to design doc; do not restate the lifecycle table.
  - **The `--no-cache` flag** — when to use it (debugging cache invalidation issues, A/B comparison runs against cached baselines, reproducing a known-cold run). Default ON. Reference `cli/src/commands/cultivate.ts` for the integration anchor.
  - **The 4 event types** — table of `cache.hit` / `cache.miss` / `cache.evict` / `cache.pulse` per NUTRIENTS §3, with the dashboard surface each feeds (raw hit/miss → canvas pulse animations; pulse → ticker readouts; evict → events feed). One-line each.
  - **`state.cache` extension** — the additive block in `sporenet/state.json` per NUTRIENTS §5. Note the reader-tolerant-of-absence contract; quote the shape inline.
  - **Cost accounting** — `saved_tokens × UNIT_COST = saved_usd`. Document `UNIT_COST = 0.000003` (opus-4-7 input rough) and that it's exported from `cli/src/lib/cache-network/accounting.ts`. Note that operators retune this constant by editing the source — there is no env-var override in v1.
  - **Tuning sub-section** — how to adjust cache capacity. Document whichever mechanism the `cache-network-store` biome shipped (env var, `mycelium.yaml` field, or constructor opt). Read `cli/src/lib/cache-network/index.ts` for the actual capacity-config surface before writing this — do not invent a mechanism. If only constructor opts shipped, document that and flag the env-var / yaml path as future work.
- Length budget: 150–300 lines of new markdown. Substantive but not bloated.

## Contract dependencies
- NUTRIENTS §3 — event schema; describe to operators, link by section.
- NUTRIENTS §4 — cache runtime; describe operator-visible behavior (LRU eviction, iter invalidation, `--no-cache`).
- NUTRIENTS §5 — state.json extension; quote the shape.
- NUTRIENTS §7 — frozen vocab; document MICRO + CACHE_NET as canonical terms.

## Acceptance criteria
- `DEVELOPER_GUIDE.md` has a new `## Cache-Network` section.
- Section length 150–300 lines.
- Cross-references `docs/cache-network-micro-agents.md` at least once for design rationale; does NOT duplicate the design doc's tables or thesis prose.
- All four cache event types appear with their dashboard-surface mapping.
- `--no-cache` flag is documented with at least two concrete use cases.
- `state.cache` shape is quoted inline.
- Tuning sub-section reflects the actually-shipped capacity-config mechanism (verified by reading `cli/src/lib/cache-network/`).
- No edits to existing `DEVELOPER_GUIDE.md` sections (verify with `git diff DEVELOPER_GUIDE.md` — only new lines).

## Out of scope
- Dashboard theming or canvas docs — `dashboard-docs`.
- Cache runtime implementation — `cache-network-store`.
- Cultivate integration wiring — `cache-network-integration`.
- Micro spawn implementation — `cache-network-micros`.
- Marketing / external-facing positioning.
- Auto-generating docs from code annotations — manual prose is fine for v1.

## Merge instructions
Last in merge order among cache-network biomes. Reads from `cache-network-store`, `cache-network-integration`, `cache-network-micros` shipped behavior — if this leaf wakes before any of those biomes' files exist, halt and emit FRUIT_FAILED with the missing path. Parallel-safe with `dashboard-docs` (different `DEVELOPER_GUIDE.md` sections; both append, no conflict).
