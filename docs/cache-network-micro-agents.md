# Cache Network + Micro-Agents — Design Note

**Mycelium Framework · Design artifact (not a build plan)**
VibeSpace LLC / mfautomation · 2026-05-16
Sibling to: `bus-router-livegrid-architecture-pack.md`, `temporal-context-framework.md`, `mycelium-router-30day-plan.md`

---

## 1. Purpose

Name a model the framework already half-implies but hasn't formalized: **leaves fan out into micro-agents; micro-agents intermediate through a shared cache network; the cache absorbs the read-path that would otherwise become database work.** This doc fits that model to existing architecture, reconciles it with TCF and the Router, and surfaces the questions that must close before any of it freezes into a contract. It does not propose code, file paths inside `cli/src/`, or NUTRIENTS schema text. Those follow the freeze; this doc precedes it.

The one-paragraph thesis, expanded: a HYPHA-scoped leaf is too coarse to be the unit of LLM/API spend. Inside a single leaf there are 2–4 natural sub-jobs (per-tester, per-file, per-route, per-fixture) that today either serialize inside one Claude session or get hand-rolled as fan-out inside leaf code. Promote those sub-jobs to first-class **micros**, give them a shared **cache network** scoped to the cultivation, and most of what looks like "we need a database for intermediate state" disappears — because the cache is the read-side, and the only writes worth persisting are the artifacts that already get committed by the orchestrator.

## 2. The Micro-Agent Unit

A **micro** is a sub-session spawned by a leaf to do one bounded, side-effect-light job. It is to a leaf what a leaf is to a cultivation: smaller, more numerous, shorter-lived.

| Property | Leaf (today) | Micro (proposed) |
|---|---|---|
| Lifetime | Minutes to hours | Seconds to minutes |
| Scope | One HYPHA biome | One sub-task inside a leaf |
| Spawns | By orchestrator from HYPHA list | By a leaf, dynamically, from its own scope |
| Commits | Yes, one auto-commit per leaf | No — micros return data to the parent leaf |
| Tier | Mostly Opus | Mixed: cheap (Haiku) by default, full (Opus) when promoted |
| State | Written to `sporenet/state.json` | Held in the cache network; not in `state.json` |

**Why 2–4 per leaf and not N.** Two is the natural minimum where parallelism beats serialization; four is the natural maximum where prompt-cache amortization still works (shared system prompt across siblings) and where a parent leaf can reason about its children without losing track. Larger fan-outs should be a *new leaf* with its own contract, not a micro burst.

**Cheap-vs-full split.** A micro spawns at the cheap tier by default. It is **promoted** to full only on an explicit signal — confidence below a floor, fixture mismatch, contract check fail. This is the cost-saving story the v9 visualization already encodes (violet = cheap / cyan = full). The split is not aesthetic; it's the routing decision in miniature, scoped to a sub-task instead of a leaf.

**Lifecycle.** SPORE (parent issues sub-prompt) → GERMINATING (cache lookup) → GROWING (LLM call if miss) → FRUITING (return value to parent) → DORMANT (cache entry persists, micro itself is gone). The micro does not get its own SPORULATION or PRUNING — it inherits the parent leaf's lifecycle events.

**Visibility on the BIOME BUS.** Micros do not publish their own per-call events. They are sidecar to their parent leaf. The bus sees `leaf_fruited` once per leaf, not 2–4 `micro_fruited`. Cache events are different (§5).

## 3. The Cache Network

The cache network is what makes micros economical. Without it, fanning out 2–4× per leaf 3–10× the LLM spend with no compensating reuse.

**What gets cached.** Three kinds, in order of impact:

1. **Call-response pairs.** `sha256(model + canonical(messages))` → response. This is the OpenRouter L1 pattern from `mycelium-router-30day-plan.md` §Phase 3, generalized: not just OpenRouter-bridge requests, *all* model calls including the cultivate.ts SDK path.
2. **Semantic embeddings of NUTRIENT chunks.** Reused across micros that read overlapping context (e.g. all testers in one biome read the same `NUTRIENTS.md` section). Pays off most under tester-pool style fan-out, exactly the audit-run case.
3. **Rendered artifacts the parent leaf composes from micro outputs.** Memoized so a heal-loop replay doesn't redo the synthesis step when only one sub-input changed.

**Topology.** Three plausible scopes; we have to pick:

- **Per-leaf.** Cache dies with the leaf. Strongest isolation; zero cross-leaf reuse. Defeats most of the point if multiple leaves share testers or stubs.
- **Per-cultivation.** Cache lives for the cultivation run; shared across all leaves and micros under one `mycelium.yaml`. **This is the working default.** It maps cleanly to existing event-log scoping (`.mycelium/events/<run_id>.jsonl`), and the cache hit rate becomes a first-class per-cultivation metric.
- **Cross-cultivation.** Long-lived, keyed by NUTRIENT hash. Theoretically the highest hit rate, but invalidation becomes a contract problem — what does cache reuse mean when contracts change between cultivations? Punt.

**Eviction.** TRS-weighted, not LRU. A high-TRS NUTRIENT's cache entries stay hot regardless of access recency; a low-TRS NUTRIENT's entries are evicted first under pressure. This is the natural place TCF lands inside the cache layer.

**Durability.** Three tiers, parallel to TCF's HOT/WARM/COLD but *not the same data*:

- **In-process (HOT-equivalent).** Cheap. Lost on cultivate exit. Holds the active call-response set.
- **Disk-backed under `.mycelium/cache/<run_id>/` (WARM-equivalent).** Survives a cultivate crash. Reused on `--resume`. Cleared at cultivation harvest by default.
- **Network/Redis (COLD-equivalent).** The Cee-Ro pack's L2. **Out of scope for v1.** Named so the integration shape is known.

## 4. The "Less DB Development" Payoff — Honest Argument

This is the part that has to be argued carefully, because the claim looks like sleight-of-hand if stated loosely.

**What the cache replaces.** Cache absorbs the **READ patterns** that would otherwise drive a database:
- "What did tester X return for fixture Y five minutes ago in this run?"
- "What's the embedding for this NUTRIENT chunk?"
- "What did the cheap tier say about this sub-prompt before we escalated?"

In a databased world, each of those is a SELECT against a table the leaf author had to design, migrate, and CRUD. In a cache-network world, they are key-value lookups against content-addressed keys. **The schema is the hash function.** No DDL, no migration, no ORM, no CRUD endpoints.

**What the cache does NOT replace.** Durable cross-cultivation writes still need a store:
- Final cultivation artifacts (code, docs) → git, already handled.
- Audit findings, harvest results, fleet aggregates → these are NUTRIENT outputs and live wherever NUTRIENTS already live (file system, eventually fleet DB per `cli/src/lib/fleet/`).
- Cost ledgers, routing decisions, eval results → telemetry sinks (JSONL today, possibly DuckDB/fleet later).

**The honest summary.** The cache absorbs *intermediate, regenerable, scoped-to-a-run* read traffic — which is the bulk of what naive multi-agent systems push into Postgres because they don't have a better primitive. It does not absorb anything you'd want to query a month later from outside the cultivation. The "less DB development" claim is real for the inner loop; it is not a claim that Mycelium never needs durable storage.

A sharper restatement: **micros plus cache network move the inner loop from a write-heavy graph to a read-heavy memoization tree.** Memoization trees don't need schemas.

## 5. Fit to Existing Architecture

Four explicit reconciliations.

### 5.1 The `cache-layer` biome (architecture pack line 154)

The Cee-Ro pack lists `cache-layer` as a planned biome alongside `cost-ledger` and `cellular-map-doc`. Until now it had no concrete role — it read as "we'll obviously need a cache somewhere." This doc gives it one: the cache-layer biome owns the cache network, exposes the cache as a NUTRIENT-flow primitive on the BIOME BUS, and is the substrate every other biome's micros call into.

### 5.2 TCF tiers

The cache network is **not identical to TCF's HOT/WARM/COLD tiers, but composes with them.** TCF tiers govern *retrieval priority over NUTRIENT memory*; the cache network governs *memoization of intermediate LLM/API calls*. They share the durability shape (in-process / disk / network) but the entries are different objects:

- TCF HOT entry: a high-TRS nutrient the agent reads to reason.
- Cache HOT entry: a `(model, messages) → response` pair the micro hit a moment ago.

The natural composition: the cache's eviction policy *reads* TRS (so high-TRS NUTRIENT content gets sticky cache entries), but the cache does not *write* TRS (cache hits don't bump TRS — that's a category error).

### 5.3 Router

The Router decides *which model* a call goes to. The cache decides *whether the call happens at all*. Order matters: **cache lookup precedes Router classification.** A cache hit short-circuits the whole routing decision. This is a small but load-bearing point — if the Router runs first and we cache by `(model, messages)`, a tier-promotion changes the key and we miss; if the cache runs first and is content-addressed at the prompt level, the promotion only happens on miss. Cheaper.

Cache-hit calls still need to emit a `routing_decision` event for cost accounting (with `model_selected: <hit>`, `cost: 0`, `cache_status: HIT`) — otherwise the per-domain cost picture lies. This is the cleanest place to extend the existing `routing_decision` payload in the 30-day plan.

### 5.4 BIOME BUS visibility

Cache traffic is **sidecar to the bus, not on it.** A leaf's individual micro cache lookups should not produce N bus events per leaf — that's noise on a substrate built for cross-biome coordination. Instead, the bus sees:

- One aggregate `cache_pulse` per leaf at FRUIT time: hit count, miss count, bytes saved, dollars saved.
- One `CACHE_HIT` event per *cultivation* per *unique key* the first time it lands, for fleet-level visibility.

Everything else is in the local JSONL only, retrievable by `mycelium router report` or its cache-aware cousin.

## 6. How v9.2 Visualizes It Today

The Starlink-merged hybrid visualization at `.superpowers/brainstorm/4035-1778891130/content/hybrid-v9-starlink-merged.html` already encodes most of this model in mock form:

- **Micros are drawn** as 2–4 small spheres orbiting each leaf, tethered by thin lines (line 1275 onward). Color split: `0xB7A8E8` violet for cheap/Haiku, `0x7AE5FF` cyan for full/Opus. Bias is 55% cheap, matching the cost story.
- **Focus-conditional visibility** (line 2497 onward): micros only render when their parent agent is focused AND the leaf is active or done. This is correct — at fleet zoom they would be noise; at parent focus they tell the cost story.
- **The cache hit metric is hardcoded** at line 3026 as `'14% · Cache hit · context reuse'`. This is the only spot in the dashboard that mentions cache today, and the value is a placeholder.

What's mock vs real: the orbiting micros and the cheap/full color split are *visualization-only* — no runtime equivalent exists. The 14% cache hit is *fully hardcoded*. Promoting either to real means wiring `cache_pulse` events into the dashboard's data path, and wiring micro fan-out into the leaf execution path. Neither is done.

The v9.3 prototype currently being built (see §10) replaces the hardcoded 14% with a live, derived value driven by cache events from the dashboard's mock event stream. That prototype is the visual scaffold this doc backstops conceptually.

## 7. Frozen-Vocab Additions

Mycelium's frozen vocab (HYPHA, NUTRIENTS, BIOME BUS, FRUITING BODY, SPORULATION, PRUNING, HPP, NFA) is conservative for a reason: every term should earn its place by naming something the existing vocab can't. Three candidates here.

| Term | What it names | Why existing vocab doesn't cover | Verdict |
|---|---|---|---|
| **MICRO** | A sub-session spawned by a leaf | HYPHA is the agent definition; leaf is the execution; "micro" names the *sub-execution* with no analogue today | **Propose.** Lowercase in prose, uppercase in spec contexts, same convention as HYPHA. |
| **CACHE_NET** | The cultivation-scoped cache network as a singular addressable substrate | "Cache" is generic; "CACHE_NET" names the specific Mycelium primitive that mediates micros | **Propose.** Pairs with BIOME_BUS. |
| **HIT_HALO** | The visual + telemetric pulse a cache hit emits | Cosmetic; "cache hit" suffices | **Reject.** Dashboard concern, not vocab. |

If MICRO and CACHE_NET are accepted, lifecycle states do not need new entries — micros inherit the existing six-state cycle, and CACHE_NET is a substrate, not a stateful entity in the lifecycle sense.

## 8. Open Questions

1. **Scope: per-leaf, per-cultivation, or cross-cultivation cache?** §3 leans per-cultivation as the working default. Cross-cultivation reuse has the highest potential hit rate but tangles invalidation with contract-freeze; needs a deliberate answer before it's plumbed.
2. **Durability under crash and `--resume`.** Disk-backed cache survives crash, but should `mycelium cultivate --resume` *use* it or invalidate it? Reusing speeds recovery; invalidating prevents stale-cache bugs from masking real regressions. The answer probably depends on whether the crash came before or after contract-freeze — that's a routing decision the resume path doesn't currently make.
3. **Cost accounting on cache hits.** Does a cache-hit call count $0 toward leaf budget (true ledger value) or count the *would-have-been* cost (so the budget-savings story shows in roll-ups)? Current Router plan implies $0. Fleet-level reporting probably wants both: actual + saved.
4. **Invalidation triggers.** When does a cache entry go stale? Candidates: heal-loop iteration boundary (clear sub-tree the iteration touched), contract-freeze re-execution (clear everything keyed against the previous freeze), explicit `mycelium cache prune`, never (let TRS eviction handle it). Likely a combination, but the default needs to be picked.
5. **Cross-agent micro reuse vs leakage.** If biome A's micro and biome B's micro both call the same sub-prompt with the same NUTRIENT chunk, should they share a cache entry? Reuse maximizes hit rate; leakage risks one biome's behavior subtly depending on another biome's prompt history. Cleanest answer: yes, share — keys are content-addressed and biomes should be deterministic given identical inputs. But this needs to survive a hostile-prompt audit before it's the contract.
6. **Promotion criteria for cheap → full.** A micro starts cheap, gets promoted to full on some signal. What signals? Self-reported confidence? Contract validator fail? Parent leaf override? All three? The promotion policy is where the cost story actually lives and is currently under-specified.
7. **Where the cache lives during stress test (400 → 10K agents).** In-process is fine at 10 leaves. At 10K agents across many nodes, the Cee-Ro pack's Redis L2 is implied but unbuilt. Question: is the v1 cache architecture forward-compatible to that L2, or does the v1 design quietly bake in single-process assumptions that have to be undone later?

## 9. Build Sequencing (Non-Binding Sketch)

Not a plan. A sketch of the prerequisite chain so the next person to write the plan doesn't sequence it wrong.

1. **Router phase 1 lands first.** The cache layer needs the routing decision shape stable to emit cache events keyed in a way the Router report can join against. If cache ships first, the join key is invented twice and one of the two gets rewritten.
2. **Per-cultivation cache, in-process + disk, no L2.** The simplest version that proves the model: content-addressed `(model, messages)` keys, JSON-on-disk for survival, eviction by simple size cap *or* TRS once TCF lands — whichever comes first dictates the policy.
3. **MICRO unit lands inside a single biome first, not framework-wide.** Pick the audit-run testers-pool (already has natural fan-out, already has the `runWithConcurrency` primitive lifted) as the proof-of-concept biome. Don't expose MICRO as a framework primitive until the audit-run case has run at least one real cultivation.
4. **Cache events sidecar, BIOME BUS surfaces aggregate only.** Per §5.4. Per-call cache events go to JSONL; bus sees one `cache_pulse` per leaf at FRUIT and one `CACHE_HIT` per unique key per cultivation.
5. **Dashboard wiring last.** Once cache events are real, the v9.3 prototype's derived hit rate becomes load-bearing instead of mock. v9.2's hardcoded 14% goes away.
6. **TCF integration is a separate cultivation.** Cache works without TRS-weighted eviction; TRS eviction becomes interesting only after TCF v0.3 freezes. Do not block cache v1 on TCF.

Prerequisites in one line: Router phase 1 → cache v1 (audit-run only) → MICRO promoted to framework primitive → dashboard wiring → TCF integration.

## 10. Pointer to v9.3 Prototype

A sibling agent is currently iterating the visualization at:

```
.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.3-cache-network.html
```

That prototype:
- Replaces v9.2's hardcoded `14% · Cache hit` with a live derived value.
- Adds visible cache traffic between micros (likely as a faint inter-micro filament or pulse, distinct from the bus arcs).
- Treats the cache network as a first-class layer in the depth stack rather than a metric in a card.

The conceptual side of that work is what this doc backstops. Read in pairs: the visual prototype shows what the cache network *looks like* once it's real; this doc says what it *is* and what has to be true for it to be real.

Cross-reference both directions: when the v9.3 prototype mutates a visualization assumption (e.g. moves cache from per-leaf to per-cultivation visual scope), this doc should track. When this doc closes an open question (e.g. picks per-cultivation scope), the prototype should reflect it.

---

*This is a design note, not a spec. Promote to spec only after open questions §8.1–§8.7 close. Until then, treat cited details (e.g. "55% cheap bias", "4-max micros per leaf") as working assumptions, not contracts.*
