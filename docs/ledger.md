# `mycelium ledger` — run reconciliation

`mycelium ledger` is a **post-cultivate reconciliation report**. After a
cultivation runs, each spawned leaf agent leaves behind *claims* (its entry in
`sporenet/state.json`: status, files produced, a commit SHA, a duration). The
ledger cross-checks those claims against three independent **truth stores** and
surfaces every place they disagree.

It is unrelated to `mycelium audit-run` (the QA-testers subsystem). "Audit" =
code-quality testing of a cultivated app. "Ledger" = bookkeeping of a run's own
claims vs observable reality.

## The three truth stores

| Store | Path | Role |
|---|---|---|
| **Telemetry** | `.mycelium/events/<run_id>.jsonl` | Event stream: `leaf_started`, `leaf_fruited`, `leaf_failed`, `cost_recorded`, … The source of truth for **cost, tokens, and what the engine observed**. |
| **State (claims)** | `sporenet/state.json` | Per-leaf `status`, `files_produced`, `commit`, `duration_seconds`. The **claims** side. |
| **Git** | the repo at `--dir` (default cwd) | Per-leaf commit resolution, files actually touched, and whether the commit is an ancestor of `HEAD`. The source of truth for **files and integration**. |

Everything is joined by **`leaf_id`**. `state.json` is a single current-state
file; the event log is selected separately (newest, or `--run <id>`). There is
no assumption that they came from the same session beyond the leaf ids lining up.

Authoritative source per field (never mixed):

- **commit SHA** ← `state.json` `leaf.commit`. (`leaf_fruited.commit_sha` is
  hardcoded `null` upstream and is never used.)
- **file count (truth)** ← `git show --name-only`. `files_produced` is the *claim*.
- **cost / tokens** ← telemetry `cost_recorded` events only.
- **integration** ← `git merge-base --is-ancestor <sha> HEAD`.

## What it checks (per leaf)

| Check | Severity | Fires when |
|---|---|---|
| `status_mismatch` | critical | state says `done` but telemetry has `leaf_failed` (or vice versa); or `done` with a `leaf_started` but no `leaf_fruited`. |
| `phantom_commit` | critical | `state.json` records a `commit` SHA that git can't resolve. |
| `ghost_files` | critical | `done` + `files_produced > 0` but the commit touches 0 files, or there is no commit at all. |
| `file_count_drift` | warn / **critical** | claimed ≠ actual file count. `git ≥ claimed` → **warn** (extra Bash-created files aren't in the artifact list). `git < claimed` → **critical** (claimed files are missing from the commit — the loud direction). |
| `not_integrated` | critical | `done` + commit resolves but is **not** an ancestor of `HEAD`, and the leaf isn't marked `conflicted` — silent loss. |
| `conflicted_leaf` | warn | status is `conflicted`; the report surfaces `conflict_files`. |
| `missing_cost` | warn | leaf reached a terminal state but no `cost_recorded` event carries its `leaf_id` (the B20 bug class — now permanently visible). |
| `duration_drift` | info | `|telemetry wall_ms/1000 − state duration_seconds|` > 10%. |

## Run-level checks

| Check | Severity | Fires when |
|---|---|---|
| `leaf_count_mismatch` | warn | `run_started.total_leaves`, `state.total`, `state.leaves.length`, and observed telemetry leaf count don't all agree — or a leaf appears in telemetry but not in `state.json`. |
| `missing_run_ended` | info | no `run_ended` event. **Expected on clean local runs** — only crash paths emit `run_ended`. The report says so. |

## How to read the report

1. **Header** — run id, organism, when, `ok/total` leaves, total cost, total tokens, and any `⚠` lines for truth stores that were skipped.
2. **DISCREPANCIES** — ranked critical → warn → info, one line each:
   `SEV  leaf  check  claimed → observed  (note)`. Read these first; they are the point of the command.
3. **LEAVES table** — every leaf: status, `files (claim/git)`, short commit, integrated `✓/✗/—`, cost, duration, and a per-leaf glyph (`✓` clean, `i` info-only, `!` warn, `✗` critical).
4. **Verdict** — `✓ CLEAN` or `N discrepancies (C critical, W warn, I info)`.

A `—` in any table cell means "not checkable" (e.g. git was skipped, or no
telemetry cost for that leaf) — not zero.

## CLI

```
mycelium ledger [--run <run_id>] [--organism <name>] [--json] [--dir <path>]
```

- `--run` — reconcile a specific run id; default is the newest `.mycelium/events/*.jsonl` by mtime (preferring `--organism`'s prefix when given).
- `--dir` — base directory; **all three stores** (events, state.json, and every git call via `git -C <dir>`) read from it. Use this to reconcile another checkout or a fixture.
- `--json` — additionally writes the full report to `.mycelium/ledger/<run_id>.json` (atomic tmp+rename) and prints the path. The rendered report still prints to stdout.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | clean, or info-only discrepancies |
| `1` | any **critical** discrepancy — or a precondition failure (no `state.json`, no event files, or an unknown `--run`) |
| `2` | **warn-only** discrepancies |

## DDP pipeline integration

The ledger runs **automatically** inside `mycelium ddp`, as a stage inserted
**immediately after `cultivate` and before `harvest`**:

```
plant → audit → freeze → sporenet init → cultivate → ledger → harvest → serve
```

This is the point of automating it: reconciliation happens on every pipeline
run, not only when an operator remembers to type `mycelium ledger`. Placed after
cultivate (which has already performed its post-wave `merge --no-ff`, so
integrated leaves are ancestors of `HEAD`) and before harvest, the ledger stops
`ddp` from declaring victory on unshipped or mismatched work.

The stage runs `mycelium ledger --json`, so the full report is persisted to
`.mycelium/ledger/<run_id>.json` alongside the rendered stdout report.

### Exit-code mapping inside `ddp`

`ddp` normally halts on any non-zero stage exit. The ledger stage is the one
exception, because its exit codes are graded:

| Ledger exit | Meaning | `ddp` behaviour |
|---|---|---|
| `0` | clean, or info-only discrepancies | continue |
| `2` | warn-only discrepancies | **print a loud warning and continue** (not fatal) |
| `1` | a **critical** discrepancy | **halt the pipeline** — same as any failed stage |

Exit `1` is deliberately fatal: a phantom commit, ghost files, an unintegrated
leaf, or claimed-but-missing files means the run's claims don't match reality,
and the pipeline must not proceed to harvest/serve as if the work shipped.

### `--no-ledger` opt-out

The ledger stage is **on by default**. Pass `--no-ledger` to `mycelium ddp` to
skip it (escape hatch for pipelines that intentionally forgo reconciliation):

```
mycelium ddp --brief brief.md -s <stack> -S <tier> --no-ledger
```

### Telemetry precondition — when the stage self-skips

The ledger hard-requires `sporenet/state.json` **and** at least one
`.mycelium/events/*.jsonl` event log (see *Graceful degradation* below).
Telemetry emission is **upgrade-gated** — an event log is written only when the
`telemetry-emitter` upgrade is enabled on the organism. On a cultivation that
never enabled it, there is no event log to reconcile against.

To avoid halting an otherwise-healthy pipeline on that precondition, `ddp`
checks for the ledger's inputs **before** spawning the stage. If they're absent
it **skips the ledger with a loud warning and continues** — it does not treat
the missing-telemetry precondition as a critical failure.

> **Note:** because the ledger's telemetry precondition gates *all* of its
> checks (including the git-only ones — `phantom_commit`, `ghost_files`,
> `not_integrated`), the "no victory on unshipped work" guarantee holds **only
> when `telemetry-emitter` is enabled** for the cultivation. On a plain run with
> no telemetry upgrade, the ledger stage is a loud no-op. Enabling
> `telemetry-emitter` by default for `ddp` cultivations (via organism/plant
> config) is the follow-up that closes this gap; it is out of scope for the
> wiring itself.

## Graceful degradation

The two hard preconditions are `sporenet/state.json` and at least one event
file — without them there is nothing to reconcile, and the command exits `1`
with a clear message. Any **single** store degrading (e.g. `--dir` points at a
non-git directory) is reported in the header's `⚠` skipped lines and the
dependent checks are simply omitted — the ledger reports everything still
checkable and never crashes on partial data.
