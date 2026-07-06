# Mycelium (legendary-funicular) — Handoff Log

> Reverse-chronological. Top entry is most recent. Wrap each session via `/wrap` skill (when installed) or append manually.

---

## [MYC] 2026-07-02 — Tier-0 backlog executed: eval baseline shipped + harvest 0.3 + bugs 2/3/5 + merge-wave plan

**Ultracode session (Fable 5).** Two multi-agent workflows (9-agent deep-dive + 10-agent execution, ~1.6M subagent tokens) executed the parked backlog (`docs/BACKLOG-parked-2026-06-16.md`) concurrently on `feat/engine-tier0-worktree-iso`. Everything below is working-tree only — orchestrator owns commits.

### Executed

- **0.2 eval baseline SHIPPED** (`mycelium eval`, spec phases 1–3): `cli/src/commands/eval.ts` + `cli/src/lib/eval/{types,tasks,metrics,judges,runner,report}.ts` + `evals/` (README, 3 task YAMLs: lane-b-noop / lane-b-telemetry / lane-a-mini, 3 fixtures). pass@1/pass@k/pass^k, hand-rolled YAML validation (no new deps), deterministic judges (tsc/grep/command/contract-v1; llm=skipped, phase 4), baselines with explicit `baseline accept`, regression delta incl. ±20% cost gate. **Design override (named):** trials use scratch dirs + git-init'd fixture copies under gitignored `.mycelium/evals/`, NOT worktree-per-trial — post-22351c3 cultivate owns repo-global `feat/<leafId>` worktrees/branches; worktree trials would collide. Eval executes the CURRENT built CLI; `pinned_commit` is provenance. **Not yet run end-to-end** (real SDK spend) — next session: `cd cli && npm run build && node dist/index.js eval run --task lane-b-noop`, then author baselines. Refusal gate #1 remains closed until baselines are accepted.
- **0.3 harvest ID-namespace fix**: mirrored PR#3's validated `310ea12` prefix-rollup onto `harvest.ts:110+`, then operator extended it with a `sub_agents`-declared rollup (covers leaf ids that don't derive from biome id, e.g. `audit-heal-loop` → `audit.heal.iteration`). Deliberately richer than `310ea12` → small deliberate conflict at PR#3 merge; keep this branch's version.
- **1.2 bugs 2/3/5 fixed** (all located + root-caused): Bug 2 `heal-iteration.ts` no_progress now self-contained (`findings_out >= findings_in`, prevRecord guard dropped). Bug 3 summary removed from finding-id hash (findings.ts + NUTRIENTS §1 amendment lines 22/37 + tester prompt) **plus framework-side id recompute at ingest** (testers-runner) — LLM hash arithmetic now irrelevant. Bug 5 heal-loop threads `iterations/<n>/` into re-test runs + stale `finding.json` rmSync — root cause was stale-artifact reuse, not skipped re-runs (HANDOFF's earlier framing superseded).
- **1.2 tracker**: `docs/BUGS.md` — 18 consolidated entries (B1–B18): fixed-this-session (B2/B3/B5/B6-harvest), likely-fixed-by-0.1 pending live validation (B8 multiverse + dashboard.cli 0-files), open engine risks found by the deep-dive (fixed BASE across waves; Bash-created files destroyed at worktree teardown; conflicted leaves stay `done` + exit 0 → ddp/harvest treat unmerged work as shipped; SIGINT skips cleanup; harvest never exits non-zero; heal-budget.ts + autofix-branch.ts are dead modules — budget_exhausted unreachable).
- **Hygiene**: CELLULAR-MAP.md regenerated (audit-run scope, by hand); `agent.ts:15` lifecycle comment fixed to frozen 6-state; BACKLOG got a dated status addendum. Rule-#5 carve-out, HANDOFF reconciliation, and ci-vs-ddp doc (ARCHITECTURE.md) were already in the working tree pre-session.

**Verified:** tsc --noEmit clean · `npm run build` clean · vitest 31/31 · `eval --help`/`run --help`/`report` smoke pass · all 3 task YAMLs load via compiled `loadAllTasks`. Audit bug fixes are tsc/build-verified only (no behavioral test exists for audit/*) — level 3-4, honest.

### Deep-dive verdicts (full gap map in workflow outputs; key items)

- **Chokepoint MOVED: `cultivate.ts:480` → `:598`** (query() inside cultivateLeaf, post-22351c3). Re-anchor all governance language to the symbol, not the line.
- Worktree isolation (0.1) verified real: BASE-pinned worktrees, unserialized per-leaf commits, single-threaded post-wave `merge --no-ff` with loud attributed conflicts; CommitQueue repurposed for shared-.git ops only. Zero inter-leaf signaling confirmed — BIOME BUS/mesh remains aspirational; the six-signal bus exists only in the disconnected impl/ embeddings.
- Vapor vs docs: no Router, no TCF, no §6.7/§6.8 (whitepaper only on PR#4 branch), no contract-test generators, no hooks, **no `mycelium brief`** (documented in CLAUDE.md but exists on no branch), no versioned release story (phantom `@vibespace/mycelium-core` import in agent.ts).

### Merge waves (verified via read-only git; conflict surfaces hunk-checked)

1. **Wave 1 (now):** PR #4 (docs-only, zero conflicts) → main. Push + PR + merge `feat/engine-tier0-worktree-iso` (0.1 + this session's work). Delete `feat/section-h-security` + 22 local `feat/audit.*` leaf branches (all merge-base-confirmed ancestors of main).
2. **Wave 2:** run + accept eval baselines (≥3 tasks) — the gate-opener. Keep 34 `feat/cache.*`/`feat/dashboard.*` origin leaf branches until PR#3 resolves.
3. **Wave 3 (gated on accepted baselines):** PR #3 — must push its 11 unpushed local commits, rebase onto post-0.1 main, and **REWORK (not merge) the cache integration**: its cache-hit replay path commits via `autoCommitLeaf(leaf, targetDir,...)` on the shared tree — bypasses worktrees/branches and reintroduces the exact race 0.1 kills. Hard textual conflict too (cache wrap at base :482/:515 sits inside the 0.1 rewrite; both insert at :328). Optional de-risk: split the dashboard-only half (no cultivate.ts contact) and merge it in wave 2.

### Suggested commit batching (operator)

1. `MYC/EVAL: mycelium eval — pass@k baseline harness (backlog 0.2, spec phases 1-3)` — cli/src/lib/eval/, cli/src/commands/eval.ts, cli/src/index.ts, evals/
2. `MYC/HARVEST: biome rollup for cellular organisms (backlog 0.3)` — cli/src/commands/harvest.ts
3. `MYC/AUDIT: close bugs 2/3/5 — no_progress, id-hash sans summary + ingest recompute, iteration-dir threading` — cli/src/lib/audit/, NUTRIENTS.md
4. `MYC/DOCS: BUGS.md tracker + CELLULAR-MAP regen + backlog addendum + lifecycle comment` — docs/BUGS.md, CELLULAR-MAP.md, docs/BACKLOG-*, cli/src/commands/agent.ts
5. Pre-existing working-tree docs (CLAUDE.md carve-out, ARCHITECTURE ci-vs-ddp, HANDOFF reconcile, wishlists, whitepaper) — batch per operator preference.

### Gotchas

- NUTRIENTS.md §1 was amended (frozen contract — backlog-authorized, exactly the two id-hash lines). Two different defects at the same tester+biome+file+line_range now dedupe to one id — accepted trade-off.
- Spec doc's gates keys (`pass_at_3`) ≠ frozen contract (`pass_at_k`) — loader enforces the frozen names; update spec doc eventually.
- `eval report --json` stdout carries the boxen banner (index.ts preAction) — consume `summary.json` files for machine reads.
- Lane A cost capture needs telemetry-emitter + cost-tracker upgrades enabled in the fixture (they are); otherwise cost=0 with a note.
- Open engine risks B13–B16 (fixed BASE, Bash-file loss, conflicted=done+exit-0, SIGINT cleanup) are real correctness holes in 0.1 — tracked in BUGS.md, none blocks wave 1, but B13/B15 deserve fixes before the next multi-wave real-client run.

---

## [MYC] 2026-05-16 — dashboard + cache-network cultivation shipped (PR #3)

> Reconciled 2026-07-02 from `feat/dashboard-cache-net`'s HANDOFF.md (this entry previously existed only on that branch; the code it describes still lives ONLY there — PR #3 remains open/unmerged).

**Massive session.** Dogfood cultivation of the operator dashboard AND the cache-network runtime, in one parallel build.

### What landed

Branch `feat/dashboard-cache-net`, PR #3 (https://github.com/spy-sauce/legendary-funicular/pull/3). 40 commits, 47 files changed, +11,304 / -930.

- **`mycelium dashboard {init,serve,render}`** — cryogenic operator console. Three.js Bloch-sphere agents on a fibonacci globe, **cache relay inner shell** (cyan-teal `#1E9EBF` octahedrons at r=2.6), multiverse view, Star Wars HUD overlays, slow-pulse discipline (≥1.5s, no fast blinks). Per-cultivation `theme.yaml` molds palette + brand + biome→identity-color map. `serve` re-reads state.json + theme.yaml every request; SSE event stream at `/events/stream`.
- **`cli/src/lib/cache-network/`** — LRU `CacheStore` wraps SDK calls at `cultivate.ts:480` (chokepoint located via `query()` grep). `--no-cache` flag for bypass. JSONL events: `cache.hit` / `cache.miss` / `cache.evict` / `cache.pulse` (1.4s aggregation). `state.cache` additive block on `sporenet/state.json`.
- **`cli/src/lib/micro-agents/spawn.ts`** — deterministic 2-4 micro fan-out per leaf via xorshift seeded from sha256(leafId). 70/30 cheap/full split (50/50 if critical severity).
- **`templates/dashboard.html`** — 5292-line single-file dashboard. Three.js CDN-loaded. Reads `window.__DASHBOARD_STATE__` + `window.__DASHBOARD_THEME__` inlined by `cli/src/lib/dashboard/render.ts`.
- **`docs/cache-network-micro-agents.md`** + **`docs/dashboard-theming.md`** + **`DEVELOPER_GUIDE.md`** Dashboard + Cache-Network sections.

### Cultivation stats

- 10 biomes, 43 sub-leaves, 7 frozen NUTRIENTS sections, contract-freeze gating
- Frozen 2026-05-16T08:40:49.410Z (via `--skip-audit` per audit-run precedent — framework-internal cultivation has no app-stack)
- **First cultivate attempt at -c 30: 0/43 (all rate-limited).** Anthropic API rate limit hit ~25s in, every leaf returned `API Error: Rate limit reached` after burning $0.40 each (~$17 total).
- **Second attempt at -c 4: 43/43 FRUIT_READY in 1055.7s (~17.6 min).** Concurrency dropped to let token bucket recover between batches; warmed prompt cache.

### Visual reference

v9.4 prototype at `.superpowers/brainstorm/4035-1778891130/content/hybrid-v9.4-cache-relays.html` (gitignored) was canonical visual ground truth. Built dashboard ports it faithfully — bind to state instead of simulator.

### Open framework follow-ups (NOT blocking PR)

- **Harvest threshold check mismatched.** `mycelium harvest` looks for `feat/<biome-id>` branches per `mycelium.yaml agents[].branch`, but cultivate emits `feat/<leaf-id>` branches. Reports 0% threshold even when work is fully on the target branch via CommitQueue. *(This is backlog item 0.3.)*
- **`dashboard.canvas.multiverse` artifact-path mismatch.** Leaf produced 10 files but declared `templates/dashboard.canvas.multiverse.js` as artifact — file didn't exist at that path. Content landed but commit attribution split.
- **Four `dashboard.cli.*` leaves "0 files committed".** Files DO exist on disk; framework's `git add --all -- <declared-paths>` couldn't match. Possibly auto-committed by sibling leaves with overlapping artifact paths. *(Root cause = shared-working-tree race; addressed by worktree isolation, backlog 0.1, commit `22351c3`.)*
- **`mycelium contracts freeze` requires `--stack` flag now.** Audit-run was grandfathered; framework-internal cultivations have no app-stack. `--skip-audit` is the workaround. Long-term: add `stack: framework-internal` preset or scope-relax the freeze audit.

### State at session pause

- Working tree: clean on `feat/dashboard-cache-net`
- PR #3 open: https://github.com/spy-sauce/legendary-funicular/pull/3
- 7 frozen NUTRIENTS sections, 10 HYPHA files, 43 leaf commits + 6 operator-authored commits = 40 commits since main
- `npm link` still active: `/opt/homebrew/bin/mycelium` → repo's `cli/dist`
- Dashboard serve verified live on port 3334 against /tmp/dashboard-test cwd
- `cli && tsc --noEmit` clean

### Cost

- ~$17 burned on the rate-limit attempt (zero output)
- ~$30-40 estimated on the successful -c 4 run (43 leaves × ~$0.80 avg with cache reads)
- Budget: organism `budget.maxUsd: 100`. Well under.

---

## [MYC] 2026-05-13 — audit-run cultivation shipped + first proof-of-life + autofix loop close + next: mycelium-dashboard

**Massive session.** Three things landed back-to-back:

### 1. audit-run cultivation shipped via dogfood

Cultivated `mycelium audit-run` into the framework using `mycelium cultivate` itself. Operator-authored 7 HYPHAs (`audit-{findings,testers,aggregator,heal-loop,sporenet,cli,docs}`), 22 sub-leaves, 10 frozen NUTRIENTS sections. Contract-freeze gating. 22/22 FRUIT_READY in **332s wall-clock** (vs run8's 4.7 hours for 10 leaves — recursion-build was faster than the original real-client build it's modeled on).

Pre-cultivation surgical extraction: `runWithConcurrency` lifted out of `cultivate.ts` (was module-private) to `cli/src/lib/concurrency.ts`. Shared between cultivate.ts and the new audit-run testers-pool. No cultivate.ts public-contract change.

`feat/audit-run` branched off `feat/section-h-security` (since merged to main as PR #1). PR #2 opened with 26 commits at push. Added `.github/workflows/ci.yml` — the framework's first PR-CI DDP gate, runs lint/typecheck/test/build on PR + push to feat/**. Closes the cultivate.yml-only gap.

### 2. First proof-of-life: audit-run vs live-grid-run8

`npm link` made the dev build globally callable. Scaffolded HYPHA-TEST files in run8 (3 testers: `tester.talent-onboarding` from spec §9, `tester.types`, plus path-based biome attribution to make heal-loop routing work).

**Baseline run:** found a REAL critical TS error (`TS2353: 'fonts' does not exist in type 'Theme'` at `src/App.tsx:59`). Independently verified — running `npx tsc --noEmit` manually surfaces the same error. Engine mirrors ground truth. 78.96s wall, exit 1. Schema correct (sha256 ids, severity union, ISO-8601 ts, suggested_fix actionable). The `tester.talent-onboarding` from spec §9's worked example ran clean — that bug was already fixed in run8 by the time we audited.

### 3. Autofix loop closes (after 2 patches)

First `--autofix` surfaced **4 framework bugs** the spec didn't catch:
- **Bug 1** — F1 skip-already-done blocked heal-loop replant (cultivate.ts:158-170 sees leaves as `done`, produces 0 files). **Patched.** New `resetBiomeLeaves(stateDir, biomeId)` in audit-sporenet flips matching leaves done→pending before each spawnCultivate. Atomic temp/rename, serialized on existing audit-state chain.
- **Bug 4** — `writeSummary` async-without-await on non-autofix path; process exited before temp/rename. Autofix masked it because the heal-loop kept the event loop alive. **Patched** with one-character `await`.
- **Bug 2 (open)** — `no_progress` termination doesn't fire per NUTRIENTS §8. Single-file fix in `heal-iteration.ts:evaluateTermination`.
- **Bug 3 (open)** — Finding SHA dedupe fragile; LLM-authored `summary` varies between runs → different ids → no dedupe. Needs NUTRIENTS §1 contract amendment (drop `summary` from id hash).
- **Bug 5 (open)** — heal-loop's `runTestersFn` doesn't actually re-run testers; re-emits baseline findings. Iter dirs lack `testers/` subdirs. Affects automatic termination on success.

**End-to-end loop close validated:**
- Baseline → 1 critical (exit 1)
- `--autofix` → heal-loop reset state, cultivate spawned, leaf produced 5 files including App.tsx fix, committed as `4180d40` in live-grid-run8
- Manual `tsc --noEmit` → exit 0, clean
- Fresh baseline → 0 findings, exit 0, summary.json present

**The recursive build of the recursive tool worked.** audit-run cultivated itself, then audited real code, found a real bug, fixed it via heal-loop, re-verified clean. Receipt at `live-grid-run8/audit/2026-05-11T23-18-20-546Z/framework-findings.md`.

**PR #2 state:** 27 commits, last is `c01769d` "audit-run: heal-loop F1 reset + writeSummary await — closes the autofix loop". CI status visibility blocked by PAT scope but workflow should be firing.

### State at session pause

- Working tree: clean on `feat/audit-run`
- PR #2 open: https://github.com/spy-sauce/legendary-funicular/pull/2
- Open framework bugs: 2, 3, 5 (separate follow-up PRs)
- 3 spec docs from prior session live + 1 new (`docs/mycelium-audit-run-spec.md`)
- `npm link` is active: `/opt/homebrew/bin/mycelium` → this repo's `cli/dist`

### Next planned: mycelium-dashboard cultivation

**SPY direction:** cultivate dashboard feature next, BEFORE (b) cloud deploy of DDP architecture.

**Reference designs:**
- `/Users/spy/mfautomation/mycelium-network.html` — animated canvas + organic curved hyphae + nutrient-dot particles + node-on-hover info panel; Bloom-branded but concepts are general
- `/Users/spy/mfautomation/mycelium-dashboard_1.jsx` — lifecycle-colored agents (germinating/growing/flowing/fruiting/dormant), categorized event stream w/ severity styling, metric cards, alert rings, provider tags, simulated event generator

**Decided design:**
- **Approach:** dogfood cultivation (same path as audit-run)
- **Molding:** per-cultivation `theme.yaml` — each cultivation owns its theme (palette + brand + biome→node-type+color+icon mapping + lifecycle colors)
- **Sequence:** dashboard → (b) cloud deploy

**Open scope questions for next session:**
- Biome decomposition: likely 7-9 biomes — `theme-system`, `canvas-network-renderer`, `event-stream-feed`, `metric-cards`, `alert-ring`, `sporenet-routes`, `dashboard-cli` (init + render subcommands), `dashboard-docs`. Possibly split rendering by surface (network/events/metrics) or unify.
- NUTRIENTS contracts to draft: theme.yaml schema, dashboard route shape, event stream API, metric card data contract, alert envelope, biome→node-type mapping function, lifecycle color tokens, network viz JSON shape (consumed by canvas).
- Per-cultivation theme.yaml stub example: should `mycelium init` emit a default theme.yaml? Or only `mycelium dashboard init`? Lean: init emits minimal default, dashboard init customizes.
- Does this overlap meaningfully with the Router 30-day plan (Lane B `mycelium llm` provider tags)? Worth noting that the dashboard.jsx file already has Claude/Ollama/GPT-4o/Haiku/Gemini provider tags — the dashboard is a natural surface for whatever Router ships.

**Gotchas:**
- `feat/audit-run` PR #2 is still open; dashboard cultivation should branch off a fresh point (either main once #2 merges, or stack on feat/audit-run if PR linearity matters less). Sean Patrick gate may apply.
- The 3 open audit-run bugs (2, 3, 5) live in this PR's domain but were not patched here. They don't block dashboard work but should be tracked.
- The "molding" mechanism is the design crux. theme.yaml needs to be expressive enough to cover the file-1 Bloom case AND the file-2 mycelium dashboard case AND future cultivations like LiveGrid. Don't over-fit to either reference design.
- live-grid-run8 has uncommitted state from the autofix run (the App.tsx fix in commit `4180d40`, plus 3 HYPHA-TEST files I wrote: talent-onboarding, types). Likely fine to leave as run8's own concern.

---

## [MYC] 2026-05-10 — ECC adoption analysis → 3 spec docs + rule #5 disambiguation

**Context:** Analyzed `affaan-m/everything-claude-code` (182 skills, 68 commands, ECC2 Rust core) against Mycelium for adoption candidates. Mycelium and ECC are doing overlapping work on different axes: Mycelium = orchestration (many agents, one product), ECC = harness optimization (one agent, many sessions). Mycelium is language-agnostic at the cultivation-output layer; ECC is more harness-portable (CC, Codex, Cursor, Opencode, Gemini). Complementary, not competitors — most of ECC's 130+ stack-specific skills are dead weight from a Mycelium perspective; a small slice is directly load-bearing.

**Strongest direct hits identified:**
- Ralphinho/RFC-DAG pattern (`autonomous-loops` skill) — validates the worktree-isolation + merge-queue-with-eviction approach already sketched in the 2026-05-09 entry for run8 bug 2.
- `silent-failure-hunter` agent — would have caught run8 bug 2 in a post-cultivate verification stage.
- `agent-eval` + `eval-harness` skills — pass@k / pass^3 metrics; Mycelium has zero formal reliability data today.
- `ai-regression-testing` skill — sandbox-mode contract tests; the AI-blind-spot framing applies directly to harvest's `-t 0.8` heuristic.
- ECC PreToolUse hooks (config-protection, no-git, fact-force) — would *enforce* CLAUDE.md prose rules instead of relying on the leaf to obey them.

**Shipped (uncommitted, advisor-reviewed):**

1. **`CLAUDE.md` rule #5 disambiguation** — both framework block (line 81) and cultivation block (line 122). Splits "don't write tests" into *tests for the framework repo itself* (still no) vs. *tests inside cultivated apps* (first-class outputs, e2e/contract/smoke/regression). Hard precondition for #2 and #3 below — without this, every leaf hits the rule and rationalizes around it.

2. **`docs/mycelium-eval-spec.md`** (299 lines) — `mycelium eval` command spec with Lane A (full cultivate) / Lane B (single-leaf) / Lane C (Router-only) eval modes; YAML task definitions; pass@1 / pass@3 / pass^3 metrics; `git worktree`-per-trial isolation; 4-phase build plan totaling ~6 days. **Sequencing claim: must ship before Router phase 1 changes `cultivate.ts:480`** — without a baseline, leaf-completion regressions cannot be attributed to Router vs model drift vs prompt drift.

3. **`docs/contract-tests-from-nutrients.md`** (304 lines) — generates contract tests from `NUTRIENTS.md` frozen stubs at harvest time; replaces (or composes with) the `-t 0.8` file-count heuristic. Six initial generators map to NUTRIENTS §1–6 (event_schema, ddp_stages, upgrade_interface, sporenet_state, server_routes, gh_action_io). Would have caught run8 bug 2 (talent-onboarding's missing `leaf_fruited` event) before anyone inspected git history. 3-phase plan, ~3.5 days. Composes cleanly with the eval spec via a `contract` judge type.

4. **`docs/hooks-via-agent-sdk-scoping.md`** (209 lines) — **scoping research only, not build-ready.** Open question: does `@anthropic-ai/claude-agent-sdk` expose hook callbacks rich enough to host ECC's PreToolUse content (especially *blocking* semantics for config-protection, no-git, fact-force)? Includes 4-step investigation plan + decision gate that must clear before any hooks code lands. Identifies escape hatches (custom Bash tool replacement, transformPrompt augmentation, Router Lane B as the multi-harness path).

**State:** Repo on `main` (post `60f5822`); 4 uncommitted file changes (1 modified + 3 new). Advisor reviewed; cross-references between docs resolve correctly; phasing grounded in real line numbers (`harvest.ts:129,169`, `cultivate.ts:480`). Build-readiness: #2 and #3 are build-ready; #4 is scoping-only and gates further work behind evidence.

**Next action:** SPY decides commit shape (likely 4 commits: `MYC: CLAUDE.md rule #5 disambig` + 3 separate `MYC/SPEC` commits matching the 2026-05-06 entry's batched-by-concern pattern). Then choose whether to start build on #2 (eval) immediately, given the Router-phase-1 sequencing constraint.

**Open questions (carried forward):**
- Hooks scoping decision gate (4 investigation steps in `docs/hooks-via-agent-sdk-scoping.md`). Outcome determines whether hooks adoption is a small EASY-tier port (~5 days) or a re-plumbing project that should defer to post-Router-Lane-B.
- Operator HYPHA dogfood angle (carried from 2026-05-06 entry): if `mycelium eval` is built via cultivate-via-Mycelium, the eval-harness payload *is* the natural Operator HYPHA first cultivation. Not surfaced inside the eval spec (kept tight to build); revisit if SPY wants to dogfood.
- Whether contract tests should default-on or opt-in for cultivations *without* tagged NUTRIENTS contracts. Spec leans default-on when tags exist, fully back-compatible when they don't.
- Does `--contract-threshold` replace `-t 0.8` over time or compose with it indefinitely? Current spec leans compose; could simplify post-confidence.

**Files touched:**
- `CLAUDE.md` (modified — rule #5 in two places)
- `docs/mycelium-eval-spec.md` (new)
- `docs/contract-tests-from-nutrients.md` (new)
- `docs/hooks-via-agent-sdk-scoping.md` (new)

**Gotchas:**
- The eval spec's "must land before Router phase 1" is a real constraint, not a preference. Once Router phase 1 changes the chokepoint, attribution of any future leaf-completion regression is permanently lost. Don't let Router phase 1 ship without at least 3 capability tasks + accepted baselines.
- Rule #5 disambiguation has to merge *first* of the four. If #2 or #3 land without it, leaves working on the contracts/eval will hit the original rule and either skip or rationalize.
- The hooks scoping doc is explicitly *not* a build plan — its decision gate is the deliverable, not adoption itself. Resist the temptation to start porting hooks before the gate clears; the SDK plumbing question may turn it into a re-plumbing project that's a worse use of cycles than expanding Router Lane B.
- Five uncommitted artifacts now exist (2 from prior session per the 2026-05-06 entry plus these 4 from this session). Single bad checkout could lose substantial work. Commit early next session.

---

## [MYC] 2026-05-09 — Two cultivate bugs surfaced by first real-client `mycelium ddp` run (live-grid-run8)

**Context:** First end-to-end test of `mycelium ddp` on a real client workload (LiveGrid v1 demo, 10 biomes, expo-supabase, demo tier, concurrency 30). Run executed staged (plant → audit → freeze → cultivate → harvest) so the Sean Patrick gate could be honored mid-pipeline. Cultivate produced 252 files across 10 leaves over ~4.7 hr wall clock (vs commit `0649686`'s ~70 min estimate — 4x miss). Logs at `/Users/spy/mfautomation/repos/live-grid-run8/logs/2026-05-09T19-58-28-096Z/`.

**Two bugs surfaced. Both are blockers for trustworthy DDP single-call mode and worth fixing before another real-client run.**

### Bug 1: `sporenet/state.json` never written during cultivate

**Symptom:** After cultivate exited cleanly with `🍄 The organism is alive! 10/10 leaves FRUIT_READY · 252 files produced`, `sporenet/state.json` did not exist on disk. `sporenet/` directory was empty.

**Impact:**
- `mycelium harvest -t 0.8` reads `state.json` as truth source (per commit `b025562 [MYC] harvest reads sporenet/state.json as truth source`). With state.json missing, harvest's threshold check claimed only 2/10 leaves were FRUIT_READY, refused to merge anything, returned `⚠️ Harvest threshold not met: 20% < 80%`. Bogus verdict — see bug 2 for why nothing needed merging anyway.
- `sporenet serve` dashboard cannot render — no source data.
- User asked during the live run: "can we change the framework to have sporenet update in real time" — exactly this gap.

**Proposed fix:** `cultivate.ts` already tracks per-leaf state internally (it prints the `🌱` / `🍄 FRUIT_READY` lines we observed). Emit incremental writes to `sporenet/state.json` on each per-leaf state transition (`pending` → `growing` → `fruiting` → `done | failed`). Atomic rename or per-leaf file lock needed since multiple leaves transition concurrently at concurrency 30. Sister doc to commit `b025562`'s read pattern.

**Also nice-to-have:** persist a `wall_clock_total_seconds` (real wall clock by max-path through DAG, not sum of leaf durations) so harvest + dashboard can show accurate cultivation timing.

### Bug 2: parallel-leaf race condition in commit attribution

**Symptom:** `feat/talent-onboarding` branch was never created. talent-onboarding's 26 files (per cultivate's own report) were committed under `feat/discovery`'s commit `557eb7e` on `main`. Specifically `src/screens/onboarding/talent/TalentOnboardingCompleteScreen.tsx` shows up under DISCOVERY's commit message.

**Theory:** discovery and talent-onboarding ran in parallel in wave 3, sharing the same working tree. Discovery hit `git add . && git commit` while talent-onboarding had already written some files to disk → discovery's commit picked up those files. talent-onboarding's `git commit` step either ran on an empty diff (because discovery already grabbed the files) or never executed (perhaps because the planner saw "clean working tree" and skipped). cultivate event log showed `✔ 🍄 talent-onboarding FRUIT_READY (26 files, 7552.0s)` **without** the `· committed (no remote) feat/talent-onboarding` suffix that all 9 other leaves had — pointing at a commit-step skip.

**Impact:**
- Files-on-disk are correct. Functionally the cultivation succeeded — all 252 files exist on `main` and `package.json` builds.
- But the per-leaf branch isolation that harvest assumes is broken. In a future run where harvest's merge conflicts matter, this race could overwrite or lose files (e.g. if buyer-onboarding wrote `SelfTalentProfileScreen.tsx` and talent-onboarding wrote a different version of the same file, last-writer-wins silently).
- The 9-out-of-10 feat branches that DID get created are also redundant with main (each commit appears identically on its feat branch and on main). Suggests the branch-isolation model isn't working for parallel leaves at all.

**Proposed fix (sketch — needs design pass with Sean Patrick):**
- Each leaf gets its own working-tree clone (git worktree or temp dir) keyed by leaf id. Leaves write/commit isolated.
- Harvest cherry-picks or merges feat branches into main as a separate, single-threaded post-cultivate step.
- This also fixes the "leaves committing to main directly" anti-pattern that's currently happening — main should only receive harvested commits, not in-progress leaf commits.

**Why this matters before more `ddp` runs:** the bug 2 race is silent and stochastic. Two parallel leaves writing different content to the same path = data loss. We were lucky on run8 because most parallel leaves wrote to disjoint subtrees. A future run with more namespace overlap could lose files without any error signal.

### Recommended sequencing
1. Bug 1 fix is small and unlocks the dashboard immediately. Land first.
2. Bug 2 fix is a meaningful refactor of cultivate's git plumbing. Surface design to Sean Patrick before implementation per governance memory (he's framework co-architect).
3. After both: re-test `mycelium ddp` single-call (no staging) on a smaller cultivation to verify end-to-end reliability before the next LiveGrid-class workload.

**State:** Bugs are reported; no framework code changed yet. live-grid-run8 has all 252 files committed to main and is building. `sporenet/state.json` was synthesized post-hoc from cultivate-log evidence in `live-grid-run8/sporenet/state.json` for dashboard purposes — that file is **not authoritative**; it documents what happened, not what cultivate persisted.

**Update 2026-05-10 — both bugs fixed.** Implemented in `cli/src/commands/cultivate.ts` (built clean):

- **Bug 1 fix:** added `ensureSporenetState` helper that seeds `sporenet/state.json` from the leaf list at cultivate start (eliminates the silent-no-op when ddp skips `sporenet init`). `writeLeafState` rewritten to use a serialized promise chain + atomic temp-file/rename so parallel writes never lose each other's updates. Each leaf now writes `status: "active"` + `started_at` at spawn time, so the live dashboard reflects in-flight leaves during the multi-hour cultivate phase rather than only at completion. `cultivate` awaits `drainLeafStateWrites` before exit so final `done`/`completed_at` writes flush.

- **Bug 2 fix:** `autoCommitLeaf` now stages only the leaf's tracked Write/Edit artifacts via `git add --all -- ${artifacts}` instead of `git add -A`. Eliminates the race where parallel leaves' pending work was absorbed into whichever leaf hit the serialized commit queue first (run8's talent-onboarding silently lost its commit to discovery for exactly this reason). Bails early if zero artifacts or nothing actually staged after the add — no empty commits. Smaller-surface fix than the worktree-isolation refactor originally proposed; the artifacts list the SDK already populates is sufficient.

Both fixes will validate on the next cultivate run. Worktree isolation may still be worth implementing later for stronger isolation guarantees (e.g. if leaves ever need to write outside their declared artifacts via Bash), but the minimal fix solves the run8-observed symptom.

**Update 2026-05-10 (later) — two follow-ups also landed:**

- **F5 — `mycelium sporenet serve` renders `/` on-the-fly.** Previously the served `/` was a static `index.html` baked at `mycelium sporenet init` / `render` time; the dashboard's 3s polling refetched the same static page and never saw mid-cultivate state changes. Now `serve`'s `/` handler re-reads `sporenet/state.json` + `mycelium.yaml` on every request and re-runs `renderHtml`, so dashboard updates appear immediately whenever state.json changes. **Validated in run8** by flipping a leaf via `mycelium sporenet mark schema-core --status active` and observing the served HTML update on the next request without a manual render step.

- **F6 — `mycelium ddp` pipeline now includes `sporenet init`.** Inserted between `contracts freeze` and `cultivate`. Gives the dashboard a meaningful baseline (all-pending state.json + index.html as static fallback) the moment cultivate kicks off, so `serve` can run usefully throughout the multi-hour cultivate phase. Cultivate's `ensureSporenetState` from F3 is idempotent — sees state.json exists from init and skips re-seeding, then the F3 active/done writes flow through the F5 live render. ddp banner + description text updated to reflect the new stage order.

**Open questions:**
- Is the existing 9-feat-branch creation actually doing anything useful, or are those branches dead weight that just duplicate main?
- Does talent-onboarding's missing-commit attribution issue happen with discovery specifically, or is it a generic pairwise race that any two parallel leaves could hit?
- Should we add a post-cultivate verification stage that confirms (leaf count) == (feat branch count) == (sporenet/state.json done count) and bails loudly if mismatched?

**Files touched:** none in this repo. Findings sourced from `/Users/spy/mfautomation/repos/live-grid-run8/` (sporenet state, git log, file inventory, cultivate stdout log) and `/Users/spy/mfautomation/repos/live-grid-run8/HANDOFF.md`.

---

## [MYC] 2026-05-06 — Three architecture artifacts landed in `docs/`

**Shipped:** Created `docs/` directory and stored three architecture artifacts:
- `docs/temporal-context-framework.md` — TCF v0.2 spec (memory layer: TRS, decay profiles, HOT/WARM/COLD tiers) plus 2026-05-05 reconciliation notes (candidate answers to v0.2 open questions, four new considerations, Operator HYPHA design as first-cultivation candidate)
- `docs/bus-router-livegrid-architecture-pack.md` — Cee-Ro Opus deep-dive vision (BIOME BUS as routing membrane, Router Brain inside the bus, OpenRouter underneath, LiveGrid as first production workload, 400→10K stress ramp) plus reconciliation notes pairing it with TCF
- `docs/mycelium-router-30day-plan.md` — post-Plan-mode build-ready 30-day phased implementation (router-as-function-call at the cultivate.ts:480 chokepoint, Lane-A Claude tiers + Lane-B `mycelium llm` for full multi-provider, no new deps in phases 1-3) plus reconciliation positioning it as the honest first concrete step toward the Cee-Ro vision

**State:** Repo healthy on main. THREE uncommitted additions awaiting authored commits (CLAUDE.md + HANDOFF.md from 2026-05-04 plus the three doc files from 2026-05-06). The 30-day router plan is build-ready; phase 1 can start once the cultivate-vs-direct decision lands.

**Next action:** Decide cultivate-via-Mycelium vs direct implementation for the 30-day Router plan, then commit all uncommitted additions in batched-by-concern commits (e.g., `MYC/INFRA: CLAUDE.md + HANDOFF`, `MYC/SPEC: TCF v0.2 + reconciliation`, `MYC/SPEC: Architecture pack + reconciliation`, `MYC/SPEC: Router 30-day plan`).

**Open questions:**
- Cultivate-via-Mycelium (dogfood) or direct implementation for the 30-day plan?
- Is Bardot November 2026 launch a hard deadline? (Drives sequencing choice in pack §E.)
- What's the "reserved integration slot" tech in the Cee-Ro pack? (Until named, integration story is incomplete.)
- Sprint vs Marathoners pacing on the post-Session-8 build phase?
- Promote TCF reconciliation §B.1-B.5 into canonical TCF v0.3? (Currently sit as discussion notes, not spec.)

**Files touched:** `docs/temporal-context-framework.md` (new), `docs/bus-router-livegrid-architecture-pack.md` (new), `docs/mycelium-router-30day-plan.md` (new), `docs/` (new directory)

**Gotchas:**
- Reconciliation notes in TCF + Cee-Ro pack are dated discussion artifacts, NOT canonical spec changes. Don't conflate them with v0.2 / v0.3 status. Explicit promotion required.
- The "Intelligent Bus v2.0" thesis (freeze TCF + Router Brain together) was correct as a long-term integration milestone but **wrong as the immediate gate**. Routing ships in 30 days without TCF freeze. Do not block phase 1 on TCF.
- Three architecture artifacts uncommitted simultaneously means a single wrong checkout / reset could lose substantial work. Commit early next session.
- Operator HYPHA design (TCF §D) and LiveGrid (Cee-Ro pack #3) are two competing first-cultivations. Both are valid; unified v2.0 freeze (eventually) lets them cultivate in parallel.

---

## [MYC] 2026-05-04 — Framework/cultivation context disambiguation

**Shipped:** Restructured root `CLAUDE.md` to lead with framework-level overview (stack, architecture-in-30-seconds, commands, where-things-live, vocab, lifecycle, hard rules, IP posture, pointer to mycelium-claude in zip_dbl_cup); preserved the existing ddp-integration cultivation context verbatim as a clearly-delimited second section. Initialized this `HANDOFF.md`.

**State:** Repo healthy on main. ddp-integration cultivation context preserved with no breakage to framework path conventions. `NUTRIENTS.md` and `CELLULAR-MAP.md` at root are also cultivation-scoped — left in place because framework conventions assume them at root.

**Next action:** Pick the next move — continue the ddp-integration cultivation OR shift to framework-level work (likely `impl/java` README polish, sporenet dashboard databind, or fleet view based on most recent commits).

**Open questions:** Long-term — should cultivation-specific artifacts (`NUTRIENTS.md`, `CELLULAR-MAP.md`, `mycelium.yaml`) move to a `cultivations/<name>/` subdir to make framework-vs-cultivation crystal-clear at the file-system level? Would require framework path-handling changes. Defer.

**Files touched:** `CLAUDE.md` (rewrite — framework section added at top, cultivation section preserved below), `HANDOFF.md` (new)

**Gotchas:** The existing `CLAUDE.md` was per-cultivation context that hijacked the repo-level slot — anyone landing fresh inherited cultivation-specific rules as if framework-wide. The new structure fixes that, but if any framework script regenerates `CLAUDE.md`, the framework-level overview will get clobbered. Worth checking before running framework commands that touch root docs.
