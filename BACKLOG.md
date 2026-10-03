# Mycelium — Master Backlog (overnight-engine condensation, 2026-07-08)

> Condensed from `docs/BACKLOG-parked-2026-06-16.md`, `docs/BUGS.md`, `HANDOFF.md`
> (merge-wave plan, 2026-07-02), and the two wishlists. Every item carries evidence
> actually read this session. Statuses updated in place as the run executes.
>
> **Execution constraint (repo CLAUDE.md, overrides the engine skill):** no git
> mutations from this session — orchestrator/operator owns commits and branches.
> All work below is working-tree only; no `backlog/*` branches, no commits, no PRs.
> New framework tests only inside the vitest carve-outs.

## Ground-truth notes (drift found while grounding)

- `docs/BUGS.md` **Open section is empty** — B2/B3/B5/B6/B7/B9–B19 all fixed and
  committed (`887fe93`…`8705636`, verified via read-only `git log`). HANDOFF's
  "working-tree only" framing is stale: the branch is clean and pushed.
- The single remaining Tier-0 gap is **running** the eval baselines — `mycelium eval`
  is built and committed but was never executed end-to-end (`HANDOFF.md` 2026-07-02:
  "Not yet run end-to-end"). Refusal gate #1 (no touching the `query()` chokepoint
  at `cultivate.ts:598`) stays closed until baselines are accepted.

## Tier 0 — execute tonight

| # | Item | Evidence | Verify criterion | Status |
|---|------|----------|------------------|--------|
| T0.1 | Rebuild CLI + full verification suite | `evals/README.md:12` — "eval executes the current built CLI. Build first, always." | `npm run build` clean · `tsc --noEmit` clean · vitest all green | **done** — build clean, TSC clean, `31 passed (31)` |
| T0.2 | Run `eval run --task lane-b-noop` (3 trials, ~$0.10–0.30) | `evals/tasks/lane-b-noop.yaml` gate `pass_caret_k: 1.0` | summary.json exists, pass^k = 1.0 | **done** — 3/3 pass, pass^k 1.0, $0.3592, 25.0s wall, gates ✓; baseline ACCEPTED 2026-07-08T16:40:01Z |
| T0.3 | Run `eval run --task lane-b-telemetry` (~$0.50–1.50) | `evals/README.md:104` cost table | summary.json exists, judges pass per task gates | **done** — 3/3 pass, pass^k 1.0, $0.4779, 83.8s wall, gates ✓; baseline ACCEPTED 2026-07-08T16:41:47Z |
| T0.4 | Run `eval run --task lane-a-mini` (~$2–6) | same | summary.json exists, judges pass per task gates | **run 1 done, surfaced B20** — 3/3 pass, gates ✓, but cost $0.0000: cultivateLeaf dropped SDK usage, `cost_recorded` never emitted by ANY cultivation (see `docs/BUGS.md` B20). Baseline NOT accepted from the $0 run |
| T0.4a | Fix B20 (thread SDK usage/model/cost into `LeafResult` so cost-tracker fires), rerun lane-a-mini, verify nonzero cost | `cultivate.ts` stream loop + `cost-tracker.ts:64`; runner note "no cost_recorded events" in run-1 summary.json | tsc/build/vitest green · rerun shows `cost_recorded` events + nonzero total cost · then accept baseline | **done** — rerun 3/3 pass, $0.4709 total; `cost_recorded` verified in trial events (docs-agent $0.0799 + code-agent $0.1116, model claude-opus-4-5); baseline ACCEPTED 2026-07-08T16:50:14Z |
| T0.5 | `eval baseline accept` for each task that met its own gate | HANDOFF wave-2 plan: "run + accept eval baselines (≥3 tasks) — the gate-opener"; README calls accept human-in-the-loop → accepting ONLY clean 3-trial runs, operator can re-accept | `eval baseline list`/`report` shows accepted baseline per green task | **done** — all 3 baselines accepted (noop 16:40:01Z · telemetry 16:41:47Z · lane-a-mini 16:50:14Z from the post-B20-fix run). **Refusal gate #1 is OPEN**: chokepoint work (Router phase 1 / PR #3 cache rework) may now proceed with regression attribution |

Rationale: this is the gate-opener for wave 3 (PR #3 rework) and the Router plan.
Small, unambiguous, sanctioned as "next session" work in HANDOFF. Spend ceiling ~$8
across all three tasks, each trial hard-capped by task `budget.max_usd`.

## Tier 1 — clear-seed items, no git needed

| # | Item | Evidence | Verify criterion | Status |
|---|------|----------|------------------|--------|
| T1.1 | Reconcile `docs/mycelium-eval-spec.md` with the shipped implementation: stale `pass_at_3`/`pass_caret_3` gate keys (spec:105-106) vs frozen `pass_at_k`/`pass_caret_k` (loader-enforced), and worktree-per-trial (spec:139) vs shipped scratch-dir isolation | grep hits at spec:105,106,139,150,204; `evals/README.md:45` documents the deliberate override | Dated addendum in spec doc naming every superseded point (approach refined during execution: body kept verbatim as historical spec, addendum at top redirects to `types.ts` + `evals/README.md`) | **done** — "As-shipped addendum — 2026-07-08" added after Status header |
| T1.2 | Update `docs/BUGS.md` + BACKLOG addendum with tonight's eval-baseline outcome | BUGS.md:17-19 open decisions block | BUGS.md/BACKLOG addendum reflect run results | **done** — B20 entry added to BUGS.md (found+fixed+live-verified); dated addendum line added to `docs/BACKLOG-parked-2026-06-16.md` |

## Tier 2 — parked (operator decision / git ops / design work)

| # | Item | Why parked | Question for the operator |
|---|------|-----------|---------------------------|
| T2.1 | Merge wave 1: PR #4 → main; push+PR+merge `feat/engine-tier0-worktree-iso`; delete `feat/section-h-security` + 22 `feat/audit.*` leaf branches | Git mutations — repo rule #1 forbids this session from running them | Execute per HANDOFF 2026-07-02 merge-wave plan; branch is clean+pushed and ready |
| T2.2 | PR #3 fate (rework cache integration, split dashboard half) | Operator decision (parked backlog 1.1); gated on accepted baselines (wave 3) | Merge-behind-eval with cache-path rework, or explicit park? |
| T2.3 | NUTRIENTS §8 `setup_failed` termination reason | Frozen-contract amendment, operator-gated (BUGS.md open decision 1) | Amend §8 union, or keep loud `no_progress`? |
| T2.4 | B8 live validation — small multi-leaf cultivation with intentionally overlapping artifact paths, confirm loud conflict not silent loss | Needs a purpose-built fixture cultivation + real spend; design judgment on pass criteria | Green-light a ~$2-5 validation run? Fixture sketch: 2 leaves both declaring `shared.md` |
| T2.5 | §6.7 intent→capability spike + §6.8 harm-vs-cost gate design | Research/design tier by definition (parked backlog 2.1/2.2) | Sequence after wave 3? |
| T2.6 | Wishlist "otherworldly" items (Leaderboard / Harm-Gate / SMS-demo trio) | Aspirational roadmap, gated behind engine consolidation per parked backlog | — |
