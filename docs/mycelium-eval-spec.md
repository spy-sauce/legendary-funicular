# Mycelium Eval — pass@k baseline before Router phase 1

**Status:** Build-ready · 4-phase plan · code-grounded
**Source:** ECC adoption analysis (`agent-eval` + `eval-harness` skills) + run8 reliability gap
**Stored:** 2026-05-10

---

## Context

Mycelium has zero formal reliability data today. The discipline is `tsc --noEmit`
+ `cultivate --dry-run`. That catches *type errors and prompt-shape regressions*
— not *agent completion regressions*.

The forcing function is the Router 30-day plan
(`docs/mycelium-router-30day-plan.md`). Phase 1 changes the LLM chokepoint at
`cli/src/commands/cultivate.ts:480`. Once Router lands without a baseline, you
have permanently lost the ability to attribute leaf-completion changes to
"Router improved/regressed it" vs "the model changed under us" vs "the prompt
drifted." This spec ships *before* Router phase 1.

Run8 is the second forcing function. The cultivation took 4.7 hours and
produced two silent bugs (sporenet write race, talent-onboarding commit race).
Without a baseline, "is the next run better or worse?" is unanswerable.

The honest constraint: Mycelium leaves are non-deterministic. A single trial
tells us nothing. ECC's `agent-eval` solves this with `pass@k` and `pass^k` —
the same metric coding-eval research uses (HumanEval, SWE-bench). We adopt the
metric, not the binary.

## Architecture

```
                          ┌─────────────────────────────────────────┐
                          │  cli/src/commands/eval.ts (new)         │
                          │     mycelium eval [--task X] [--runs N] │
                          └─────┬───────────────────────────────────┘
                                │
                                ▼
                ┌──────────────────────────────────┐
                │  cli/src/lib/eval/                │
                │     ├── tasks.ts    (YAML loader) │
                │     ├── runner.ts   (worktree x N)│
                │     ├── judges.ts   (code/grep/llm)│
                │     ├── metrics.ts  (pass@k, pass^k)│
                │     └── report.ts   (table + json) │
                └─────┬──────────────────────────────┘
                      │
                      ├───── per trial: git worktree → run cultivate-or-target
                      │                  → run judges → record pass/fail+cost+wall
                      │
                      ▼
                .mycelium/evals/<task-id>/<timestamp>/
                  ├── trial-1/
                  ├── trial-2/
                  ├── trial-3/
                  └── summary.json   ← pass@k metrics, cost, wall, judge outputs
```

The eval surface is **separate from cultivate**. It can target:

- **Lane A — full cultivate run** (small fixture cultivation, ≤3 leaves, sandboxed)
- **Lane B — single-leaf invocation** (bypass orchestration, just spawn one leaf
  with a fixed HYPHA + NUTRIENTS pair)
- **Lane C — direct prompt eval** (rides the Router phase-1 chokepoint, no
  agent loop — measures classifier/router quality only)

Lane A is the canary. Lane B is the unit test. Lane C lights up when Router
ships and gives router-specific regression coverage.

## Eval task YAML

Mirrors ECC's `agent-eval` schema. Lives in `evals/tasks/*.yaml` at repo root:

```yaml
# evals/tasks/single-leaf-telemetry.yaml
id: single-leaf-telemetry
description: One-leaf cultivation generating telemetry-emitter upgrade
lane: B                              # A | B | C
fixture:
  hypha: hyphae/HYPHA-TELEMETRY-AGENT.md
  nutrients: NUTRIENTS.md
  scope: cli/src/upgrades/telemetry-emitter.ts
runs: 3                              # k for pass@k
budget:
  max_usd: 0.50                      # per trial
  max_wall_sec: 600
judge:
  - type: tsc
    cwd: cli
    expect: 0                        # exit code
  - type: grep
    pattern: "buildLeafStartedEvent|buildLeafFruitedEvent"
    files: cli/src/upgrades/telemetry-emitter.ts
    min_matches: 2
  - type: contract
    schema: nutrients.event_schema   # see contract-tests-from-nutrients.md
    against: .mycelium/events/<run_id>.jsonl
  - type: llm
    rubric: |
      Does the upgrade module implement the Upgrade interface correctly?
      Does it emit cost_recorded events with the documented data shape?
    pass_threshold: 4                # /5
gates:
  pass_at_3: 0.90                    # ship gate
  pass_caret_3: 0.66                 # stability floor
```

### Why YAML, not JSON

- Reads clean in PRs (Router 30-day plan style).
- Supports `# comments` for "why this judge."
- `mycelium.yaml` is already YAML; eval tasks compose with the same loader.

### Pinned commit per task

Every task pins the framework commit it was authored against
(`pinned_commit: <sha>`). Trials run from that commit — guarantees
reproducibility across days/weeks. Task fails the validator if the file is
edited without bumping `pinned_commit`.

## Metrics

| Metric | Definition | Use |
|---|---|---|
| `pass@1` | Fraction of trials where the *first* run passes all judges | Headline reliability |
| `pass@k` | Fraction of trial-sets where *at least one of k* runs passes | Practical reliability under controlled retry |
| `pass^k` | Fraction of trial-sets where *all k* runs pass | Stability — the bar for release-critical paths |

**Targets (initial):**

- Capability tasks: `pass@3 ≥ 0.90`
- Regression tasks (frozen at known-good commits): `pass^3 = 1.00`
- Cost ceiling: trial cost ≤ task `budget.max_usd`; eval *fails* on overshoot
  even if judges pass. Same posture as `lib/budget.ts` for cultivate.

## Worktree isolation per trial

Every trial runs in `git worktree add /tmp/mycelium-eval/<task>-<n> <pinned_commit>`.
Cleaned up after. Three reasons:

1. Trials don't see each other's writes — independence is the whole point.
2. Runs cannot pollute the live repo (matches ECC's agent-eval design).
3. Worktree pattern is the same one HANDOFF proposed for cultivate bug 2.
   Building it for eval first de-risks the cultivate refactor — eval is
   read-mostly and lower-risk.

Note: Mycelium hard rule #1 ("don't run `git`") applies to *leaves inside a
cultivation*. The eval runner is the orchestrator — it owns its own `git
worktree` calls, same way `cultivate` owns commits.

## Storage

```
.mycelium/evals/
  <task-id>/
    <ISO-timestamp>/
      trial-1/
        events.jsonl          # forwarded from leaf
        stdout.log            # cultivate/leaf stdout
        judges.json           # per-judge pass/fail + detail
        metrics.json          # cost_usd, wall_ms, files_written
      trial-2/  ...
      trial-3/  ...
      summary.json            # pass@1, pass@3, pass^3, total_cost_usd
  baselines/
    <task-id>.json            # last accepted summary (for regression delta)
```

Baselines are written by `mycelium eval baseline accept <task-id>` (explicit,
human-in-the-loop). `mycelium eval` without `accept` only *reports* drift; it
never silently moves the baseline.

## Integration with Router phase 1 (sequencing)

Router phase 1 lands `cli/src/lib/router/index.ts` and replaces the direct
`@anthropic-ai/claude-agent-sdk` call at `cultivate.ts:480` with a routing
layer. The eval contract *before* phase 1 ships:

1. Author 3 capability tasks (Lane A: small cultivation; Lane B: one telemetry
   leaf; Lane B: one cost-tracker leaf).
2. Run `mycelium eval --runs 3` against current `main`. Accept all summaries
   as baselines.
3. Phase 1 implementation must rerun the same tasks before merge. Required:
   `pass@3` non-decreasing on every task; `pass^3` non-decreasing on regression
   tasks; total cost within ±20% of baseline.
4. PR template gains an "Eval delta" section pasted from `mycelium eval report`.

This is the gate. Without it, Router ships blind.

## Phased build plan

### Phase 1 — Skeleton (1 day)
- `cli/src/commands/eval.ts` — Commander wiring; subcommands: `run`, `report`,
  `baseline accept`.
- `cli/src/lib/eval/tasks.ts` — YAML loader + schema validation (zod or hand-
  rolled, no new dep if avoidable).
- `cli/src/lib/eval/metrics.ts` — pure functions for pass@k, pass^k, cost
  rollup.
- One Lane B reference task checked in: `evals/tasks/lane-b-noop.yaml` —
  asserts the leaf wrote *anything*. Smoke test for the runner itself.

### Phase 2 — Worktree runner + judges (2 days)
- `cli/src/lib/eval/runner.ts` — `git worktree` provisioning, parallel trial
  execution (uses existing concurrency machinery from cultivate), cleanup
  semantics.
- `cli/src/lib/eval/judges.ts` — implement `tsc`, `grep`, `command`, `contract`
  (hook into contract-tests-from-nutrients.md), defer `llm` to phase 4.
- Three real Lane B tasks shipped: telemetry-emitter, cost-tracker,
  alerting-emit. Each one fails fast if the upgrade interface drifts.

### Phase 3 — Lane A (full cultivation) + reports (2 days)
- Lane A runner: spawns `mycelium ddp` against a sandboxed fixture
  (`evals/fixtures/lane-a-mini/`) with 3 leaves, captures full event log.
- `report.ts`: human table (`cli-table3`, already a dep) + JSON output.
- Baselines + regression delta. `--accept` flag on `baseline` subcommand.

### Phase 4 — Lane C (Router-only) + LLM judges (1 day, post-Router-phase-1)
- Lane C bypasses agent loop — measures classifier accuracy / model selection
  vs gold-standard labels in the task YAML.
- LLM judge: rubric-based, uses Anthropic SDK directly with low temp; results
  cached by `(rubric_hash, response_hash)` to avoid repeat spend.

**Total runway:** ~6 days end-to-end. Phases 1–3 must land before Router phase
1 merges. Phase 4 lands as part of Router phase 1 itself.

## What this is *not*

- **Not a CI runner.** `mycelium eval` runs *locally* and *manually before
  merge*. CI integration is a phase-5 question and not in scope here.
- **Not a unit test framework for the CLI.** `tsc --noEmit` + `--dry-run`
  remains the discipline for the framework code itself. Eval measures *agent
  completion behavior* — a different layer.
- **Not a substitute for harvest's threshold check.** Harvest gates a single
  cultivation run; eval gates *changes to the framework that affect cultivation
  reliability across runs*. They compose; they don't replace each other.
- **Not multi-harness yet.** v1 only invokes the Mycelium Agent-SDK leaf.
  Multi-harness eval (Codex, Cursor, Opencode comparisons) is a v2 question
  paired with the hooks-via-Agent-SDK scoping (see
  `docs/hooks-via-agent-sdk-scoping.md`).

## Anti-patterns

- **Trial count below 3.** Single-trial signal is meaningless given LLM
  variance.
- **Overfitting tasks to known good runs.** If the only way the task passes is
  the exact prompt the implementer was looking at, you have a memorization
  test, not an eval.
- **LLM-only judges.** Always include at least one deterministic judge
  (`tsc`, `grep`, `contract`) per task. LLM judges drift; deterministic ones
  don't.
- **Silent baseline updates.** `mycelium eval` without `--accept` never moves
  the baseline. The PR shows the diff explicitly.
- **Ignoring cost.** A 99% pass rate at 10× cost is a regression. Cost lives in
  the gate.

## Open questions

1. Should Lane B run leaves through the real Agent SDK (slow, costs money) or
   a recorded-replay harness? Replay is faster and free but loses model-drift
   signal — and model drift is the whole reason for evals. **Lean: real SDK.**
2. Where do fixture cultivations live? `evals/fixtures/lane-a-*/` would mean
   Mycelium ships test-cultivation projects in-tree. Acceptable, or should
   they live in a sibling repo and be `git submodule`'d? **Lean: in-tree,
   marked as test-only — submodules add operator pain.**
3. LLM-as-judge model — Sonnet (cheap) or Opus (better at rubric)? Cost
   matters because we re-judge on every trial. **Lean: Sonnet, cache hits.**
4. Is `pass@k` reported per-trial-set or aggregated across multiple
   timestamps? **Lean: per-trial-set is canonical (matches HumanEval); a
   rolling 7-run aggregate is a phase-5 nicety.**
5. Should baselines be per-commit or per-task-version? **Lean: per
   `(task_id, pinned_commit)` — same task at different framework SHAs are
   different baselines, which is the correct semantic.**

## Files touched

```
cli/src/commands/eval.ts                  (new)
cli/src/lib/eval/tasks.ts                 (new)
cli/src/lib/eval/runner.ts                (new)
cli/src/lib/eval/judges.ts                (new)
cli/src/lib/eval/metrics.ts               (new)
cli/src/lib/eval/report.ts                (new)
evals/tasks/*.yaml                         (new — initial 3-5 tasks)
evals/fixtures/lane-a-mini/                (new — sandboxed fixture cultivation)
.mycelium/evals/                           (new — gitignored runtime output)
```

No changes to `cultivate.ts` public contract (CLAUDE.md rule #2). No new npm
deps in phases 1–3 (rule #4). YAML loader already imported via `yaml`. Worktree
ops via `child_process.execFile` to git — no `git2` / `simple-git` dep needed.

## References

- `docs/mycelium-router-30day-plan.md` — phase 1 chokepoint that this gates
- `docs/contract-tests-from-nutrients.md` — provides the `contract` judge type
- ECC `agent-eval` skill — task YAML schema, worktree-per-trial pattern
- ECC `eval-harness` skill — pass@k / pass^k semantics
- ECC `harness-optimizer` agent — natural consumer of eval output (post-v1)
