# Mycelium Evals — tasks + fixtures

> Mycelium Framework — VibeSpace LLC — The network provides.

Content tree for `mycelium eval` (backlog 0.2). Task definitions live in
`evals/tasks/*.yaml`; the fixtures they reference live in `evals/fixtures/`.
The frozen data contract is `cli/src/lib/eval/types.ts` — where this README
and `docs/mycelium-eval-spec.md` disagree with `types.ts`, **types.ts wins**.

## What an eval run executes

`mycelium eval` executes the **current built CLI**. Build first, always:

```bash
cd cli && npm run build
mycelium eval run --task lane-b-noop
```

There is no checkout, no time travel. If you want to eval an older framework
commit, check it out yourself and rebuild — the runner records the actually
executed commit as `framework_commit` (rev-parse HEAD) in `summary.json`.

### `pinned_commit` is provenance, not a checkout

Each task carries `pinned_commit: <sha>` — the framework commit the task was
**authored against**. It is recorded into the summary so that a baseline is
interpretable later ("this 3/3 pass was measured on a task written for
`22351c3`"). The runner does **not** check that commit out. The spec's
original "trials run from the pinned commit" language is superseded by
`types.ts`: *eval always executes the CURRENT built CLI*.

## Lanes

| Lane | What runs | What it measures |
|---|---|---|
| **A** | Full `cultivate` against a fixture cultivation dir (`fixture.path`, copied per trial) | The canary — end-to-end orchestration + leaf completion |
| **B** | One leaf, no orchestration (`fixture.hypha` + `fixture.nutrients` + `fixture.scope`) | The unit test — single-leaf completion reliability |
| **C** | Direct prompt through the Router chokepoint, no agent loop | Router/classifier quality only (lights up post-Router phase 1) |

Validation rules (enforced by the task loader): `id`, `lane`, `runs`, `judge`
are required; every task needs **at least one deterministic judge**
(`tsc` / `grep` / `command` / `contract` — never `llm`-only); Lane B requires
`fixture.hypha`; Lane A requires `fixture.path`.

## Trial isolation — scratch dirs, not worktrees

**Deliberate override of the spec.** `docs/mycelium-eval-spec.md` called for
`git worktree` per trial. Post-backlog-0.1, `cultivate` itself owns
repo-global worktrees and `feat/<leaf>` branches (one worktree per leaf,
commit 22351c3) — an eval runner adding its *own* worktree layer on top would
fight cultivate over branch refs and worktree registrations in the shared
`.git`.

Instead, each trial gets a plain **scratch directory** under the gitignored
`.mycelium/evals/`:

```
.mycelium/evals/
  <task-id>/
    <timestamp>/
      trial-1/          # Lane A: fixture copy; Lane B: empty dir the leaf writes into
      trial-2/
      trial-3/
      summary.json      # pass@1 / pass@k / pass^k / cost / wall (TaskRunSummary)
  baselines/
    <task-id>.json      # last explicitly-accepted summary
```

Trials still don't see each other's writes, and runs still can't pollute the
live repo — the two properties the worktree design was buying — without the
branch-namespace collision. Trial dirs are kept after the run by default;
they are the audit trail.

## Serial by default

Trials run **serially** (`concurrency: 1`) unless overridden. This is SDK
rate-limit discipline, not a performance oversight: three parallel Lane A
trials each spawning leaf sessions is how you hit the rate limit and turn an
eval into an infra-error festival. Parallelize only when you know your
headroom.

## Baselines and the refusal gate

```bash
mycelium eval run --task lane-b-telemetry   # reports, never moves baseline
mycelium eval baseline accept lane-b-telemetry   # explicit, human-in-the-loop
```

A run without `accept` only **reports** drift against the stored baseline.
Baselines never move silently.

**The gate this unlocks:** no changes to the LLM chokepoint —
`query({...})` at `cli/src/commands/cultivate.ts:598` (historically `:480`;
Router phase 1, cache-network, provider swaps all land there) — until
baselines have been accepted for the checked-in tasks. Once that line changes
without a baseline, regression attribution (router vs model-drift vs
prompt-drift vs cache) is permanently lost. This is the standing constraint
from `docs/mycelium-eval-spec.md` and `docs/BACKLOG-parked-2026-06-16.md`.
The workflow: run the tasks on `main`, accept baselines, *then* open the
chokepoint PR, rerun, and paste the delta. Required: `pass_at_k`
non-decreasing, `pass_caret_k` non-decreasing on regression tasks, total
cost within +20%.

## Cost expectations (rough, per full 3-trial run)

| Task | Per-trial ceiling | Expected full run |
|---|---|---|
| `lane-b-noop` | $0.50 / 600s | ~$0.10–0.30 total — one trivial leaf ×3 |
| `lane-b-telemetry` | $0.75 / 600s | ~$0.50–1.50 total — one real code-writing leaf ×3 |
| `lane-a-mini` | $2.50 / 1200s | ~$2–6 total — 2-leaf cultivation ×3 |

Budget overshoot **fails the trial even if every judge passes** — cost is
part of the gate, same posture as `lib/budget.ts` for cultivate.

## Anti-pattern: `runs < 3`

Leaves are non-deterministic; a single trial is noise, not signal. `runs: 3`
is the floor for every checked-in task. The runner warns (but does not
refuse) below 3 — treat any `--runs 1` invocation as a smoke poke, never as
data, and never accept a baseline from one.

Other standing anti-patterns (see the spec): LLM-only judges, overfitting a
task to a known-good transcript, silent baseline updates, ignoring cost.

## Checked-in tasks

| Task | Lane | Purpose |
|---|---|---|
| `tasks/lane-b-noop.yaml` | B | Runner smoke test — leaf writes the one asked-for file |
| `tasks/lane-b-telemetry.yaml` | B | Capability — leaf writes a self-contained JSONL telemetry emitter |
| `tasks/lane-a-mini.yaml` | A | Canary — 2-biome micro-cultivation with telemetry + cost upgrades wired |

Fixture note: `fixtures/lane-a-mini/` must **never** contain a committed
`sporenet/state.json`. Cultivate's F1 skip-done logic (cultivate.ts:158–171)
reads it and skips leaves marked `done` — a stale committed state file would
silently turn every Lane A trial into a no-op that still "passes" nothing.
