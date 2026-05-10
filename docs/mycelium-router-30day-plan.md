# Mycelium Router — TS-native routing brain in front of OpenRouter

**Source:** Post-Ultra-Plan-mode output (Claude Code planning session)
**Status:** Build-ready · 30-day phased plan · code-grounded
**Stored:** 2026-05-05

---

## Context

SPY wants Mycelium to grow a routing brain that picks the right LLM per
request, with intellect that improves over time. The current state of the
code (verified):

- One LLM chokepoint: `cli/src/commands/cultivate.ts:480` calls `query()` from
  `@anthropic-ai/claude-agent-sdk` — Anthropic-only. There is no
  multi-provider routing today; HANDOFF claims to the contrary are aspirational.
- `Upgrade` interface (`cli/src/lib/upgrades/types.ts`) is frozen
  (CLAUDE.md rule 10). It has `beforeSpawn` / `transformPrompt` / `afterLeaf`
  but no `beforeQuery` — so the router cannot ride an upgrade hook to influence
  the SDK call. It must live **inside `cultivateLeaf()`** itself.
- `cli/src/lib/telemetry/cost-table.ts` already exists with the Claude tiers
  and a `getCost()` lookup — extend, don't duplicate.
- `cli/src/lib/telemetry/events.ts` already exposes a `cost_recorded` kind via a
  buildXxx + sink pattern; a new kind follows that template exactly.
- `cli/src/upgrades/cost-tracker.ts:39,83` already reads `model` off the SDK
  result, so once the SDK is told `options.model`, cost attribution is correct
  with no further change.
- The live dashboard is server-rendered in `cli/src/commands/sporenet.ts`
  (`renderHtml`, the leaf tile is around lines 132–144). `templates/scale.html`
  is the standalone simulator — *not* the live source. Both need a touch.
- The "mycelium-orchestrator" pack referenced in the framing exists only as a
  design reference, not as a directory in the repo. We salvage *concepts*, not
  files: `domain_map.yaml`, the `RoutingDecision` shape, the confidence floor,
  the OpenRouter client pattern.

The honest constraint up front: the Claude Agent SDK is Anthropic-only, so
"router in front of OpenRouter" splits into two lanes:

- **Lane A — Cultivate (agentic, multi-tool):** router picks among Claude
  tiers (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`) and
  passes the choice into `query({ options: { model } })`. SDK tool loop
  preserved.
- **Lane B — Direct prompt (one-shot, no tools):** new `mycelium llm` command
  bypasses the SDK and calls OpenRouter directly. Router can pick *any* model.

Replacing the SDK to get full multi-provider routing inside cultivate is a
rewrite — explicitly out of scope.

## Architecture

```
                       ┌─────────────────────────────────────────┐
                       │  cli/src/lib/router/index.ts            │
        Lane A         │     route({ text, lane, context })      │       Lane B
   ┌──────────────┐    │           │                             │   ┌──────────────┐
   │ cultivate.ts │───▶│  classify (rule-based v1)               │◀──│  llm.ts      │
   │ (line 480)   │    │           │                             │   │ (new cmd)    │
   └──────┬───────┘    │  pick chain ← domain_map.yaml           │   └──────┬───────┘
          │            │           │                             │          │
          │            │  filter to lane (A: Claude only)        │          │
          │            │           │                             │          │
          │            │  emit routing_decision via              │          │
          │            │  ctx.telemetry?.emit                    │          │
          │            └─────────────────────────────────────────┘          │
          ▼                                                                 ▼
   query({ options: { model: <claude-tier> }, ... })          openrouter-bridge.ts
   Claude Agent SDK   (existing path, plus model)             fetch() → OpenRouter
          │                                                                 │
          ▼                                                                 ▼
   cost-tracker reads model off                              prints answer + footer
   SDK result → existing cost_recorded                       (domain, model, cost)
   pipeline keeps working unchanged

                          shared sinks
                              │
       ┌──────────────────────┼─────────────────────────┐
       ▼                      ▼                         ▼
.mycelium/events/      sporenet/state.json         scale.html / sporenet
<run_id>.jsonl         (Leaf gets optional         live dashboard
(routing_decision +    routing_*, model_selected)  (model chip on tile)
 cost_recorded)
```

## What we salvage from the orchestrator design pack

| From pack                       | Salvage as                                                  | Why                          |
|---------------------------------|-------------------------------------------------------------|------------------------------|
| `domain_map.yaml` (general / code / music / legal / fast / reasoning_heavy + example phrases + primary/fallback chains + cost caps) | `cli/src/lib/router/domain_map.yaml`, loaded with `yaml.parse` at module init | Taxonomy + chains are the artifact; framework-agnostic |
| `RoutingDecision` shape         | TS interface in `cli/src/lib/router/types.ts`               | Clean contract for stamping + telemetry |
| Confidence floor `< 0.55 → general` | Constant + branch in classifier                          | Prevents bad classifications from picking expensive models |
| Cost-stamping pattern           | Extend existing `cli/src/lib/telemetry/cost-table.ts` with the OpenRouter rows from domain_map; reuse `getCost()` | Single source of truth |
| Fallback / breaker / L1 cache idea | Lane B `cli/src/lib/router/openrouter-bridge.ts`         | Production-ready inference plumbing |

## What we do *not* salvage

- `lifecycle_gate.py` — today's lifecycle states are derived display labels; an
  enforced state machine is a different cultivation.
- BIOME BUS rewrite, decentralized gossip, Redis L2 cache, per-biome router
  instances — single-process, in-memory L1 only.
- Tests / test framework — repo has none (NUTRIENTS.md §12); honor that.
- Python implementation — TypeScript-native, period.

## Files to add / modify

**New files (all under `cli/src/`):**

```
cli/src/lib/router/index.ts           — public route(input): RoutingDecision
cli/src/lib/router/types.ts           — RoutingDecision, DomainSpec, Lane
cli/src/lib/router/classifier.ts      — rule-based: keyword + regex over example_phrases
cli/src/lib/router/domain_map.yaml    — ported domain spec
cli/src/lib/router/openrouter-bridge.ts — Lane B fetch client (Phase 3)
cli/src/commands/llm.ts               — `mycelium llm <prompt>` (Phase 3)
```

**Modified files:**

| Path                                       | Change                                                                                          |
|--------------------------------------------|-------------------------------------------------------------------------------------------------|
| `cli/src/commands/cultivate.ts` (~467–487) | Call `route()` after `runTransformPrompt`; pass `decision.primary_model` into `query({ options: { model } })`; emit `routing_decision` via `upgradeCtx.telemetry?.emit` |
| `cli/src/lib/telemetry/events.ts`          | Add `routing_decision` to `EventKind` union; add `RoutingDecisionData` interface + `buildRoutingDecision` helper, mirroring `cost_recorded`/`buildCostRecorded` |
| `cli/src/lib/telemetry/cost-table.ts`      | Add OpenRouter model rows referenced by domain_map (deepseek-coder, gpt-5-nano, etc.) under their canonical model IDs |
| `cli/src/commands/sporenet.ts` (Leaf, ~25–34; renderHtml leaf tile, ~132–144) | Extend `Leaf` with optional `model_selected?`, `routing_domain?`, `routing_confidence?`, `usd_estimate?`; render a small chip beside the leaf id when present |
| `cli/src/index.ts` (~21–61)                | `import { registerLlmCommand }`; register before `program.parse()`                              |
| `templates/scale.html`                     | Optional: surface `model_selected` on the leaf tile if present in the data slot — guarded so absence renders cleanly |
| `NUTRIENTS.md` §1                          | Append `routing_decision` to the `EventKind` union and add its `data` payload (extension, not a breaking change — pattern matches what cost_recorded did). NUTRIENTS.md §4 already permits optional Leaf additions, no edit needed there. |

**Files we will NOT touch:**

- `cli/src/lib/upgrades/types.ts` — frozen by CLAUDE.md rule 10.
- `cli/src/upgrades/cost-tracker.ts` — already reads model off SDK result (line 39, 83); it Just Works once we pass `options.model`.

## Phased build (~30 day shape)

### Phase 1 — Skeleton (Days 1–7)

1. Create `cli/src/lib/router/types.ts`:

   ```ts
   export type Lane = "A" | "B";
   export interface DomainSpec {
     name: string;
     example_phrases: string[];
     primary: string;          // canonical model id
     fallback: string[];
     cost_cap_usd?: number;
   }
   export interface RoutingDecision {
     domain: string;
     confidence: number;       // 0..1
     lane: Lane;
     primary_model: string;
     fallback_models: string[];
     reason: string;
   }
   ```

2. Port `domain_map.yaml` (from the pack) into `cli/src/lib/router/domain_map.yaml`.
   Use the existing `yaml` dep (already in `package.json`). No new dependency.

3. Implement `classifier.ts` rule-based scoring: tokenize input; for each
   domain, score `example_phrases` overlap (substring + simple keyword match);
   apply confidence floor `< 0.55 → general`. Keep the function pure so the
   embedding swap later is a drop-in.

4. Implement `index.ts` `route(input: { text, lane, context? })`:
   - classify
   - look up chain in domain_map
   - if `lane === "A"`, filter `primary` + `fallback` to entries whose model id
     starts with `claude-` (lane-A clamp lives here, no separate file)
   - return `RoutingDecision`

5. Extend `cli/src/lib/telemetry/cost-table.ts` with OpenRouter models named in
   domain_map (e.g. `deepseek/deepseek-coder-v3`, `openai/gpt-5-nano`).
   Reuse `getCost()`'s prefix-match logic.

**Verifies:**
`npx tsx -e 'import { route } from "./cli/src/lib/router/index.ts"; route({ text: "refactor this function", lane: "A" }).then(console.log)'`
prints `{ domain: "code", primary_model: "claude-sonnet-4-6", ... }`.

### Phase 2 — Lane A integration (Days 8–15)

In `cli/src/commands/cultivate.ts` `cultivateLeaf()`, after the existing
`runTransformPrompt` (line 469) and before `stream = query({ ... })` (line 480):

```ts
const decision = await route({
  text: prompt,
  lane: "A",
  context: { leaf_id: leaf.id, biome: leaf.biome },
});
upgradeCtx?.telemetry?.emit?.("routing_decision", {
  leaf_id: leaf.id, biome: leaf.biome,
  domain: decision.domain, confidence: decision.confidence,
  model_selected: decision.primary_model,
  fallback: decision.fallback_models[0] ?? null,
  reason: decision.reason, lane: "A",
});
logLine({ event: "routing_decision", decision });
```

Then pass `model: decision.primary_model` into the existing `query({ options: { ... } })`
block (line 482). This is the single chokepoint change. Verify `model` is a
recognized option of `@anthropic-ai/claude-agent-sdk@^0.1.77`'s `query()` after
`npm install` resolves the package locally — if the option name differs,
adjust here only. This is the only `cultivate.ts` edit.

In `cli/src/commands/cultivate.ts:516` (the `updates` object that hits
state.json), also stamp:

```ts
updates.model_selected = decision.primary_model;
updates.routing_domain = decision.domain;
updates.routing_confidence = decision.confidence;
```

In `sporenet.ts`:
- Add the optional fields to `Leaf` (lines 25–34).
- In `renderHtml` (~lines 132–144), render a `<span class="model">…</span>`
  when `l.model_selected` is present.

In `templates/scale.html`: surface the same field in the data-slot tile if
present (guarded — gracefully omit when absent). This keeps the standalone
simulator visually consistent.

**Verifies:** `mycelium cultivate --dry-run` runs; a real cultivate against a
small organism populates `model_selected` per leaf in `sporenet/state.json`,
and a `routing_decision` line appears for every leaf in
`.mycelium/events/<run_id>.jsonl` next to the existing `cost_recorded` line.
The cost numbers from `cost-tracker` should match the chosen tier (since the
SDK reports the model we passed).

### Phase 3 — Lane B (Days 16–25)

`cli/src/lib/router/openrouter-bridge.ts`:
- single `invoke({ messages, model, fallback_models })` returning a streaming
  iterator;
- `OPENROUTER_API_KEY` from env (no key in code — CLAUDE.md rule 8);
- Node `fetch` only (no new deps);
- per-model circuit breaker (closed → open after N consecutive failures →
  half-open after cooldown);
- in-process L1 cache keyed by `sha256(model + canonical(messages))`;
- cost stamp via the extended `cost-table.ts` `getCost()`.

`cli/src/commands/llm.ts`: `mycelium llm <prompt>` — calls `route({ lane: "B" })`,
streams via `openrouter-bridge`, prints answer plus a one-line footer:
`domain=code model=deepseek/deepseek-coder-v3 cost=$0.0007`. Register in
`cli/src/index.ts`.

**Verifies:** `mycelium llm "extract the date from 2026-05-03"` returns an
answer + footer with a Lane-B model. Pull network → fallback chain kicks in.
Repeat → breaker opens; wait cooldown → half-opens.

### Phase 4 — Telemetry + dashboard surfacing (Days 26–30)

- `cli/src/lib/telemetry/events.ts`: add `RoutingDecisionData` interface +
  `buildRoutingDecision(base, data)` builder. Pattern mirrors
  `buildCostRecorded` exactly.
- `NUTRIENTS.md` §1: append `routing_decision` to the `EventKind` union and add
  its data payload. Marked as an additive extension; schema `v: 1` unchanged.
- (Optional, cheap) `mycelium router report` subcommand: tail
  `.mycelium/events/*.jsonl`, group `routing_decision` by domain × model, print
  domain distribution + cost-per-domain. This is the seed data for the
  embedding-classifier swap later.

**Verifies:** `mycelium sporenet serve` shows the model chip per leaf; replay
JSONL via the report subcommand.

## "Training intellect" — what it means in 30 days vs later

Day 30 the router is rule-based + lookup. The intellect:

- A growing JSONL log of `routing_decision` events, joined to the existing
  `leaf_fruited` / `cost_recorded` for outcome data.
- The seed of an offline re-fit loop — same JSONL feeds it.

Real learning is post-30d:

- v0.4: swap `classifier.ts` for an embedding classifier behind the same
  interface. Centroids initially from `example_phrases`; later re-fit from
  successful logged routings. This is the only place a new dep would be
  considered (e.g. a small embedding lib), and it requires explicit
  CLAUDE.md-rule-4 justification at that time.
- v1.0+: fine-tune a small classifier on routing logs.

## Constraints honored

- CLAUDE.md rule 1 (no `git`): orchestrator commits, this leaf does not.
- CLAUDE.md rule 2 (`cultivate.ts` public contract): no flag/prompt-shape
  changes; insertion is inside `cultivateLeaf` (private function).
- CLAUDE.md rule 4 (no new deps): Phases 1–3 add zero deps. ML classifier
  (post-30d) is the only candidate.
- CLAUDE.md rule 5 (no tests): none added.
- CLAUDE.md rule 8 (no secrets): `OPENROUTER_API_KEY` from env only.
- CLAUDE.md rule 9 (state.json shape): only optional field additions on Leaf;
  NUTRIENTS.md §4 explicitly permits this.
- CLAUDE.md rule 10 (Upgrade interface): untouched. Router lives outside the
  upgrade surface.

## End-to-end verification

1. `cd cli && npm install && npm run build` — clean.
2. `npx tsc --noEmit` — clean (NUTRIENTS.md §12 invariant).
3. `node cli/dist/index.js --help` — lists all existing commands plus `llm`.
4. Phase 1 smoke: `npx tsx -e '…route(…)'` returns expected decision.
5. Phase 2 smoke: `mycelium cultivate --dry-run` on the repo's own organism;
   then a real run on a tiny test organism; check `sporenet/state.json` has
   `model_selected` per leaf and `.mycelium/events/<run>.jsonl` has paired
   `routing_decision` + `cost_recorded` lines.
6. Phase 3 smoke: `mycelium llm "what's 2+2?"` prints answer + Lane-B footer;
   network-failure repro confirms fallback + breaker.
7. Phase 4 smoke: `mycelium sporenet serve` shows the model chip on a leaf
   tile.

## What we tell SPY

Yes — buildable. Day-1 router is rule-based plus cost lookup, sitting at the
single LLM chokepoint in cultivate. A new `mycelium llm` command demonstrates
"router in front of OpenRouter" end-to-end. The framework's existing telemetry
sinks become the substrate for real learning — re-fit centroids from logs, then
swap to an embedding classifier, then fine-tune on routing logs. Honest caveat:
in cultivate (Lane A) the router can only pick Claude tiers because the Claude
Agent SDK is Anthropic-only; full multi-provider routing lives in the new
`mycelium llm` surface (Lane B). Replacing the SDK is a separate, much larger
cultivation.

---
---

# Reconciliation with prior architecture artifacts — 2026-05-05

> Notes appended after this Plan-mode output landed alongside two prior architecture artifacts. Reconciles the three.

## A. The three artifacts in play

| # | Artifact | Stored at | Layer | Scope |
|---|---|---|---|---|
| 1 | **Temporal Context Framework v0.2** | `docs/temporal-context-framework.md` | NUTRIENT memory (TRS, decay, tiers) | Spec, pre-freeze |
| 2 | **Cee-Ro Architecture Pack** | `docs/bus-router-livegrid-architecture-pack.md` | BIOME BUS extension (Router Brain, OpenRouter bridge, LiveGrid) | Vision / target state |
| 3 | **This 30-day Plan** | `docs/mycelium-router-30day-plan.md` | Concrete first implementation of routing | Build-ready, code-grounded |

## B. The big reconciliation

The Plan-mode output is **not** a competing architecture to the Cee-Ro pack. It's the honest, code-grounded **first concrete step** toward the Cee-Ro vision.

**Cee-Ro pack envisioned:** Router Brain inside the BIOME BUS, peer-to-peer, decentralized cost ledger across nodes, Redis L2 cache, full multi-provider routing in cultivate.

**This plan delivers (in 30 days):** Router as a function call at the single existing LLM chokepoint in cultivate. Single-process L1 cache only. Lane-A clamped to Claude tiers (SDK constraint). Lane-B for full multi-provider via `mycelium llm`.

**The gap is intentional and honest.** The plan calls out:
- *"BIOME BUS rewrite, decentralized gossip, Redis L2 cache, per-biome router instances — single-process, in-memory L1 only"* — explicitly NOT salvaged.
- *"Replacing the SDK to get full multi-provider routing inside cultivate is a rewrite — explicitly out of scope."*

So the path forward is:
- **Day 1–30** — this plan ships. Router is alive at the chokepoint. Lane B proves "router in front of OpenRouter" works end-to-end. Telemetry logs accumulate.
- **Day 30–90** — embedding classifier replaces rule-based (v0.4). Routing logs become re-fit data.
- **Beyond** — Cee-Ro pack vision becomes feasible: distribute the router across nodes, add Redis L2, eventually replace the SDK to unlock full multi-provider in cultivate.

## C. What this means for the "Intelligent Bus v2.0" thesis I proposed earlier

The earlier thesis was: **freeze TCF v0.3 + Router Brain v0.1 together as Mycelium Intelligent Bus v2.0.** That was correct as a long-term framing, but **wrong as the immediate gate.**

This plan demonstrates that **routing can ship without TCF freezing first.** The router doesn't use TRS today; it's domain-classification → model-selection → cost-stamp, all orthogonal to nutrient memory.

**Revised sequencing:**
- **Now → Day 30:** ship this plan. Routing alive in Lane A + B. No TCF dependency.
- **Day 30 → 60:** embedding classifier swap (v0.4). Still no TCF dependency.
- **Day 60+:** TCF v0.3 spec freeze + cultivation. NUTRIENT schema gets TRS fields. Router *might* start consuming TRS as a context-priority signal at this point (but doesn't have to).
- **Beyond:** Cee-Ro pack vision (decentralized router + LiveGrid + stress test + 400→10K) becomes plausible once both TCF and router foundations are real.

The unified "v2.0 freeze" stays valuable as the long-term integration milestone — but it's not blocking the next 30 days of work.

## D. What this plan honors that's worth calling out

The Plan-mode output is a textbook example of Marathoners-aligned engineering planning:
- **Verifies current code state before proposing changes.** Line numbers, function names, what each existing file already does.
- **Honors all 10 framework rules in CLAUDE.md.** Explicit constraint check at the bottom.
- **No new dependencies in phases 1–3.** Only the embedding classifier (post-30d) is flagged as a candidate that would require justification.
- **Honest scope boundaries.** "BIOME BUS rewrite explicitly NOT salvaged." "Replacing the SDK is out of scope." No drift toward "while we're at it..."
- **Concrete verifies per phase.** Each phase has a runnable check that proves it landed.
- **Names what 'training intellect' actually means in 30 days vs later.** Doesn't oversell. Day 30 is rule-based; real learning is v0.4+.

This is the plan to actually start with. The Cee-Ro pack is the destination; this is the road.

## E. Cultivate this through Mycelium itself, or build directly?

Two paths:

1. **Cultivate via Mycelium (dogfood).** Brief = this plan. Plant generates HYPHAEs (router-types, classifier, domain-map, openrouter-bridge, cultivate-integration, telemetry-extension, sporenet-extension, llm-command, nutrients-doc-update). Freeze, cultivate, harvest. Stress-tests the framework on itself.

2. **Direct implementation.** Linear, file-by-file, the way the plan reads. Lower overhead, faster to start, less framework stress-test value.

The plan is small enough that **either works**. Cultivating dogfoods Mycelium and surfaces framework gaps before they bite production cultivations later. Direct implementation ships faster but learns less. SPY's call.

## F. Status / next moves

- **This plan:** stored at `docs/mycelium-router-30day-plan.md`. Not committed yet — sits alongside Session 6 CLAUDE.md/HANDOFF.md + TCF doc + Cee-Ro pack as uncommitted additions in legendary-funicular.
- **Decision pending:** cultivate-via-Mycelium or direct implementation?
- **Blocking:** None. Phase 1 can start immediately if SPY decides this is the post-Session-8 priority.
- **No longer blocking:** TCF v0.3 freeze. The plan ships without it.
