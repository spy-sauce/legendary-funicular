# Mycelium Audit-Run — symmetric test cultivation + heal loop

**Status:** Build-ready · 3-phase plan · code-grounded
**Source:** SPY proposal 2026-05-11 · run8 talent-onboarding silent breakage (2026-05-11, distinct from the 2026-05-10-fixed commit-attribution race)
**Stored:** 2026-05-11

---

## 1. Problem statement

Mycelium's completion signals stack today as: **cultivate** ("did each leaf emit `FRUIT_READY`?", via `sporenet/state.json`), **harvest** (`-t 0.8` — "did enough leaves finish?"), in-flight **contract tests** ("did cross-leaf coordination contracts hold?", from `contract-tests-from-nutrients.md`), and in-flight **eval** ("across N trials, does the framework complete at pass@k?", from `mycelium-eval-spec.md`).

None of those answer **does the running organism behave correctly end-to-end against the behaviors NUTRIENTS declares?**

Today's run8 bug, 2026-05-11, is the canonical demonstration. Distinct from the commit-attribution race fixed 2026-05-10 — that one violated a *contract* (each leaf gets its own commit) and would be caught by the contract gate. Today's bug violated a *behavior*:

- All 10 leaves emitted `leaf_fruited` cleanly. Sporenet showed 10/10 done.
- The future `--contract-threshold 1.0` would have passed — `event_schema`, `sporenet_state`, `ddp_stages`, `server_routes` all green.
- Talent-onboarding screens shipped with isolated `useState` per step screen instead of lifted state. `saveTalentProfile()` fired against `INITIAL_STATE` and persisted an empty `talent_profiles` row. The 8-step wizard collected zero user data.
- The app builds. The leaf passed. The flow silently doesn't work.

Cultivate verifies "did the leaf finish." Contract tests verify "did the leaves agree." Eval verifies "do leaves finish reliably across trials." None ask "does the cultivated app actually do what NUTRIENTS says it does." **Audit-run is that layer.**

## 2. Conceptual model

Test cultivation is symmetric to production cultivation. For every biome you cultivate, you cultivate a *tester* — a sibling agent whose deliverable is structured findings, not code.

```
   cultivate                 audit-run
   ─────────                 ─────────
   biome.schema       ←→     tester.schema      (mirrors schema contracts → asserts DB state)
   biome.design       ←→     tester.tokens      (mirrors token contracts → grep hardcoded hex)
   biome.auth         ←→     tester.auth        (mirrors auth flows → boot login flow)
   biome.talent-onb   ←→     tester.flow.talent (mirrors 8-step wizard → run wizard, assert row)
   ...                       ...
                             tester.types       (cross-cutting: tsc --noEmit, no `any`)
                             tester.security    (cross-cutting: §H audit grep set)
                             tester.contract    (cross-cutting: delegates to contracts/)
```

Testers consume cultivated code + NUTRIENTS read-only, exercise it, emit JSONL findings. An aggregator groups findings by biome and composes a fix brief. With `--autofix`, the fix brief is re-planted through `mycelium ddp` → cultivated → audited again, in a loop until clean or budget exhausted. This is the loop-closing piece: cultivate plants, audit-run inspects, heal-loop re-plants the affected biomes only.

## 3. Command surface

```bash
mycelium audit-run                           # full audit, no autofix; writes findings + fix brief
mycelium audit-run --autofix                 # heal loop; default --max-iterations 3
mycelium audit-run --autofix --max-iterations 5
mycelium audit-run --only-tester tester.flow.talent   # one tester (for debugging audit-run itself)
mycelium audit-run --against <ref>           # baseline diff; report regressions only
mycelium audit-run --concurrency <n>         # defaults to organism's cultivate concurrency
mycelium audit-run --no-serve                # skip sporenet integration
```

Outputs land at:
```
audit/<ISO-timestamp>/
  findings.jsonl                # one finding per line
  brief-fix.md                  # aggregator-composed re-plant brief
  testers/<tester_id>/stdout.log
  summary.json                  # counts, severity buckets, biomes affected
```

Defaults that matter: no `--autofix` is the safe default (writes brief, never re-plants). `--max-iterations 3` ceilings the autofix loop. Findings are SHA-deduplicated by `id` so the same defect across iterations doesn't inflate counts.

## 4. Tester biome catalog (13 testers)

Ten biome-mirror testers + three cross-cutting. Each tester ships as `hyphae/HYPHA-TEST-*.md` with: scope, inputs (cultivated artifacts + NUTRIENTS read-only), assertion set, tool budget. Default tool budget: **Read + Bash** (assertions via grep/tsc/curl/sql/Maestro); **no Write/Edit** unless `--autofix` is on, in which case Write/Edit are unlocked only for the re-plant cycle (the tester itself never writes; the re-plant biome leaves do).

| Tester ID | Mirrors biome | What it asserts | Tools |
|---|---|---|---|
| `tester.schema` | schema-core | Migrations apply clean; tables match §C symbol matrix; required columns + types present | Bash (psql/supabase CLI), Read |
| `tester.tokens` | design-system | No hardcoded hex in `src/`; primitives expose props matching §B verbatim; raw `<Text>` absent from screens | Read, Bash (grep, tsc) |
| `tester.auth` | auth | Login flow boots; PKCE configured per §H.2.1; secureStorageAdapter wired (§H.2.2) | Bash (Maestro / RN harness), Read |
| `tester.nav` | app-shell | Every route in §G screen-ownership matrix is reachable; `RootNavigator` imports real screens (no `null` returns per §G.9) | Read (AST), Bash (Maestro) |
| `tester.flow.talent` | talent-onboarding | Headless 8-step wizard with synthetic input → `talent_profiles` row exists with typed data | Bash (Maestro / RN harness), Bash (psql) |
| `tester.flow.buyer` | buyer-onboarding | Mirror of above for Buyer | same |
| `tester.discovery` | discovery | Talent listing renders; filters work; profile detail loads | Bash (Maestro), Read |
| `tester.messaging` | messaging | Thread creation, message send, system events appear in correct order | Bash (Maestro), Bash (psql) |
| `tester.booking` | booking-lifecycle | State machine transitions valid per NUTRIENTS booking states; escrow stub triggers at the right transition | Bash (Maestro), Bash (psql) |
| `tester.jobs` | job-posting | Public/Private post visibility rules; Talent application flow | Bash (Maestro), Bash (psql) |
| `tester.types` | cross-cutting | `tsc --noEmit` clean; no `any` outside allowlist; strict-mode preserved | Bash (tsc, grep) |
| `tester.security` | cross-cutting | §H audit grep set returns zero matches; `always-block` rules verified | Bash (grep). **If hooks ship**, `pre:bash:no-git` + `pre:write:doc-file-warning` apply here — see §7 |
| `tester.contract` | cross-cutting | **Delegates to `cli/src/lib/contracts/generators/*.ts` — same generators harvest's `--contract-threshold` and eval's `contract` judge consume.** Not a reimplementation. | (no new) |

A finding counts when:
- An assertion returns `fail` (deterministic — file/row/exit-code).
- A spawn-and-exercise step throws or times out (the flow can't even boot).
- A NUTRIENTS-declared behavior is missing entirely (the assertion target file doesn't exist).

A finding does *not* count when:
- The asserted artifact is out of cultivation scope (skipped, not failed).
- The tester itself crashes (logged loud as `tester_error` — operator concern, not cultivation defect).

## 5. Findings schema

JSONL. One finding per line. SHA-deduped so the same defect across `--autofix` iterations doesn't inflate counts. Schema:

```ts
interface Finding {
  id: string;            // sha256(tester_id + biome + summary + file_path + line_range)
  tester_id: string;     // e.g., "tester.flow.talent"
  biome: string;         // production biome this finding maps to
  severity: "critical" | "major" | "minor";
                         // critical → blocks contract-freeze on re-plant
                         // major    → blocks harvest threshold
                         // minor    → informational; included in brief but non-blocking
  file_path?: string;
  line_range?: [number, number];
  summary: string;       // one-line headline
  detail: string;        // multi-line root-cause explanation
  repro_steps: string[]; // ordered commands or actions to reproduce
  suggested_fix: string; // free-text; the re-plant leaf consumes this as acceptance criterion
  observed_at: string;   // ISO timestamp
  iteration: number;     // which autofix iteration produced this (0 = baseline run)
}
```

Worked example — today's run8 bug as a finding:

```json
{
  "id": "9f3a...",
  "tester_id": "tester.flow.talent",
  "biome": "talent-onboarding",
  "severity": "critical",
  "file_path": "src/screens/onboarding/talent/TalentNameScreen.tsx",
  "line_range": [12, 24],
  "summary": "talent_profiles row not persisted after onboarding wizard completes",
  "detail": "Headless run of the 8-step wizard with synthetic input completes and navigates to TalentOnboardingCompleteScreen. saveTalentProfile() is invoked but the resulting talent_profiles row is empty (all fields NULL except id/user_id). Root cause: each step screen owns its own useState; state is lost on navigation; saveTalentProfile fires against INITIAL_STATE. NUTRIENTS HYPHA-TALENT-ONBOARDING Acceptance Criterion: 'On completion, talent_profiles row is created/updated with all fields' — violated.",
  "repro_steps": [
    "maestro test e2e/talent-onboarding-full.yaml",
    "psql $SUPABASE_DB -c \"select * from talent_profiles order by created_at desc limit 1;\""
  ],
  "suggested_fix": "Lift onboarding state to a Context Provider (TalentOnboardingProvider). Wrap the onboarding stack in RootNavigator. Each step screen reads/writes via useTalentOnboarding() instead of local useState. saveTalentProfile() reads from the context, not initial state.",
  "observed_at": "2026-05-11T14:32:11Z",
  "iteration": 0
}
```

That single line is what would have surfaced the bug before SPY noticed it in the demo flow.

## 6. Brief composition

The aggregator reads `findings.jsonl`, groups by `biome`, and composes `audit/<ts>/brief-fix.md`. The fix brief inherits the original `brief.md` verbatim, with three additions:

1. **`only_biomes:` field** at the top — list of biomes containing at least one `critical` or `major` finding. The re-plant uses this to scope `mycelium cultivate --only-biome` invocations (one per affected biome, or a comma-list once cultivate supports it).
2. **`Active findings` section** — per affected biome, a bulleted list of findings flattened into acceptance-criterion form. Each becomes a new "MUST" line on top of the original HYPHA's existing acceptance criteria. Example: "MUST persist all 8 onboarding wizard fields to `talent_profiles` on completion (audit-run finding 9f3a…). Suggested fix: lift state to context provider."
3. **`audit_baseline:` field** — pointer to the prior `audit/<ts>/findings.jsonl`, so the next audit-run iteration can diff regressions vs. new fixes.

F1 skip-already-done is automatic — `sporenet/state.json` from the prior cultivate already marks the clean biomes `done`, and cultivate's F1 path (`cultivate.ts:158-170`) filters them out. The re-plant only re-cultivates the affected biomes.

In `--autofix` mode, the aggregator invokes `mycelium ddp --brief audit/<ts>/brief-fix.md` (or `mycelium cultivate --only-biome <ids>` if already planted), then re-runs audit-run, looping until zero criticals or `--max-iterations` is hit.

## 7. Sequencing constraints

- **Depends on `contract-tests-from-nutrients` shipping first.** `tester.contract` is a thin wrapper around the generators in `cli/src/lib/contracts/generators/`. If those don't exist, `tester.contract` is a no-op and the contract surface is uncovered. Phase 1 of audit-run can ship before the contract runner if `tester.contract` is stubbed; phase 1 then becomes useful only once contracts ship.
- **Composes with `mycelium eval`, doesn't require it.** Eval measures pass@k of cultivation on fixtures; audit-run measures correctness of a single cultivation's output. Different question, same machinery family (worktree isolation, structured findings).
- **Independent of `hooks-via-agent-sdk-scoping`.** Different layer; no shared plumbing. *Note:* if/when hooks ship, `tester.security`'s Bash assertions inherit `pre:bash:no-git` and `pre:write:doc-file-warning` automatically (the hooks fire on any Agent SDK invocation, audit-run testers included). No work required on audit-run's side; just documented for operator awareness.
- **Independent of Router 30-day plan.** Audit-run can ship before or after Router Lane-A work at `cultivate.ts:480`. Router changes the LLM chokepoint *inside* cultivate; audit-run sits *outside* cultivate. The two don't touch.

## 8. Phasing

**Phase 1 — Basic audit loop, no autofix (4–5 days).**
- `cli/src/commands/audit-run.ts` — Commander wiring; subcommand of the top-level program; reuses `cultivate.ts`'s concurrency helper (the runner pool at `cultivate.ts:441-466`) for parallel tester execution.
- `cli/src/lib/audit/testers.ts` — tester registry; load HYPHA-TEST-*.md, build tester prompts mirroring `buildLeafPrompt` from `cultivate.ts:492`.
- `cli/src/lib/audit/findings.ts` — JSONL writer, SHA dedupe, severity validation.
- `cli/src/lib/audit/aggregator.ts` — group by biome, compose `brief-fix.md`.
- Ship 3 testers minimum: `tester.types`, `tester.tokens`, `tester.flow.talent` (the canonical run8 case). Others stubbed.

**Phase 2 — `--autofix` re-plant cycle (2 days).**
- `cli/src/lib/audit/heal-loop.ts` — invoke `mycelium ddp` or `mycelium cultivate --only-biome` against the composed brief; iterate; bail at `--max-iterations` or zero criticals.
- Iteration metadata persisted under `audit/<ts>/iterations/<n>/`.
- Cost cap shared with `lib/budget.ts` — autofix respects the same `maxBudgetUsd` cultivate uses.

**Phase 3 — Sporenet integration (1 day).**
- `sporenet/state.json` gains an `audit` block: `{ status: "pending|running|complete|failed", findings_count, criticals, last_run_at }`.
- `sporenet serve`'s `/` handler renders an "Audit" pane below the leaf grid — same auto-refresh path that surfaces cultivate in-flight state (`sporenet.ts` F5 path).
- Audit progress is visible during long heal-loops the same way cultivate is during multi-hour runs.

Total runway: ~7–8 days end-to-end.

## 9. Worked example — run8 talent-onboarding

The cultivation completes. Sporenet shows 10/10 done. SPY runs `mycelium audit-run`.

1. Audit-run spawns 13 testers in parallel (concurrency 30, matching cultivate's default).
2. `tester.flow.talent` boots a headless React Native environment via Maestro against the cultivated app. Runs the 8-step wizard with synthetic input ("Test Talent", category "musician", genres ["rock"], etc.).
3. Reaches `TalentOnboardingCompleteScreen`. Logs a `saveTalentProfile` invocation in the leaf's stdout.
4. Queries Supabase: `select * from talent_profiles order by created_at desc limit 1;`. Row exists but every NUTRIENTS-declared field is NULL.
5. Assertion fails. Tester emits the finding from §5.
6. Aggregator groups: one critical finding under `talent-onboarding`. Composes `brief-fix.md` with `only_biomes: [talent-onboarding]` and the active finding promoted to an acceptance criterion.
7. With `--autofix`: `mycelium ddp --brief audit/.../brief-fix.md` re-plants. F1 sees 9/10 leaves done; cultivates only talent-onboarding. The re-cultivated leaf reads the active finding, refactors to a Context provider, ships.
8. Audit-run re-runs. `tester.flow.talent` now sees a populated row. Findings drop to zero. Loop exits clean.

Cost: one extra leaf cultivation + the testers' assertion budget. Wall: minutes, not the 4.7 hours of the original cultivate.

## 10. Open questions for SPY

1. **Default `--max-iterations`.** Spec leans 3. Higher means more autofix headroom but more spend on stuck findings. **Lean: 3.**
2. **How testers reach Supabase.** Separate test project (cheap, isolated, but drift from real schema) vs. Supabase Branching (real schema, costs DB minutes). **Lean: Branching for paid orgs, dedicated test project for demo tier.**
3. **Maestro vs. custom RN harness for flow testers.** Maestro is the operator pick (declarative YAML, fast). Custom harness is more controllable but more code. **Lean: Maestro for v1; revisit if Maestro can't reach a specific assertion.**
4. **Should `findings.jsonl` commit to the cultivation repo?** Yes is auditable but bloats history; no is cleaner but loses the per-run trail. **Lean: gitignored `audit/` but commit `audit/<ts>/summary.json` to the cultivation repo as a lightweight breadcrumb.**
5. **Autofix re-plant: sub-organism or commit on top of main?** Sub-organism means a separate branch the operator merges. Commit-on-top means the heal loop modifies the working tree. **Lean: commit-on-top with explicit `--autofix-branch <name>` to switch to sub-organism mode.**
6. **Should `tester.contract` be a separate tester or fold into the existing harvest gate?** Separate keeps audit-run's surface uniform; folding avoids duplicate runs. **Lean: separate — audit-run runs after harvest, contract gate at harvest is the front door; audit-run's `tester.contract` is the safety net + the diff source for `--against`.**
7. **Tester HYPHA authoring — operator-written or generated?** Operator-written is honest (humans know what to test). Generated from biome HYPHAs is fast but tautological (testers assert exactly what the biome HYPHA already says, which the biome leaf already saw). **Lean: operator-written, with a `mycelium audit-run scaffold-tester <biome>` helper that stubs the file.**

## Files touched

```
cli/src/commands/audit-run.ts             (new)
cli/src/lib/audit/testers.ts              (new)
cli/src/lib/audit/findings.ts             (new)
cli/src/lib/audit/aggregator.ts           (new)
cli/src/lib/audit/heal-loop.ts            (new, phase 2)
cli/src/lib/audit/sporenet-integration.ts (new, phase 3)
hyphae/HYPHA-TEST-*.md                    (new — per cultivation, operator-authored)
audit/                                     (new — gitignored runtime output)
sporenet/state.json                       (schema extension — `audit` block, phase 3)
```

No changes to `cultivate.ts` public contract. No new npm deps in phases 1–3 (Maestro is a separate CLI; tester invocations shell out to it). Sporenet integration reuses the existing F5 re-render-on-request path.

## References

- `docs/mycelium-eval-spec.md` — measures pass@k of cultivation; composes with audit-run via shared worktree machinery, distinct question (reliability across trials vs. correctness of one run)
- `docs/contract-tests-from-nutrients.md` — generators consumed by `tester.contract`; do not reimplement
- `docs/hooks-via-agent-sdk-scoping.md` — independent layer; if hooks ship, `tester.security`'s Bash assertions inherit them
- `cli/src/commands/cultivate.ts:158-170` — F1 skip-already-done path; audit-run's re-plant relies on this
- `cli/src/commands/cultivate.ts:441-466` — concurrency runner pool; audit-run testers reuse it
- `cli/src/commands/cultivate.ts:480` — Router Lane-A chokepoint; audit-run is independent of it
- HANDOFF 2026-05-09 + 2026-05-10 — run8 context; commit-attribution race (fixed) vs. today's behavior bug (audit-run's target)
- LiveGrid run8 `brief.md`, `NUTRIENTS.md` §B/§C/§G/§H, `hyphae/HYPHA-TALENT-ONBOARDING.md` — canonical workload the worked example draws from
