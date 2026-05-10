# Temporal Context Framework

**Mycelium Agent Network · Engineering Spec**
VibeSpace LLC / mfautomation · v0.2 · May 2026

---

## 1. Problem

LLMs treat time as metadata. A timestamp is appended to context the way a filename is appended to a document — present, but not load-bearing. A note from three years ago retrieves with the same weight as a message from this morning.

This is why LLMs feel timeless in the wrong way. Not wise — amnesiac.

A useful agent should distinguish stale from live, resolved from open, foundational from urgent. Recency should bend confidence, relevance, and urgency. Temporal awareness is not a feature layered on top of context — it is what makes context usable at all.

## 2. Core Insight

**Time is not metadata. Time is context weight.**

How long ago something happened, in what domain, with what resolution state, should directly govern how much it shapes current reasoning.

## 3. Temporal Relevance Score (TRS)

Every NUTRIENT in the network carries a `TRS ∈ [0, 1]`:

```
TRS = base_weight × decay_fn(Δt) × resolution_multiplier × domain_weight
```

| Term | Type | Range | Source |
|------|------|-------|--------|
| `base_weight` | float | 0.0 – 1.0 | Assigned at NUTRIENT creation (§5) |
| `decay_fn(Δt)` | function | → [0, 1] | Selected by decay profile (§4) |
| `resolution_multiplier` | discrete | {1.0, 0.1, 0.0} | State of underlying claim (§3.1) |
| `domain_weight` | float | 0.0 – 1.5 | Domain config (§3.2) |

`Δt` is computed using **Hybrid Logical Clocks** (§6), not wall-clock time. This is required for causal consistency across decentralized nodes.

### 3.1 Resolution Multiplier

Resolution is a discrete state transition, so the multiplier is discrete by design — not a smooth function:

- **1.0** — Active. No superseding update.
- **0.1** — Resolved. Claim was answered/closed; preserved for audit but suppressed in retrieval.
- **0.0** — Superseded. A newer NUTRIENT explicitly invalidates this one.

`resolution_multiplier = 0.0` does not delete the nutrient; it floors the score so the nutrient sinks to COLD archive.

### 3.2 Domain Weight

Domain config controls how aggressively decay applies. Initial values:

| Domain | Weight | Rationale |
|--------|--------|-----------|
| `financial-realtime` | 1.5 | Stale prices/balances are dangerous |
| `ops-incident` | 1.3 | Alert relevance collapses fast |
| `project-state` | 1.0 | Default |
| `design-decision` | 0.7 | Architectural calls age slowly |
| `historical-record` | 0.4 | Preserve longer |
| `contract-frozen` | n/a | Skip decay entirely (FROZEN profile, §4) |

Domain weights are not retroactive. Changing config does not rewrite existing TRS values; new weights apply to new nutrients only.

## 4. Decay Profiles

Four profiles, selected at NUTRIENT creation by the source HYPHA:

| Profile | Function | Default Half-life | Use |
|---------|----------|-------------------|-----|
| `EXPONENTIAL` | `e^(-λt)` | 2–6 hours | Deploy alerts, ephemeral chat, urgent tasks |
| `LINEAR` | `max(0, 1 - t/T)` | 7–14 days | Project state, ongoing decisions |
| `LOGARITHMIC` | `1 / (1 + log(1+t))` | 3–6 months | Architecture, foundational specs |
| `FROZEN` | `1.0` | ∞ | Contracts, locked specs, NUTRIENTS.md |

Half-lives are domain-tunable. Constants live in `mycelium.config.temporal`.

Source HYPHA can swap profile post-hoc via `UPGRADE_PROFILE` event on the BIOME BUS — useful when something originally tagged as ephemeral turns out to be load-bearing.

## 5. base_weight Assignment

Three strategies, all supported with per-domain override:

1. **Rule-based** — static map `{event_type → weight}`. Cheap, deterministic, no LLM dependency. Default for high-volume domains (HPP heartbeats, structured log events).
2. **LLM-scored at ingest** — source HYPHA calls a small model via OpenRouter to score importance at creation. Higher quality, ~50ms latency cost. Default for user-facing context and decision artifacts.
3. **Learned** — regression-update base_weights from outcomes: which nutrients were retrieved into tasks that completed successfully? Requires task outcome signal. Roadmap.

`base_weight` is set once and frozen on the nutrient. Re-scoring requires an explicit `RECALIBRATE` event on the BIOME BUS.

## 6. Time in a Decentralized Network

A flat claim that "all nodes share the same temporal reality" is wrong in a P2P system. NTP drift alone breaks ordering across distant nodes.

Mycelium uses **Hybrid Logical Clocks (HLC)** for all nutrient timestamps:

```
HLC = (physical_time_ms, logical_counter)
```

- Monotonic per node.
- Causally consistent across nodes (preserves happens-before).
- Bounded divergence from wall-clock (typically < 1s under normal NTP).
- Compares cleanly: `(p1, l1) < (p2, l2)` iff `p1 < p2 OR (p1 == p2 AND l1 < l2)`.

`Δt` for TRS decay uses the HLC physical component. Logical counter handles tie-breaks for nutrients created in the same millisecond on different nodes.

Implementation: every BIOME BUS message updates the receiving node's HLC per standard HLC merge rules. No central time authority required.

## 7. Memory Tiers

| Tier | TRS Range | Behavior | Storage |
|------|-----------|----------|---------|
| HOT | > 0.7 | Always in agent working window | In-memory, indexed |
| WARM | 0.3 – 0.7 | Retrieved on request or on HOT miss | Local cache (Redis / SQLite) |
| COLD | < 0.3 | Searchable via explicit temporal query or pattern match | Object storage, vector-indexed |

Tier transitions happen automatically and continuously as TRS drifts. Tier transition is **not** PRUNING:

| Concept | Applies To | Effect |
|---------|-----------|--------|
| PRUNING | HYPHA (agent) | Agent terminated, removed from network |
| Tier transition | NUTRIENT (data) | Reclassified by TRS, never deleted |

This distinction was conflated in v0.1; resolved here.

## 8. Retrieval

When a HYPHA requests context:

1. BIOME BUS receives request with topic + domain hints.
2. Query HOT tier; return all matches.
3. If insufficient, fall through to WARM.
4. COLD only on explicit temporal query (`since:`, `before:`, `pattern:`) or on HOT+WARM miss.
5. Results sorted by TRS descending.
6. Top-N returned to requesting HYPHA.

Agent does not reason about staleness. The TRS sort already encoded it.

## 9. Failure Modes

| Failure | Mitigation |
|---------|-----------|
| Clock skew across nodes | HLC bounds divergence; alert on > 5s drift |
| Adversarial high `base_weight` injection | Source HYPHA signs nutrients; suspicious sources rate-limited |
| TRS miscalibration (false-stale) | `RECALIBRATE` event; user override flag pins TRS = 1.0 |
| Cold archive growth unbounded | Time-bucketed compaction; TTL on `resolution_multiplier == 0.0` after N days |
| Domain weight drift over time | Config versioning; new weights apply only to new nutrients |
| Decay profile chosen wrong at creation | `UPGRADE_PROFILE` event on BIOME BUS |
| Network partition | HLC tolerates partition; on heal, normal merge resolves order |

## 10. Integration Points

- **NUTRIENT schema** — extend with `trs`, `base_weight`, `decay_profile`, `resolution_state`, `domain`, `hlc_timestamp` fields.
- **BIOME BUS** — add `RECALIBRATE`, `RESOLVE`, `SUPERSEDE`, `UPGRADE_PROFILE` event types.
- **HPP** — health pulses include per-agent TRS distribution stats for observability.
- **NFA** — Nutrient Flow Algorithm consumes TRS as the primary priority signal.

## 11. Open Questions

- **Recalibration cadence** — pull-based on retrieval, or scheduled push?
- **Graph effects** — should a NUTRIENT's TRS lift when it's referenced by a high-TRS nutrient? Likely yes; spec TBD.
- **User-facing TRS surfacing** — when an agent makes a decision, expose the TRS basis for auditability?
- **Cross-domain collisions** — same topic, two domains, different weights — which wins, or do they coexist?
- **Cold-start** — when a fresh HYPHA spawns into an active biome, how does it bootstrap a working TRS view without paging the entire HOT tier?

## 12. Why This Matters

The unsolved problem in agent systems is not reasoning. It is context.

An agent with average reasoning and perfect context awareness outperforms a stronger reasoner operating on flat, undifferentiated context. Temporal weight is the missing dimension. With it: retrieval becomes self-organizing, resolved issues stop resurfacing, multi-agent coordination converges on shared temporal ground, and trust in agent output becomes auditable.

This is the layer Mycelium adds.

---

*v0.2 supersedes v0.1 (April 30, 2026). Repo: `docs/temporal-context-framework.md`.*

---
---

# Review & Extensions — 2026-05-05

> Notes appended during a working session with SPY. **NOT** v0.2 spec changes — these are discussion artifacts, candidate answers to open questions, and design sketches for the first practical cultivation built on TCF. Promote into v0.3 only after explicit review.

## A. Validation of strong design choices

The spec gets several things right that are easy to get wrong:

- **HLC over wall-clock.** Most agent frameworks hand-wave time and silently rely on NTP. TCF doesn't. This is correct for a decentralized P2P system.
- **Discrete `resolution_multiplier` over a smooth function.** Resolution is a state transition, not a continuous variable; modeling it as discrete prevents specious "partial resolution" reasoning.
- **Domain weight as an asymmetry coefficient.** `financial-realtime: 1.5` and `historical-record: 0.4` capture real-world urgency that flat decay can't. The acknowledgment that domain weights are non-retroactive is the correct compromise between consistency and operability.
- **PRUNING vs tier-transition disambiguation in §7.** Conflating data lifecycle with agent lifecycle is the kind of bug that compounds invisibly. The v0.1 → v0.2 fix is the most important correction in this spec.
- **§12 framing.** "An agent with average reasoning and perfect context awareness outperforms a stronger reasoner on flat context" is the actual unsolved problem in the field. Worth saying loudly. This generalizes beyond Mycelium — it addresses a generic LLM amnesiac-timelessness pathology — and the spec should call that out so the framework's contribution is unambiguous.

## B. Candidate answers to §11 open questions

### B.1 Recalibration cadence (Q11.1)
**Hybrid.** Scheduled push for `LOGARITHMIC` and `FROZEN` profiles (cheap, infrequent — these decay slowly enough that periodic recompute is fine). Pull-on-retrieval for `EXPONENTIAL` and `LINEAR` profiles (avoid spending compute on fast-decaying nutrients that may never be retrieved). This pattern keeps recompute cost proportional to actual retrieval pressure.

### B.2 Graph effects (Q11.2)
**Yes, propagate — with damping.** A NUTRIENT's TRS should lift when referenced by a high-TRS nutrient, but with a damping factor (start at 0.5×) to prevent feedback loops. Without damping, an old high-TRS nutrient referenced by a stale one creates a self-reinforcing zombie. Damping factor itself can be domain-tuned.

### B.3 User-facing TRS surfacing (Q11.3)
**Yes, on demand.** When an agent makes a decision, expose the TRS-sorted nutrient set on user query (`why?` or `audit:`). Don't surface by default — clutters output. But the audit path must exist for trust calibration.

### B.4 Cross-domain collisions (Q11.4)
**Coexist; let TRS resolve.** Same topic in two domains is two distinct nutrients; let their respective TRS values determine which surfaces in retrieval. Do not collapse. If a domain consistently dominates retrieval inappropriately, that's a domain weight tuning problem, not a collision problem.

### B.5 Cold-start (Q11.5)
**Context boot package on SPORE.** A fresh HYPHA spawning into an active biome receives the top-K HOT nutrients in its declared domain as part of its initial NUTRIENT envelope. Bounded by HYPHA's stated context budget. Prevents a thundering-herd query against the HOT tier and gives the new agent a usable starting view immediately.

## C. Additional considerations not in v0.2

### C.1 base_weight gaming (new failure mode)
If `base_weight` is LLM-scored at ingest (§5 strategy 2), the LLM scorer is an attack surface. Nutrient text could be crafted to inflate its own importance ("CRITICAL: this is the most important note"). Mitigations:
- Separate nutrient *content* from the *scoring prompt* (don't pass raw nutrient text to scorer; pass a structured representation).
- Sign source HYPHA identity; suspicious sources rate-limited (already in §9 for `base_weight` injection generally — formalize for the LLM-scored variant specifically).
- Cap `base_weight` ceiling per-source as a hardness rule.

### C.2 Tier sizing (no current spec)
"Always in agent working window" is bounded by context window in practice. Spec needs:
- Soft cap on HOT tier size with eviction-by-TRS-floor.
- Alert when eviction churn rises above threshold (signals miscalibration — domain weights tuned too aggressive, or `base_weight` distribution skewed).

### C.3 COLD retrieval — both temporal AND semantic
§7 says "vector-indexed" but §8 retrieval doesn't mention semantic search. Both should be first-class:
- Temporal: `since:`, `before:`, `pattern:` queries.
- Semantic: vector-similarity over embedded nutrient content.
- Combined: temporal-bounded semantic queries (`semantic:X since:30d`).

### C.4 Causal vs temporal clarity
HLC gives causal ordering, not temporal-recency-in-the-wall-clock-sense. The spec is correct that decay uses the physical component, but worth stating explicitly in §6 that:
- Causal ordering: HLC tuple comparison (used for happens-before relations).
- Temporal decay: HLC physical component only (used for `Δt` in TRS).
These are different operations on the same timestamp, and confusing them produces subtle bugs.

---

# Operator Agent — First Practical Cultivation Built on TCF

> SPY's intent (2026-05-05): an agent that runs as the operator, organizing all threads during the work week — KPIs, deliverables, brainstorms, friction, "everything in between."

In Mycelium terms: a **persistent operator HYPHA** scoped above any single product. Its biome is the work week itself.

## D.1 Scope

Cross-product daily/weekly aggregation, KPI tracking, deliverable status surfacing, brainstorm capture, friction logging. Operates above any individual product biome.

## D.2 Inputs (NUTRIENTS the operator HYPHA consumes)

| Source | Format | Decay profile | base_weight default |
|---|---|---|---|
| `git log` per repo (`~/mfautomation/repos/*`) | Commit objects | LINEAR (7d) | Rule-based by `[TAG]` prefix |
| HANDOFF.md updates | Reverse-chron entries | LINEAR (14d) | LLM-scored at ingest |
| Calendar events (if wired) | Event objects | EXPONENTIAL (until end-of-day), then LINEAR (7d) | Rule-based |
| Email/Slack threads (if wired) | Thread snapshots | EXPONENTIAL (4h) | LLM-scored |
| Claude Code session transcripts | `.jsonl` summaries | LINEAR (14d) | LLM-scored at ingest |
| Manual brainstorm captures | Free text | LOGARITHMIC (3mo) | LLM-scored |
| Friction items | Structured log entries | LINEAR (until reviewed) | Rule-based, capped |

## D.3 Outputs (FRUITING BODIES it produces)

| Output | Profile | Audience | Trigger |
|---|---|---|---|
| Daily digest | LINEAR (7d half-life) | SPY (operator) | EOD scheduled |
| Weekly report | LOGARITHMIC (3mo) | SPY + business partner | Weekly scheduled |
| Live deliverable tracker | FROZEN until shipped → `resolution_multiplier=0.1` post-ship | SPY | Continuous |
| Friction log | EXPONENTIAL until reviewed → promoted-or-pruned | SPY | Continuous |
| KPI roll-up | LINEAR (per-week) | SPY | Weekly scheduled |

## D.4 BIOME BUS subscriptions

The operator HYPHA subscribes to:
- `git.commit.*` (filtered by stream tag — BLM/, VC/, DD/, BD/, TSJ/, TA/, CS/, AN/, MYC/)
- `handoff.update.*`
- `calendar.event.*` (if wired)
- `friction.captured`
- `decision.made`

It publishes:
- `digest.daily.fruited`
- `report.weekly.fruited`
- `deliverable.statechange`

## D.5 TCF integration

The operator HYPHA is the canonical dogfood case for TCF:
- Every input becomes a nutrient with appropriate decay profile.
- Outputs are themselves high-`base_weight` nutrients with declared profile per output type.
- Operator queries (e.g., *"What needed my attention today?"*) become TRS-sorted retrievals against the operator's own biome.
- Tier transitions on input nutrients should match the natural review cadence (commits drop to WARM after a week; brainstorms stay HOT for months).

This validates TCF in the most demanding scenario possible — the operator's own work life.

## D.6 Why this is the right first cultivation post-Session-8

1. **Dogfood validation.** No better way to validate TCF than running the operator's own work organization on it.
2. **Closes the operator-wide memory gap** identified earlier in the kickoff (project-scoped memory doesn't follow SPY across products; operator HYPHA outputs do).
3. **Generates STREAMS.md-style organism-wide visibility** the global CLAUDE.md has hinted at since v1 but never had a producer for.
4. **Forces the open TCF questions to ground.** Building the operator HYPHA will force decisions on B.1–B.5 that pure spec work won't.

## D.7 Build sequence (post-Session-8)

1. **TCF v0.3 freeze.** Promote B.1–B.5 candidate answers + C.1–C.4 additions into v0.3 spec. Freeze contracts.
2. **Operator HYPHA cultivation cycle 1.** Define HYPHAs for git-scraper, HANDOFF-reader, brainstorm-extractor, summary-writer, dispatch. Freeze contracts (output schema, input sources, BIOME BUS topics). Cultivate. Harvest at 0.8 threshold.
3. **Source integration cycle.** One cultivation per data source (calendar, Slack, email) once basic operator HYPHA is FRUITING.
4. **Friction validation cycle.** Run operator HYPHA against SPY's actual workweek for 2 weeks. Capture what's working / what's missing. Iterate.

## D.8 Marathoners brake

This is multi-week work, not a Session 9 weekend hack. Realistic timeline: TCF v0.3 freeze (1 week of design + spec work) → operator HYPHA cultivation 1 (1-2 weeks) → source integrations (rolling) → friction validation cycle (2 weeks of real use). Don't compress.

**Critically:** TCF v0.3 must freeze before any operator HYPHA code is written. HYPHA contract-freeze is non-negotiable per global guardrails.

---

## Status as of 2026-05-05

- **Spec status:** v0.2, post-author-engagement notes added but not promoted.
- **Next milestone:** TCF v0.3 — fold §B candidate answers + §C additions back into the spec proper. Owner: SPY (with engagement support).
- **Blocking:** None. v0.3 work can begin whenever Session 8 dwell completes and friction-list review prioritizes it.
- **Friction-list memory entry:** see `~/.claude/projects/-Users-spy-mfautomation-mfautomation-kickoff/memory/project_daily_aggregator_idea.md` (predecessor scope; promote when v0.3 + operator HYPHA design lands).
