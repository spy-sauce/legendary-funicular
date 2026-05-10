# Mycelium (legendary-funicular) — Handoff Log

> Reverse-chronological. Top entry is most recent. Wrap each session via `/wrap` skill (when installed) or append manually.

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
