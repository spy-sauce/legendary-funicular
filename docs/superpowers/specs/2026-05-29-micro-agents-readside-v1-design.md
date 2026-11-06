# Micro-Agents — Read-Side v1 Design

> **Status:** Design approved · 2026-05-29 · ready for implementation plan
> **Author:** SPY (Sean Young) + Cosmo
> **Scope:** Make the dashboard's decorative micro-agents real, as read-side
> context-gatherers inside the audit-run testers-pool, instrumented to measure
> whether the cost model pays — and thereby gate the write-side v2 north star.
> **Companion:** `docs/micro-agents-vision.md` (thin-LLM / write-side v2 / knowledge layer)
> **Architecture PDF:** `docs/micro-agents-architecture.pdf`

---

## 1. Problem & context

PR #3 shipped `cli/src/lib/micro-agents/` (~286 LOC) as **deterministic state
objects only** — `spawnMicros(leafId)` returns 2–4 `{idx, routing,
last_call_was_hit, fire_count}` records that the dashboard renders as orbiting
cheap/full spheres. No micro performs LLM work; `last_call_was_hit` and
`fire_count` are never updated by anything real. Meanwhile the cache-network
(`cli/src/lib/cache-network/`, ~820 LOC: `store.ts`, `accounting.ts`, `keys.ts`)
**is** real and wired into `cultivate.ts` at the SDK chokepoint, with a 1.4s
`cache.pulse` aggregator writing live stats to `sporenet/state.json`.

The `cache-network-micro-agents.md` design note sells a cost thesis — leaves
fan out into cheap/full micros, the cache absorbs the read-path, "less DB
development." Only the visual shell of that thesis shipped. This spec realizes
the **read-side half** of it, safely, and instruments it so the data decides
whether the more ambitious **write-side half** (v2) is worth building.

### 1.1 Why read-side, not write-side (the cost finding)

An earlier iteration of this design scoped micros to *write* code in parallel on
cheap models, with a full-tier reviewer. Pressure-testing the economics killed
that as a *first* step:

- **Opus-reviewing ≈ Opus-writing.** A reviewer that reads N generated code
  chunks and judges them against a contract costs roughly what writing those
  chunks costs for the expensive model. The reviewer isn't optional (it exists
  precisely because cheap-model code isn't trusted), so the Haiku write-savings
  and the Opus verification are the same decision — you can't keep one and drop
  the other.
- **Write outputs don't dedup across biomes.** The cache is content-addressed;
  reads of the same frozen `NUTRIENTS` section dedup across the 119 leaves, but
  each biome *writes* different code, so write sub-job outputs are mostly unique
  and rarely cache-hit. The dedup mechanism that justifies micros applies to
  reads, not writes.
- **Write-side sits on two open bugs.** Parallel write-micros under one leaf is
  HANDOFF bugs #2/#3 (artifact-path-vs-actual-write-path; commit attribution),
  listed 🔴 open in `docs/ROADMAP.md`. Building the highest-risk path on a
  known-broken foundation, before the eval harness (ROADMAP P1) that would
  measure it, inverts the measure-before-committing discipline.

Read-side is low-risk (read-only tools → zero write-race exposure), rides the
existing cache, and — crucially — its job is to **produce the measurement** that
tells us whether write-side v2 pays. Write-side + reviewer + thin-LLM is the
committed north star, captured in the companion vision doc, gated on v1's data
and the run8 bug fixes.

---

## 2. Scope

**In scope (v1):**
- Real read-side micro fan-out inside the **audit-run testers-pool only**.
- A **deterministic plan** (no LLM planner) derived from each tester's declared
  `INPUTS`.
- 2–4 worker micros per tester: cheap (Haiku), read-only `query()` calls that
  summarize the tester's input targets.
- Folded context: worker summaries prepended to the tester prompt; tester
  steered to consume them and skip redundant raw reads.
- Full reuse of the existing cache (`cacheKey` + `store`) for cross-tester dedup.
- Instrumentation: input-token delta, dedup rate, re-read rate, compression
  ratio → `micro-metrics.json`.
- `--no-micros` flag for baseline capture.

**Out of scope (v1) — named, not dropped:**
- Code-writing by micros → **v2** (vision doc).
- LLM planner for adaptive sub-job discovery → **v2** (only earns its non-dedup
  cost when what-to-build isn't pre-enumerated).
- Full-tier reviewer / cheap→full promotion → **v2**.
- Knowledge layer (RAG / Context7-retained library knowledge) → **vision doc**;
  v1's cache-hit data is its evidence base. No new dependency.
- Any `cultivate.ts` change. Any framework-wide rollout (audit pool first per
  `cache-network-micro-agents.md` §9 step 3).
- Parallel writes (so run8 bugs #2/#3 are not touched).

---

## 3. Architecture

```
audit-run testers-pool  (cli/src/lib/audit/testers-pool.ts — existing fan-out)
        │
        │  for each tester, before its main assertion run:
        ▼
  runMicroFanout(tester, ctx)              ← NEW: cli/src/lib/micro-agents/fanout.ts
        │
        ├─ 1. derivePlan(tester)           ← NEW: pure, no LLM
        │       tester.INPUTS → 2–4 MicroSubJob[]  (capped by seeded count)
        │
        ├─ 2. worker micros (2–4, concurrent via runWithConcurrency)
        │       each: query({ model:'haiku', allowedTools:[Read,Grep,Glob], maxTurns:3 })
        │       cache-checked individually (store.get → free on cross-tester hit)
        │       → compact summary of one input target
        │
        └─ 3. fold: summaries → "## Gathered Context" block prepended to tester prompt
        ▼
  tester main query()  (cli/src/lib/audit/testers-runner.ts:286 — model unchanged = Opus-class)
     step-1 instruction flipped: "rely on Gathered Context; re-READ raw only if insufficient"
     → consumes compact folded context instead of re-reading raw sources
     → emits findings JSONL exactly as today (assertion contract untouched)
```

**Verified mechanism facts:**
- A micro = `query({ prompt, options: { model:'haiku', allowedTools:['Read','Grep','Glob'], maxTurns:3 } })`.
  The SDK `Options`/`AgentDefinition` expose `model?: 'sonnet'|'opus'|'haiku'|'inherit'`
  (`coreTypes.d.ts:347`). No SDK fork.
- Testers currently run on the **default (Opus-class) model** — `query()` at
  `testers-runner.ts:286` passes no `model`. So an Opus→Haiku offload genuinely
  exists to capture.
- `cacheKey({tool_name, args, contract_hash})` + `makeCacheStore()` are reused
  verbatim. Micros call `store.get`/`store.set` with `tool_name:"micro.work"`.
- `runWithConcurrency` (lifted to `cli/src/lib/concurrency.ts`) bounds the inner
  fan-out (2–4) inside the tester's slot — cannot blow the pool's global cap.

---

## 4. Data flow & the deterministic plan

### 4.1 Stage 1 — derivePlan (pure, no LLM)

The testers-loader already parses each tester's `INPUTS` (comma-list of
paths + NUTRIENTS section refs) from its CACHE HEADER. `derivePlan(tester)`
turns those into 2–4 `MicroSubJob`s — one per distinct readable target, capped
at 4 by the existing `spawnMicros()` seeded count.

```ts
interface MicroSubJob {
  id: string;        // stable slug from target, e.g. "read-nutrients-s3"
  kind: "summarize";          // v1: "summarize" ONLY (the offload mechanism).
                              // "read" | "grep" reserved for v2 — see note below.
  target: string;    // a path / glob / NUTRIENTS-section ref from INPUTS
  question: string;  // fixed template — e.g. "Summarize the contract in <target>"
}
```

> **v1 `kind` scope:** v1 emits only `kind: "summarize"` — that is the sole
> mechanism that converts Haiku cost into removed Opus input tokens (a summary
> the tester reads instead of the raw source). The `kind` field is typed as a
> union (`"read" | "grep" | "summarize"`) so v2 can add literal `read`/`grep`
> sub-jobs without a contract change, but `derivePlan` in v1 produces
> `summarize` jobs exclusively. This keeps v1's `derivePlan` behavior
> unambiguous and its measurement clean.

Pure and testable. If a tester has 0 readable INPUTS, the plan is empty and
fan-out is skipped (see §6).

### 4.2 Stage 2 — worker micros (Haiku, concurrent, read-only)

Each `MicroSubJob` → one `query({ model:'haiku', allowedTools:['Read','Grep','Glob'], maxTurns:3 })`,
run through `runWithConcurrency` with the seeded inner cap. Output: a **compact
summary** of the target. Read-only tools → no artifacts, no write-race.

Each call is cache-keyed and checked against `store.get` before firing:
`cacheKey({ tool_name:"micro.work", args:<canonical sub-job>, contract_hash:<frozen hash> })`.
A frozen-contract re-freeze changes `contract_hash` → correct invalidation.
Cross-tester dedup is the bonus: if `tester.schema` and `tester.auth` both
summarize `NUTRIENTS §3`, the second is a free hit.

### 4.3 Stage 3 — fold + skip (the saving mechanism)

Worker summaries become a `## Gathered Context` block prepended to the tester
prompt. **The tester prompt is modified** — its step-1 instruction changes from
*"READ the cultivated artifacts in your INPUTS"* to *"The artifacts in your
INPUTS are summarized below in Gathered Context — rely on it; only re-READ a raw
file if the summary is insufficient for an assertion."*

This skip is where added Haiku cost becomes removed Opus tokens. If the tester
re-reads raw sources anyway, the offload failed for that target (measured as
re-read rate, §5). Everything else about the tester — assertions, findings JSONL
schema — is untouched.

### 4.4 The saving invariant

v1 nets a saving **iff**, summed across the pool with cache hits counted:

```
Σ(folded Opus input tokens + Haiku input tokens) < Σ(baseline raw Opus input tokens)
```

If negative, v1 has cheaply proven read-side doesn't pay on this workload — a
valid result that gates write-side v2.

---

## 5. Measurement & the v2 decision gate

v1's product is **evidence**, not savings. Two risks become first-class metrics:
compression might be nominal (Risk 1); testers might re-read anyway (Risk 2).

### 5.1 Per-call record

```ts
interface MicroCallRecord {
  tester_id: string;
  sub_job_id: string;
  cache_status: "hit" | "miss";   // from store.get before firing
  model: "haiku";
  input_tokens: number;           // 0 on hit
  output_tokens: number;          // 0 on hit; summary size on miss (logged, not headlined)
  raw_target_bytes: number;       // size of the source the summary replaces
}
```

### 5.2 Re-read scan (Risk 2)

After a tester's main session runs, scan its `sdk_msg` log for `Read`
`tool_use` blocks whose `file_path` matches a target already folded into its
context. That count is the **redundant re-read rate** — it explains a negative
result instead of merely reporting one.

### 5.3 Headline metrics → `audit/<ts>/micro-metrics.json`

| Metric | Formula | Tells us |
|---|---|---|
| **Net input-token delta** (headline) | `Σ(folded Opus input + Haiku input) − Σ(baseline raw Opus input)` | Did v1 pay? (§4.4 invariant) |
| **Dedup rate** | `cache hits / total micro calls` | Cross-tester reuse |
| **Re-read rate** | `redundant raw Reads / folded targets` | *Why* offload paid or didn't (Risk 2) |
| **Compression ratio** | `Σ summary input tokens consumed by tester / Σ raw target bytes` | Whether summaries are real or nominal (Risk 1) |

**Input tokens only for the headline.** Input tokens are near-deterministic
(driven by prompt content, not model sampling), so a single before/after is
honest — no N-run machinery, no variance hand-waving. Output-token variance is
logged for diagnostics but excluded from the *claim*. This is not pass@k; it is a
single deterministic-input cost diff, which is all v1 needs and all it can
honestly claim before ROADMAP P1's eval harness exists.

### 5.4 Baseline capture

A new `--no-micros` flag (additive, mirrors cultivate's `--no-cache`) runs the
pool the old way (testers read raw), logging baseline input tokens. Protocol:
run once with `--no-micros` (baseline), once with micros, diff the
`micro-metrics.json`.

### 5.5 The v2 decision gate (explicit)

| Outcome | Verdict |
|---|---|
| Net delta < 0 (saves) **and** re-read rate low | Read-side pays → scope write-side v2 |
| Net delta ≥ 0 **but** re-read rate high | Offload sabotaged by re-reads, not disproven → fix steering prompt, re-measure |
| Net delta ≥ 0 **and** re-read rate low **and** compression poor | Summaries don't compress → read-side genuinely doesn't pay here → **do not build v2.** Cheap kill signal. |

> **Known limitation:** the audit pool is the right place to prove read-side is
> *safe* and to measure *dedup*, but testers do precise assertion work that
> resists summarization — so the pool may *under*-show the *compression* number
> relative to where offload shines (broad-synthesis cultivate leaves). A weak
> compression result here means "audit testers are the hardest case," not
> necessarily "read-side fails." The re-read metric disambiguates.

### 5.6 Accounting integration (reuse, don't reinvent)

Micro token counts flow through the existing cache event stream — a worker miss
emits the existing `cache.miss`; a worker storing its summary emits via the
existing `store.set` path; the existing `cache.pulse` aggregator sums saved
tokens/USD on its 1.4s cadence. New: a `micro_call` event kind on the audit
findings stream (additive, mirrors how `routing_decision` was meant to extend
`cost_recorded`) and a `micro-metrics.json` written at pool end. No change to
`accounting.ts`'s contract.

---

## 6. Error handling & failure isolation

Governing principle: **a micro failure never fails or degrades the tester.**
Micros are an optimization; on any failure the tester falls back to baseline
(reads raw sources itself).

| Failure | Handling | Event |
|---|---|---|
| Worker `query()` throws / times out | Drop that summary; folded block omits it; tester re-reads that raw target itself | `micro.work_failed` |
| Worker returns empty/garbage summary | Treated as "no summary for this target." No quality validation in v1 (v2 reviewer's job) | `micro.work_empty` |
| `derivePlan` → 0 sub-jobs | Skip fan-out entirely; tester runs as today; zero overhead | `micro.plan_empty` |
| All workers fail | Folded block empty; tester runs baseline; pool continues | logged |
| Cache `get`/`set` throws | `store.ts` is non-throwing by contract; micro proceeds as a miss | existing `[cache-network] warning` |
| Micros would push tester over USD cap | Micros draw from the tester's existing `maxBudgetUsd`; a micro that would exceed it isn't spawned | `micro.budget_skipped` |

**Isolation guarantees:**
- **Concurrency containment:** worker micros run in the tester's slot via
  `runWithConcurrency` with a small inner cap (2–4), bounded by the seeded
  count — never unbounded.
- **No partial state leak:** read-only tools → a failed/interrupted micro leaves
  zero artifacts and zero git state. Structural payoff of read-side.
- **SIGINT:** worker streams register in the existing `activeSessions` set; the
  existing shutdown hook interrupts them alongside leaf sessions. No new
  shutdown logic.
- **Determinism under failure:** `derivePlan` is pure → re-run yields the same
  sub-jobs; a transient worker failure re-attempts and may cache-hit if a
  sibling already succeeded.

**Deliberately NOT handled in v1 (named, not dropped):** summary *correctness*
(v2 reviewer), cross-tester cache poisoning (read-only + content-addressed keys
make it safe), write-conflict resolution (no writes exist).

---

## 7. File layout

**New files (`cli/src/lib/micro-agents/`):**

```
derive-plan.ts   NEW   pure: (tester) → MicroSubJob[]  (2–4, capped by seeded count)
fanout.ts        NEW   runMicroFanout(tester, ctx) → { foldedContext, records[] }
metrics.ts       NEW   pure: MicroCallRecord[] + re-read scan → MicroMetrics
types.ts         NEW   MicroSubJob, MicroCallRecord, MicroMetrics
spawn.ts         EDIT  additive: keep seeded count; MicroState gains optional real fields
registry.ts      EDIT  additive: store real worker results alongside existing state
index.ts         EDIT  re-export the new surface
derive-plan.test.ts  NEW  vitest (matches security/ + stacks/ precedent)
metrics.test.ts      NEW  vitest
```

**Modified files (audit-run only — `cultivate.ts` untouched):**

```
cli/src/lib/audit/testers-runner.ts  EDIT  before main query(): runMicroFanout; prepend
                                           folded context; flip step-1 prompt line; scan
                                           sdk_msg for redundant raw Reads (re-read metric)
cli/src/lib/audit/testers-pool.ts    EDIT  thread --no-micros; write micro-metrics.json at end
cli/src/commands/audit-run.ts        EDIT  register --no-micros (additive, mirrors --no-cache)
```

**Contracts touched (additive only):**
- `NUTRIENTS.md` — new `micro_call` event kind + `MicroSubJob`/`MicroCallRecord`/
  `MicroMetrics` shapes appended to the audit cultivation's sections. No field
  removed/renamed.
- `MicroState` — additive optional fields; dashboard renders as today when absent.
- Cache event stream, `store.ts`, `accounting.ts`, `cacheKey()` — consumed
  verbatim, zero contract change.

---

## 8. Rule compliance (framework CLAUDE.md)

| Rule | Status |
|---|---|
| #1 no `git` | ✓ micros read-only; commits stay with orchestrator |
| #2 `cultivate.ts` public contract | ✓ untouched — changes in `lib/audit/` + `lib/micro-agents/` |
| #3 no rename commands/flags | ✓ `--no-micros` is additive (mirrors `--no-cache`) |
| #4 no new deps | ✓ reuses SDK `query`, `runWithConcurrency`, existing cache; zero npm adds |
| #5 no framework tests | ⚠️ pure functions `derive-plan` + `metrics` ship vitest tests, matching the existing `security/` + `stacks/` precedent and the disambiguated rule #5 (their correctness gates the v2 decision). Orchestration/SDK code stays test-free; `tsc --noEmit` + a real audit run is the discipline. |
| #8 no secrets | ✓ none introduced |
| #9 `state.json` shape | ✓ only additive optional `MicroState` fields |
| #10 `Upgrade` interface | ✓ untouched — micros live in the audit path |

---

## 9. Deliverables

1. The code in §7 (built clean: `cd cli && npm run build && npx tsc --noEmit`).
2. This spec.
3. `docs/micro-agents-vision.md` — thin-LLM / write-side-v2 / knowledge-layer
   companion (Context7-first, no new dep).
4. `docs/micro-agents-architecture.pdf` — Chrome-headless render of a styled
   HTML architecture/infra doc (diagrams + data flow + v2 gate table).

---

## 10. End-to-end verification

1. `cd cli && npm install && npm run build` — clean.
2. `npx tsc --noEmit` — clean.
3. `npx vitest run` — `derive-plan` + `metrics` unit tests green.
4. `mycelium audit-run --no-micros` against a fixture cultivation → baseline
   `micro-metrics.json` (raw Opus input tokens).
5. `mycelium audit-run` (micros on) → `micro-metrics.json` with all four metrics.
6. Diff the two → net input-token delta + the gate-table verdict (§5.5).
7. Dashboard: orbiting micros reflect real worker results (not the stub state).
