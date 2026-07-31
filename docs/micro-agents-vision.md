# Micro-Agents — Vision: the Thin-LLM Coding Agent

> **Status:** Vision / north-star · 2026-05-29 · not a build plan
> **Companion to:** `docs/superpowers/specs/2026-05-29-micro-agents-readside-v1-design.md`
> (the build-ready v1) and `docs/cache-network-micro-agents.md` (the original thesis)
> **Purpose:** Capture the longer arc — write-side micros, the cheap-write +
> review pattern, and the "retained master-level coding skill" idea — so it is a
> committed direction, not a buried options-list item. v1 ships the read-side
> slice AND emits the data that decides whether this vision gets built.

---

## 1. The north star, stated honestly

The recurring aspiration: **a coding agent that makes far fewer LLM calls because
it retains library knowledge and coding skill.** The honest engineering form of
that is not an "LLM-less agent" — applying skill to *novel, specific* context is
exactly the generative reasoning only an LLM does, and a cultivation's work is
novel by definition (you can't pre-store "write *this* wizard for *this*
schema"). The achievable form is:

> **A thin-LLM agent: the model does only the irreducible generative step;
> everything retrievable is retrieved, not regenerated.**

The split that makes this real:

| Irreducible (needs the LLM) | Retrievable (should be a lookup) |
|---|---|
| Synthesize novel code for this specific scope | Library APIs / signatures (`fs.appendFileSync`, React `useReducer`) |
| Resolve cross-contract design tensions | Idioms / patterns (TS discriminated unions, repo conventions) |
| Judge quality / correctness of output | The cultivation's own frozen contracts (NUTRIENTS) |
| | Previously-written-and-reviewed code for the same sub-job |

The right half is where call-reduction lives. v1's content-addressed cache
already converts the last two rows into free hits. The vision extends that to the
first two rows via a **knowledge layer**.

---

## 2. Write-side micros (v2)

v1 micros gather context (read-only). v2 micros **write code**: a leaf
partitions its write-scope across 2–4 cheap micros that produce files in
parallel, the leaf composes and commits **once**. This is the full fan-out the
`cache-network-micro-agents.md` cheap/full (violet/cyan) visualization encodes —
the spheres doing real *work*, not decoration.

**Why it is gated behind v1, not built first** (from the v1 spec §1.1):
- Opus-reviewing ≈ Opus-writing → the reviewer can erase the cheap-write saving.
- Write outputs don't dedup across biomes the way reads do → the cache
  mechanism that justifies micros is weaker for writes.
- Parallel writes under one leaf are HANDOFF bugs #2/#3 (open in `ROADMAP.md`).

**Prerequisites before v2 is scoped:**
1. v1's `micro-metrics.json` shows read-side pays (net input-token delta < 0,
   low re-read rate) — evidence the offload+cache model works at all.
2. run8 bugs #2/#3 (artifact-path / commit-attribution) fixed.
3. ROADMAP P1 eval harness exists — write-side reliability needs pass@k, not a
   single-input diff.

---

## 3. The cheap-write + review pattern (v2)

The answer to "cheap models write worse code" is a **verification gate**, which
maps onto `spawn.ts`'s existing cheap/full (Haiku/Opus) split — the "full" tier
*is* the reviewer:

```
cheap micros write (Haiku, parallel, partitioned scope)
        │
        ▼
reviewer micro (FULL/Opus) checks each sub-job vs contract → pass | fail+reason
        │
        ├─ pass → keep
        └─ fail → regenerate that sub-job on the FULL tier   ← the cheap→full promotion
        │
        ▼
leaf composes reviewed pieces → commits ONCE  (single-commit safeguard kills the run8 race)
```

Cost story: *most* writing is cheap; you pay Opus only for (a) the compose and
(b) the sub-jobs that failed review. The reviewer's pass/fail signal is also the
**training data** for learning which sub-jobs reliably stay cheap — over time,
more work proves it can stay on Haiku, and the agent gets thinner.

**The economic caveat carries forward:** this only nets a saving if cheap-write
savings + cache reuse exceed the reviewer cost. v1's data is the first read on
whether that's plausible; a v2 spec must re-run the cost analysis with real
write-side numbers before committing.

---

## 4. The knowledge layer (deferred; Context7-first)

The "retained library/coding knowledge" idea. **Do not build a RAG in v1 or
speculatively.** Reasons:

- A RAG adds embeddings + a vector store = a new dependency (trips CLAUDE.md
  rule #4 without strong justification).
- Its payoff is only real if leaves *actually* repeat library/concept lookups —
  an empirical claim v1's cache-hit data will answer.
- **Context7 MCP (port 8932) is already wired** and provides real-time library
  docs with zero new dependency. It is the natural first knowledge source.

**The data-driven path:**
1. v1 ships. Its cache surfaces repeated library/concept lookups as cache hits
   (a planner sub-job "explain `useReducer`" dedups across all leaves needing it).
2. Measure: how much of the micro traffic is *stable knowledge* re-derivation
   vs. *novel* generation?
3. If stable-knowledge re-derivation is significant → add a knowledge layer,
   Context7-first, RAG only if Context7 coverage proves insufficient.

You design the knowledge layer from v1's evidence, not in the dark.

---

## 5. How v1 feeds this vision

v1 is instrumented specifically to produce the evidence this vision needs:

| Vision question | v1 metric that informs it |
|---|---|
| Does cheap-model offload work at all? | Net input-token delta (§5.3) |
| Does cross-leaf knowledge reuse happen? | Dedup rate (§5.3) |
| Is retrievable knowledge a large share of calls? | Dedup rate + per-target compression |
| Is the workload summarizable (write-side viable)? | Compression ratio + re-read rate |

If v1's data is favorable, this vision becomes a funded v2 with real numbers
behind it. If unfavorable, the vision is paused with a cheap, honest kill signal
— which is exactly the point of measuring first.

---

*The thin-LLM coding agent is the destination. Read-side v1 is the instrument
that tells us whether the road is real. Build the instrument; let it speak.*
