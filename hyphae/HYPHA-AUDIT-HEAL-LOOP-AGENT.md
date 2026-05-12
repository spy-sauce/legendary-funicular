# HYPHA — audit-heal-loop

## CACHE HEADER
- **SCOPE:** Phase 2 — autofix re-plant cycle, iteration metadata, budget cap. Drives the loop: aggregate → compose brief-fix.md → re-cultivate affected biomes → re-audit → repeat.
- **PRIMITIVES:** subprocess spawn (`mycelium cultivate --only-biome <id>`) · iteration record persistence · termination condition evaluation · cost tracking via `lib/budget.ts`.
- **RULES:** **default mode is commit-on-top** (the heal loop modifies the working tree; operator can switch to sub-organism via `--autofix-branch <name>`) · max-iterations defaults to **3** (per §10.1 lean) · loop terminates on zero-criticals OR max-iter OR budget exhaust OR no-progress (findings_out ≥ findings_in with non-zero criticals) · cumulative cost across iterations is the budget gate, not per-iteration cost.
- **COUPLING:** consumes `Finding`, `AuditSummary` from `audit-findings`; `aggregate`, `composeBriefFix` from `audit-aggregator`. Invoked by `audit-cli` when `--autofix` is passed.
- **LOAD WHEN:** any leaf implementing the autofix iteration loop, persisting `IterationRecord`s, or spawning re-plant subprocesses.

## Scope
Implement the heal-loop in `cli/src/lib/audit/heal-loop.ts`. **Phase 2 deliverable.** This biome is build-only in this cultivation — the heal-loop is exercised live only in subsequent audit-run usage. We ship the engine, not exercise it.

The heal-loop is the bridge between findings and fixes: it takes the aggregator's brief-fix.md and turns it into one or more `mycelium cultivate --only-biome <id>` invocations, then re-runs the audit, iterating until clean or until a termination condition fires.

## Deliverables by leaf

### `audit.heal.loop`
- File: `cli/src/lib/audit/heal-loop.ts`
- `runHealLoop(opts: { auditRunDir, cultivationDir, maxIterations, maxBudgetUsd, autofixBranch?: string, concurrency }): Promise<HealLoopResult>`
- Iteration body:
  1. Read `<auditRunDir>/iterations/<n-1>/findings.jsonl` (or baseline for iteration 1).
  2. `aggregate` → `AggregatedFindings`.
  3. If `criticalBiomes.length === 0` → emit final `heal-loop-summary.json`, return success.
  4. `composeBriefFix(originalBrief, aggregated, prevFindingsPath)` → write `<auditRunDir>/iterations/<n>/brief-fix.md`.
  5. For each biome in `criticalBiomes ∪ majorBiomes`: spawn `mycelium cultivate --only-biome <biome>` (sequential, not parallel — single-biome cultivate at a time).
  6. After all re-cultivations: re-spawn the tester pool (caller passes a closure for this — don't import `audit-testers` directly to avoid a circular dep; **`runHealLoop` takes a `runTestersFn` parameter**).
  7. Write new `findings.jsonl` + `summary.json` under `iterations/<n>/`.
  8. Evaluate termination: zero-criticals, max-iter, budget, no-progress.
- Returns `HealLoopResult` with all `IterationRecord`s, final findings, total cost.

### `audit.heal.iteration`
- File: `cli/src/lib/audit/heal-iteration.ts`
- Export `IterationRecord` interface per NUTRIENTS §8.
- `writeIteration(auditRunDir, iteration, record): Promise<void>` — atomic temp/rename to `audit/<ts>/iterations/<n>/iteration.json`.
- Also persists `<auditRunDir>/heal-loop-summary.json` with the full ordered array of records on final termination.

### `audit.heal.budget`
- File: `cli/src/lib/audit/heal-budget.ts`
- Imports `getMaxBudgetUsd` and `formatBudget` from `cli/src/lib/budget.ts` — **do not modify** `lib/budget.ts`.
- `resolveBudget(cliFlag?: number, yamlMaxUsd?: number): number` — flag > yaml > default.
- `trackCost(runDir, iteration, iterationCostUsd): { cumulative: number; remaining: number }` — reads/updates a `<runDir>/.cost.json` ledger.
- Per-iteration cost is derived from the cost-recorded events in the cultivation's `.mycelium/events/*.jsonl` for the iteration's run_id (re-uses existing telemetry plumbing; do not re-implement).

### `audit.heal.autofix-branch`
- Plumbing in `runHealLoop` — when `autofixBranch` is set:
  - Before iteration 1, `git checkout -b <autofixBranch>` (and stash any uncommitted operator work first — abort loudly if stash conflicts).
  - At loop end, do not merge — leave the branch for operator review.
- When `autofixBranch` is **not** set (default — commit-on-top): no branch surgery; cultivate's existing auto-commit behavior takes over.
- Both modes write iteration metadata identically under `audit/<ts>/iterations/<n>/`.

## Contract dependencies
- NUTRIENTS.md §1 (Finding schema) — frozen
- NUTRIENTS.md §5 (aggregator brief composition) — frozen
- NUTRIENTS.md §8 (heal-loop iteration contract) — frozen
- NUTRIENTS.md §9 (cost/budget tie-in) — frozen
- NUTRIENTS.md §10 (cultivate.ts re-use boundaries) — frozen

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `runHealLoop` with a mock `runTestersFn` that returns zero findings on iteration 1 terminates with `result.iterations.length === 1` and `result.success === true`.
- `runHealLoop` honors `maxIterations` — with a mock that always returns 1 critical, terminates after `maxIterations` iterations with `success: false`.
- `resolveBudget` flag-precedence: CLI flag wins over yaml wins over default.
- `--autofix-branch` mode invokes `git checkout -b` exactly once (verify via subprocess mock).

## Out of scope
- Actually invoking real cultivate during this cultivation — phase 2 is **build only**. Real heal-loop exercising happens in subsequent audit-run usage.
- Aggregation logic — `audit-aggregator`.
- Tester execution — `audit-testers` (passed in as a closure).
- The `--autofix` flag wiring on the CLI — `audit-cli`.

## Merge instructions
After `audit-findings` and `audit-aggregator`. Imports from both. **Do not modify `cli/src/lib/budget.ts`** or `cli/src/commands/cultivate.ts`.
