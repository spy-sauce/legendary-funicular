# Mycelium — Consolidated Framework Bug Tracker

> **THE single source of truth for framework bugs** (backlog item **1.2**: "7 open bugs
> scattered across two HANDOFFs" — root `HANDOFF.md` 2026-05-13 entry + the
> `feat/dashboard-cache-net` branch HANDOFF 2026-05-16 entry — plus everything newly
> found in the 2026-07-02 subsystem sweep). Update status **here** when a fix lands;
> HANDOFF entries are historical record only.
>
> Entry shape: **id · title · severity · anchor · status** + one-paragraph root cause +
> fix sketch or commit note. Ids B1–B7 preserve the original numbering from the two
> HANDOFFs; B8+ are newly consolidated or newly found.

---

## Open

*(empty as of 2026-07-02 — see Fixed-this-session below. Two OPEN DECISIONS remain, operator-gated:*
*1. a distinct `setup_failed` termination reason would extend the frozen NUTRIENTS §8 union — until amended, autofix branch-setup failure still reports `no_progress` (loudly logged);*
*2. B8 shared-tree race validation needs a real overlapping-artifact cultivation run.)*

---

## Fixed-this-session (2026-07-02)

### B7 — `contracts freeze` forced framework-internal cultivations through `--skip-audit`
- **Severity:** medium · **Anchor:** `cli/src/commands/contracts.ts` (audit stack resolution) · **Status:** fixed-this-session (live-verified: `contracts audit --stack framework-internal` passes with note)
- **Root cause:** the freeze audit assumed an app stack; dogfood cultivations have operator-authored NUTRIENTS and no appendix, so the only path through was full bypass.
- **Fix:** `framework-internal` recognized as a stack sentinel (yaml `organism.stack` or `--stack`) — audit passes with an informational note instead of being skipped. No fake appendix preset; there is nothing to diff against by design.

### B10 — dead `autofix-branch.ts` swapped in for the inline reimplementation
- **Severity:** medium · **Anchor:** `cli/src/lib/audit/heal-loop.ts` + `autofix-branch.ts` · **Status:** fixed-this-session (tsc/build/vitest verified)
- **Fix:** inline `setupAutofixBranch` deleted; heal-loop now uses the module's setup (originalBranch tracking, stash verification, branch-exists handling) and calls `finalizeAutofixBranch` at loop end (verifies branch, logs operator-review message; per spec never merges). **Open decision:** branch-setup failure still terminates as `no_progress` (loudly logged) — a distinct `setup_failed` reason extends the frozen NUTRIENTS §8 union and needs a contract amendment.

### B12 — sporenet audit block froze at iteration-0 for the whole autofix run
- **Severity:** medium · **Anchor:** `orchestrator.ts` Step 12/13 + `heal-loop.ts` · **Status:** fixed-this-session (tsc/build verified; live validation on next `--autofix`)
- **Fix:** heal-loop publishes a "running" block per iteration (new additive `auditRunId` option on HealLoopOptions); orchestrator finalizes with the loop's real outcome (`complete`/`failed`, final iteration + counts) + drains writes on the autofix path.

### B19 — audit block was NEVER written: writeAuditBlock call sites passed `sporenetDir`, function appends `sporenet/state.json` itself
- **Severity:** high (masked B12 entirely) · **Anchor:** `orchestrator.ts` Steps 4 + 12 · **Status:** fixed-this-session — found while fixing B12
- **Root cause:** `writeAuditBlock(stateDir)` reads `<stateDir>/sporenet/state.json`; the orchestrator passed `<cultivationDir>/sporenet`, resolving to `sporenet/sporenet/state.json`, and the function's silent-bail-on-missing design hid it. Every audit block write since audit-run shipped was a no-op.
- **Fix:** both call sites pass the organism root (`cultivationDir`).

### B17 — ENGINE: SIGINT/crash skipped worktree + state cleanup
- **Severity:** medium · **Anchor:** `cli/src/commands/cultivate.ts` (shutdown hook, worktree helpers) · **Status:** fixed-this-session (tsc/build/dry-run verified)
- **Fix:** live worktrees registered in a module-level map (`addLeafWorktree` registers, `removeLeafWorktree` unregisters); the shutdown hook now best-effort removes registered worktrees (direct git, not the commitQueue — its pending ops will never complete post-interrupt) and awaits `drainLeafStateWrites()` before `process.exit(130)`, so interrupted leaves don't leave the dashboard stuck `active`.

### B18 — ENGINE: duplicate leaf ids unrejected + silent `blocked_by` cycle dumping
- **Severity:** low · **Anchor:** `cli/src/commands/cultivate.ts` (pre-wave validation + `buildLeafWaves`) · **Status:** fixed-this-session (tsc/build/dry-run verified)
- **Fix:** duplicate leaf ids now fail the run loudly (exit 1) before any waves build — ids key feat/<id> branches, worktree paths, and state.json entries, so collisions corrupt all three. Cycle/dead-end fallthrough still fail-softs into one final wave but now names the affected biomes and points at `blocked_by`; fires in `--dry-run` too (same code path).

### B2 — `no_progress` termination could never fire on iteration 1 (prevRecord guard + wrong comparison field vs NUTRIENTS §8 cond 4)
- **Severity:** high · **Anchor:** `cli/src/lib/audit/heal-iteration.ts` (`evaluateTermination`) · **Origin:** PR #2 HANDOFF (bug 2) · **Status:** fixed-this-session
- **Root cause:** the old guard was `if (prevRecord !== null && record.criticals_out > 0) { if (record.findings_out >= prevRecord.findings_out) ... }` — `prevRecord` is always null on iteration 1 (the baseline isn't in the iterations array), so a fully stagnant first autofix pass (the exact case B5 guaranteed) looped to `max_iterations`; and it compared against the wrong field. §8 condition 4 is self-contained within one record: `findings_out >= findings_in` on a non-zero-criticals iteration.
- **Fix:** comparison is now within-record (`record.criticals_out > 0 && record.findings_out >= record.findings_in`), no prevRecord dependency.

### B3 — finding id hash included LLM-authored `summary` (no dedupe across paraphrase drift) AND `findingId()` was dead code — the tester LLM computed the id itself, unverified
- **Severity:** high · **Anchor:** `cli/src/lib/audit/findings.ts` (`findingId`), `cli/src/lib/audit/testers-runner.ts:361` (ingest) · **Origin:** PR #2 HANDOFF (bug 3) + backlog 1.2 · **Status:** fixed-this-session (NUTRIENTS §1 amendment + code)
- **Root cause:** two compounding defects. (1) The id formula hashed `summary`, an LLM-authored free-text field that paraphrases between runs → different ids for the same defect → dedupe (`findings-writer.ts:94`) and `--against` regression diff (`orchestrator.ts:122-141`) both broke. (2) `findingId()` had zero callers — the tester session computed the sha256 itself per prompt instructions and was trusted verbatim at ingest.
- **Fix:** `summary` dropped from `FindingIdParts` and the §1 formula (`sha256(tester_id|biome|file_path|line_range)`); the framework now **recomputes** `finding.id = findingId(...)` at the ingest chokepoint, making LLM hash arithmetic irrelevant. Collision tradeoff is safe: each tester emits at most one finding per run.

### B5 — heal-loop re-tested against the BASELINE audit dir — stale `finding.json` re-emitted baseline findings; `iterations/<n>/testers/` never created
- **Severity:** critical · **Anchor:** `cli/src/lib/audit/heal-loop.ts:438` (`runTestersFn(auditRunDir, ...)` passes the top-level baseline dir), `cli/src/lib/audit/testers-runner.ts:358` (stale-file parse) · **Origin:** PR #2 HANDOFF (bug 5) · **Status:** fixed-this-session
- **Root cause:** the baseline dir was threaded verbatim through `orchestrator.ts:392-400` into the pool, so testers derived `testers/<id>/finding.json` under the **baseline** paths; nothing ever deleted iteration-0 artifacts, so even a now-passing tester (which writes no file per the prompt) "re-found" its baseline defect from the stale file, and iteration findings were appended into the baseline `findings.jsonl` — violating the NUTRIENTS §2 layout and blocking `zero_criticals` auto-termination on success.
- **Fix:** per-iteration dir threading (`iterations/<n>/` as the run dir, so `testers/` and `findings.jsonl` self-correct) + defensive stale `finding.json` removal before each re-run. **Note:** root `HANDOFF.md` (2026-05-13) framed bug 5 as "runTestersFn doesn't actually re-run testers" — superseded by this root cause: testers DO re-spawn (SDK `query()` at `testers-runner.ts:286`); the short-circuit was stale-artifact reuse, not a skipped run.

### B6 — harvest ID-namespace mismatch: biome `agent.id` exact-matched against leaf-id-keyed `state.json` → false "0% harvest" on cellular organisms (backlog **0.3**)
- **Severity:** high · **Anchor:** `cli/src/commands/harvest.ts:115` (old `isReady = leafStatusBySporenetId[agent.id] === "done"`) · **Origin:** PR #3 HANDOFF (bug 4/7) + backlog 0.3 · **Status:** fixed-this-session (mirrors PR #3 commit `310ea12` — dedups when that branch merges)
- **Root cause:** cultivate seeds `state.json` keyed by **leaf** id (`audit.cli.orchestrator`), while harvest iterates **biome** agents (`audit-cli`); leaf naming does not derive mechanically from the biome id (`audit-heal-loop` owns `audit.heal.iteration`), so no key ever matched on depth>1 organisms and every agent landed in notReady → `harvestRatio` 0 even when work fully shipped.
- **Fix:** direct biome-id match first (legacy depth-1), then rollup over the `sub_agents` ids declared in `mycelium.yaml` (ready iff ≥1 tracked leaf and all tracked leaves `done`), with the `<biome-id>.` prefix heuristic as fallback for organisms without declared sub_agents.

### B13 — ENGINE: fixed BASE across waves — later waves couldn't see earlier waves' integrated output
- **Severity:** high · **Anchor:** `cli/src/commands/cultivate.ts` (base resolution + wave loop) · **Status:** fixed-this-session (tsc/build/dry-run verified; behavioral validation needs a real multi-wave run)
- **Root cause:** post-22351c3 every leaf worktree was cut from the run-start BASE; wave-N leaves editing files created by waves 1..N-1 hit missing files, recreated them, then merge-conflicted.
- **Fix:** `base` re-resolved (`resolveBase(targetDir) ?? base`) after each wave's `integrateLeafBranches` when anything merged — later waves fork from post-integration HEAD.

### B14 — ENGINE: Bash-created files permanently destroyed at worktree teardown
- **Severity:** high · **Anchor:** `cli/src/commands/cultivate.ts` (`autoCommitLeaf`) · **Status:** fixed-this-session (tsc/build/dry-run verified)
- **Root cause:** autoCommitLeaf staged only SDK-tracked Write/Edit artifact paths; Bash-scaffolded files (npx create-*, codegen, cp) were unstaged, then erased with the worktree while the leaf still reported FRUIT_READY. The F4 artifact-scoping rationale (cross-leaf absorption) only applies to a SHARED tree.
- **Fix:** new `privateTree` flag on `autoCommitLeaf`; worktree mode stages `git add -A` (safe — tree is private to the leaf), legacy shared-tree path keeps F4 artifact scoping. Empty-diff bail preserved, so no-op leaves still skip the commit.

### B15 — ENGINE: merge-conflicted leaves stayed `status=done` and cultivate exited 0
- **Severity:** high · **Anchor:** `cli/src/commands/cultivate.ts` (wave-integration conflict path + conflict summary) · **Status:** fixed-this-session (tsc/build/dry-run verified)
- **Root cause:** leaf wrote `done` at completion, before post-wave integration; the conflict path persisted nothing and never set an exit code — unmerged work was invisible to ddp/harvest/dashboard.
- **Fix:** on integration conflict, `writeLeafState` flips the leaf to `status: "conflicted"` with additive `integrated: false` + `conflict_files` (rule #9 preserved — additive only); conflict summary sets `process.exitCode = 1` (exitCode, not exit(), so the report still prints). Harvest naturally treats non-`done` as not ready — both the direct match and the sub_agents rollup check `=== "done"`.

### B16 — harvest never exited non-zero on threshold miss
- **Severity:** medium · **Anchor:** `cli/src/commands/harvest.ts` (threshold-miss branch) · **Status:** fixed-this-session (live-verified: `-t 0.8` on audit-run → exit 0; `-t 2` → exit 1)
- **Root cause:** threshold-not-met branch only printed; ddp halts stages on non-zero exit, so a failed harvest proceeded to serve and declared victory.
- **Fix:** `process.exitCode = 1` on miss (after the miss message; merge-order suggestion + cost rollup still print). Callers checked: ddp spawns harvest as a stage (halt-on-nonzero is the desired coupling); cultivate.yml CI inherits the same, correctly failing the action.

### B9 — `heal-budget.ts` was dead code; `budget_exhausted` termination unreachable, `--max-budget-usd` a no-op
- **Severity:** high · **Anchor:** `heal-loop.ts` (cost block), `orchestrator.ts` (maxBudgetUsd), `heal-budget.ts` · **Status:** fixed-this-session (tsc/build/vitest verified; live validation on next `--autofix` run)
- **Root cause:** `resolveBudget`/`trackCost` imported nowhere; loop hardcoded `iterationCost = 0`, orchestrator defaulted `maxBudgetUsd ?? Infinity` — condition 3 could never trip; unbounded autofix spend.
- **Fix:** orchestrator resolves the cap via `resolveBudget(flag, yaml budget.maxUsd)` (flag > yaml > env > $50 default; new regex `readYamlBudgetMaxUsd` mirrors readOrganismName's no-dep posture). Heal-loop measures per-iteration cost as the delta of `extractTotalCostFromEvents(cultivationDir)` (new export summing cost_recorded across ALL run_ids — replant subprocess run_ids are unknown to the loop) and persists via `trackCost` (`.cost.json` ledger). Degrades honestly: no telemetry upgrades → cost 0 → iteration/no-progress caps still bound the loop. **Behavior change (named):** autofix without any budget config is now capped at $50, not unbounded — that's the point.

### B11 — `validateFinding` never called at ingest — malformed findings flowed into counts/aggregation; invalid finding.json read as a PASS
- **Severity:** medium · **Anchor:** `cli/src/lib/audit/testers-runner.ts` (ingest) · **Status:** fixed-this-session (tsc/build/vitest verified)
- **Root cause:** ingest was `JSON.parse(raw) as Finding` with no guard (NUTRIENTS §1 promises one); out-of-union severity → NaN counts + "minor" downgrade. Worse: the parse-error path left `exit_code` at 0 — a tester that emitted a malformed failure report was recorded as *passing*.
- **Fix:** `validateFinding` enforced at the single ingest chokepoint (after the B3 id recompute, so validateId checks the framework's hash); parse/validation failures now set `exit_code = 2` (tester_error per the TesterResult contract) and log to stderr + parse-error.log.

---

## Likely-fixed-pending-validation

### B8 — PR #3 shared-tree commit races: `dashboard.canvas.multiverse` artifact-path attribution mismatch + four `dashboard.cli.*` leaves "0 files committed"
- **Severity:** medium · **Anchor:** `origin/feat/dashboard-cache-net:HANDOFF.md` (open follow-ups 5-6/7); root cause site was the shared-tree artifact staging removed by `22351c3` · **Status:** likely-fixed-by-0.1, pending live validation
- **Root cause:** all leaves shared one working tree; per-leaf `git add <artifacts>` raced, so overlapping/mis-attributed artifact paths produced empty commits or wrong-branch attribution (same family as run8's talent-onboarding loss). Worktree isolation per leaf (backlog **0.1**, commit `22351c3`, this branch) removes the shared tree entirely.
- **Validation plan:** run a small multi-leaf cultivation that intentionally declares overlapping artifact paths; confirm loud merge conflict instead of silent loss, then move to Closed. (Caveat: the dashboard code itself still lives only on the unmerged PR #3 branch.)

---

## Closed

### B1 — heal-loop F1 reset: replant saw leaves as `done`, produced 0 files
- **Severity:** high · **Anchor:** `cli/src/lib/audit/sporenet-integration.ts` (`resetBiomeLeaves`) · **Status:** FIXED `c01769d` (2026-05-13)
- Cultivate's F1 skip-already-done semantics blocked heal-loop replant; `resetBiomeLeaves(stateDir, biomeId)` flips matching leaves done→pending before each spawnCultivate (atomic temp/rename, serialized on the audit-state chain).

### B4 — `writeSummary` async-without-await on the non-autofix path; process exited before temp/rename
- **Severity:** medium · **Anchor:** `cli/src/lib/audit/orchestrator.ts` · **Status:** FIXED `c01769d` (2026-05-13)
- One-character `await`; autofix masked it because the heal-loop kept the event loop alive.

### run8 bugs 1 & 2 — `sporenet/state.json` never written during cultivate; parallel-leaf commit-attribution race
- **Anchor:** root `HANDOFF.md` 2026-05-09 entry · **Status:** FIXED 2026-05-10 (`ensureSporenetState` + serialized atomic writes; artifact-scoped staging), race root cause then **eliminated structurally** by worktree isolation (`22351c3`).

---

## Fix-order notes

- **B5's fix unblocks trust in `zero_criticals`** — and B3's stable ids are what make B5's re-run findings comparable across iterations. Both landed this session; the next live `--autofix` run validates them together.
- **B9 before any long-leash autofix**: until heal-budget is wired, `--max-budget-usd` is decorative and multi-iteration autofix spend is unbounded.
- **B13/B14/B15 are the worktree-isolation follow-up set** — 0.1 (`22351c3`) fixed the attribution race but introduced/exposed these three; they gate trustworthy wave-gated app builds under worktree mode.
- **B15 + B16 together** are what let `mycelium ddp` declare victory on unshipped work; fix as a pair for honest pipeline exit codes.
