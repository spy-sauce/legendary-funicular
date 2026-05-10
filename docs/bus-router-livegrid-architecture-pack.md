# MYCELIUM — ARCHITECTURE PACK

**Session:** Opus deep dive · BIOME BUS extension + LiveGrid + stress test + roadmap
**Author:** Claude (Cee-Ro) for SPY · VibeSpace LLC · mfautomation
**Status:** Working architecture, drop-into-repo ready
**Stored:** 2026-05-05

---

## TL;DR

The BIOME BUS becomes a **living routing membrane**: every NUTRIENT flowing through it gets domain-classified, lifecycle-gated, and routed via OpenRouter to the optimal model — with caching, fallback, and per-agent cost stamping. LiveGrid is the first production workload riding on top of it. Stress test instrumentation makes the 400 → 10K agent ramp measurable. Mycelium stays decentralized; OpenRouter sits underneath as inference plumbing; the routing brain is the moat.

```
┌─────────────────────────────────────────────────────────────────┐
│                         ORGANISM                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  BIOME   │◄──►│  BIOME   │◄──►│  BIOME   │◄──►│  BIOME   │  │
│  │ (LiveGrid│    │  (Legal) │    │  (Code)  │    │  (Music) │  │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘  │
│       │               │               │               │        │
│       └───────────────┴───────────────┴───────────────┘        │
│                          │                                      │
│                  ┌───────▼────────┐                             │
│                  │   BIOME BUS    │  (peer-to-peer membrane)    │
│                  │  ┌──────────┐  │                             │
│                  │  │ Router   │  │  ← domain classifier        │
│                  │  │ Brain    │  │  ← lifecycle gate           │
│                  │  └────┬─────┘  │  ← cost tracker             │
│                  └───────┼────────┘                             │
│                          │                                      │
│                  ┌───────▼────────┐                             │
│                  │  OpenRouter    │  ← inference plumbing       │
│                  │  Bridge        │  ← cache · fallback · pool  │
│                  └───────┬────────┘                             │
└──────────────────────────┼──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼            ▼            ▼
          Anthropic     DeepSeek    Mistral fine-tune
          (reasoning)   (code)      (legal)
```

---

## DELIVERABLES IN THIS PACK

| # | File | What |
|---|------|------|
| 1 | `01-biome-bus/ARCHITECTURE.md` + Python | BIOME BUS routing layer, NUTRIENTS contract, lifecycle gate |
| 2 | `02-openrouter/ARCHITECTURE.md` + Python | Production OpenRouter bridge, cache, fallback, cost stamping |
| 3 | `03-livegrid/schema.sql` + ARCHITECTURE.md | LiveGrid backend schema + escrow flow |
| 4 | `04-stress-test/PLAN.md` + harness | What to measure, how to measure it, targets |
| 5 | `05-roadmap/ROADMAP-30-60-90.md` | Ship order, what's DORMANT |
| ⏳ | (held) | Slot for the tech you're plugging in |

---

## DESIGN PRINCIPLES (FROZEN)

1. **Decentralized, not modular monolith** — biomes talk peer-to-peer over the BIOME BUS. No central node. Router Brain runs *inside* the bus, not above it.
2. **Biology terminology is FROZEN** — SPORE/GERMINATING/GROWING/FLOWING/FRUITING/DORMANT, HYPHA, NUTRIENT, BIOME, etc. Never genericize.
3. **Mycelium ≠ OpenRouter competitor** — Mycelium is the orchestration brain (which agent, which lifecycle state, which domain). OpenRouter is plumbing (which model, which provider, best price/latency).
4. **Build first, explain second** — every architecture decision gets working code or a real schema.
5. **Multi-model from day one** — every HYPHA can run a different model. Domain → model is config, not code.
6. **Cost-aware** — every NutrientPacket carries token + dollar accounting. Budgets enforced at the bus.
7. **Cache-first** — Redis-backed response cache; OpenRouter prompt cache for shared system prompts. Treat cache hit rate as a first-class metric.

---

## INTEGRATION SLOT — RESERVED

When you drop the new tech in, the integration shape will be:

- **Where it plugs in:** as a new BIOME, a new HYPHA type, a new NUTRIENT carrier, or a new layer below the BIOME BUS (e.g., transport, identity, storage)
- **Contract:** add to `NUTRIENTS.md` if it shapes data flow
- **State machine:** does it introduce a new lifecycle state or just extend transitions?
- **Cost model:** does it change the per-NUTRIENT economics?

Re-architect cleanly when the tech is named.

---
---

# Reconciliation Notes — 2026-05-05

> Notes appended during a working session with SPY. These are NOT pack changes — they reconcile this Architecture Pack with the **Temporal Context Framework v0.2** (`docs/temporal-context-framework.md`) and the **Operator HYPHA design** (TCF §D), and surface the open questions that need to land before any cultivation runs.

## A. What this pack gets right

- **Router Brain INSIDE the bus, not above it.** Preserves decentralization. Most "intelligent gateway" designs end up creating an implicit central node; putting routing inside each peer's BIOME BUS implementation keeps the topology honest. Important.
- **Mycelium ≠ OpenRouter competitor framing.** Clear separation of orchestration (Mycelium's moat) from inference plumbing (commoditized). Defensible thesis.
- **Per-NUTRIENT cost accounting.** Budget enforcement at the bus level is the only place it works — agent-level enforcement leaks because agents can't see cross-agent spend.
- **Cache hit rate as a first-class metric.** Cache hit rate is the canonical measure of whether prompt design is actually amortizing across calls. Treating it as a metric (not an afterthought) is correct.
- **Multi-model from day one.** Hard-coding a model into a HYPHA is the kind of decision that compounds invisibly into lock-in. Domain → model as config is the right primitive.

## B. Reconciliation with TCF v0.2

**The two specs are sibling concerns at the same architectural layer.** Both extend the BIOME BUS:

- **TCF** governs how NUTRIENTS *age and prioritize* for retrieval (TRS, decay profiles, memory tiers).
- **Router Brain** governs where NUTRIENTS *go for execution* (domain classification, model selection, cost gating).

A NUTRIENT flowing through the bus needs *both*: a TRS score (for retrieval prioritization) and a routing decision (for execution targeting). They are orthogonal but composed.

**Implication:** Freeze them together as one "Intelligent Bus" spec rather than serially. Specifically:

- Extend the NUTRIENT schema once with both sets of fields (TCF: `trs`, `base_weight`, `decay_profile`, `resolution_state`, `domain`, `hlc_timestamp`; Router Brain: `routing_decision`, `model_selected`, `cost_stamp`, `cache_status`).
- Extend BIOME BUS event types once with both sets (TCF: `RECALIBRATE`, `RESOLVE`, `SUPERSEDE`, `UPGRADE_PROFILE`; Router Brain: `ROUTE`, `FALLBACK`, `BUDGET_BLOCK`, `CACHE_HIT`).
- Extend HPP once (TCF: per-agent TRS distribution; Router Brain: per-agent cost + cache rate + model usage).

This unification prevents the "two contract freeze cycles for sibling concerns" problem and is consistent with the Mycelium philosophy of cellular execution (one freeze, one cultivation, one merge order).

**Proposal:** TCF v0.3 + Router Brain v0.1 unify as **Mycelium Intelligent Bus v2.0** (or equivalent versioning). Single contract freeze. Two parallel cultivation waves on top.

## C. Open questions raised by this pack

### C.1 Router Brain state distribution
"Router Brain runs inside the bus" — at every node? Replicated? Partitioned by topic? The Brain has state (cost ledger, model performance feedback, routing decisions) that needs sharing without violating decentralization. Options:
- **Per-node Brain, gossip ledger** — each node makes routing decisions locally; cost/performance state gossips between peers (eventually consistent). Clean decentralization, weaker global budget enforcement.
- **Per-node Brain, sharded ledger** — each node owns a slice of the cost ledger by topic/domain; queries hop. Stronger consistency, more complex.
- **Per-node Brain, CRDT ledger** — conflict-free replicated data type for shared state. Solves consistency with proven primitives, costs implementation complexity.

Worth picking before any code lands.

### C.2 Cost-budget enforcement vs HYPHA contract-freeze
If a HYPHA's contract specifies a model (or model class) and the Router Brain decides "too expensive, fallback to cheaper," is that a contract change or a routing decision? Two interpretations:
- **Contract specifies behavior, Brain specifies implementation** — model selection is implementation, fallback is fine, no freeze violation.
- **Contract specifies SLA, Brain must honor** — falling back changes output quality, which violates frozen contract on quality bound.

The right answer probably involves the contract specifying a *quality floor* (not a specific model), and the Brain falling back only within that floor. But that floor needs definition.

### C.3 The "reserved integration slot"
The pack leaves a slot held for tech SPY hasn't named yet. Until that's named, the pack's integration story is incomplete. Worth flagging — the slot's shape (new BIOME / new HYPHA type / new NUTRIENT carrier / new layer below the bus) materially changes the cost model, schema extensions, and lifecycle.

### C.4 LiveGrid as first production workload
LiveGrid is a sub-product of Bardot per the ecosystem inventory (target launch alongside the Miami venue, November 2026). Building LiveGrid on the Router Brain means **LiveGrid's launch depends on Router Brain shipping first**. That's a real schedule dependency. If Bardot's November target is hard, the bus extension work has a hard deadline upstream of it.

### C.5 Operator HYPHA vs LiveGrid as first production workload
Two candidates compete for "first cultivation on the Intelligent Bus":
- **Operator HYPHA** (TCF §D dogfood) — validates TCF in the most demanding scenario (the operator's own work life)
- **LiveGrid** (this pack's #3) — validates Router Brain + OpenRouter integration with real production traffic + real money in escrow

Both are correct first-workloads for their respective spec halves. The unified Intelligent Bus freeze allows both to cultivate in parallel post-freeze.

## D. Using the Mycelium CLI to build this

This pack is a perfect cultivation target for the framework's own CLI. The pattern:

1. **Brief.** This file (the pack + reconciliation notes) IS the brief. Optionally enriched via `mycelium brief` for any gaps.
2. **Plant.** `mycelium plant` against this brief generates the cultivation scaffold — `mycelium.yaml`, `hyphae/HYPHA-*.md`, `NUTRIENTS.md` skeleton, `CELLULAR-MAP.md`.
3. **Design contracts.** Hand-edit:
   - `NUTRIENTS.md` — full unified schema (TCF fields + Router Brain fields), bus event type registry, cost stamp shape, TRS shape, HLC encoding.
   - `hyphae/HYPHA-*.md` — one per biome (bus-router-impl, openrouter-bridge-impl, livegrid-schema, livegrid-escrow, stress-harness, cost-ledger, cache-layer, cellular-map-doc, roadmap-doc, integration-slot-resolver).
   - `mycelium.yaml` — organism contract.
4. **FREEZE.** `mycelium contracts freeze` once `NUTRIENTS.md` is fully specified. Non-negotiable per global guardrail.
5. **Cultivate.** `mycelium cultivate -c 30` runs all leaves in parallel against frozen contracts. Each leaf reads `NUTRIENTS.md` + its own HYPHA, writes code in scope, ends with `FRUIT_READY`.
6. **Harvest.** `mycelium harvest -t 0.8`. Iterate `--only-biome <name>` for any failed subtree.
7. **Iterate.** Wave 2 after wave 1 lands.

This is the dogfood loop: **Mycelium builds Mycelium extensions.** It also stress-tests the framework — running the Router Brain build on Mycelium itself surfaces gaps in the framework before they bite production cultivations.

## E. Sequencing recommendation

Three options, in order of decreasing Marathoners-discipline / increasing Bardot-deadline-pressure:

1. **Marathoners default:** TCF v0.3 freeze (1 wk) → Intelligent Bus v2.0 freeze (1 wk) → Operator HYPHA cultivation (1-2 wk) → Router Brain cultivation (2-3 wk) → LiveGrid cultivation (2-3 wk) → stress test (1 wk) → 400→10K ramp (2-4 wk). **2-3 months sequential.**

2. **Parallel-wave middle ground:** Combined Intelligent Bus v2.0 freeze (2 wks of design + spec) → parallel cultivation: Operator HYPHA + Router Brain extension (3-4 wks together) → LiveGrid + stress test cultivation (3-4 wks). **6-8 weeks total.** Trades freeze-cycle complexity for parallelism.

3. **Sprint mode (Bardot-deadline-driven):** Bus v2.0 spec freeze in 1 week (compressed), Router Brain + LiveGrid as the priority cultivations (skip Operator HYPHA for now, defer to post-launch). **4-6 weeks if everything lands clean.** Real risk of sloppy contract design under pressure.

The right pick depends on:
- How hard the Bardot November target actually is.
- Whether SPY values Operator HYPHA validation enough to fund it concurrently with LiveGrid.
- Available focus-time per week.

## F. Status / next move

- **This pack:** stored at `docs/bus-router-livegrid-architecture-pack.md`. Not committed yet (sits alongside Session 6 CLAUDE.md/HANDOFF.md + TCF doc as uncommitted additions in legendary-funicular).
- **Next deliverable to draft:** Mycelium Intelligent Bus v2.0 spec — unifies TCF v0.3 candidate + Router Brain v0.1 from this pack into one contract surface.
- **Decision pending:** Sequencing (E.1, E.2, or E.3) and the "reserved integration slot" tech.
- **Friction-list memory:** the daily aggregator idea (`project_daily_aggregator_idea.md`) is the predecessor concept; promote into Operator HYPHA design when v2.0 freeze lands.
