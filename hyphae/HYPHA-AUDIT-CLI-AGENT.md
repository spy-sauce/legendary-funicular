# HYPHA — audit-cli

## CACHE HEADER
- **SCOPE:** Commander wiring for `mycelium audit-run` + `mycelium audit-run scaffold-tester <biome>` subcommand. The public command surface.
- **PRIMITIVES:** Commander.js · subcommand routing · flag parsing · orchestration of `loadTesters → runTestersInPool → aggregate → composeBriefFix → writeSummary` (+ optional `runHealLoop` when `--autofix`).
- **RULES:** CLI surface from NUTRIENTS §7 is the public contract — **additions only, no renames or removals** (framework rule #3) · register in `cli/src/index.ts` following the existing command registration pattern · default `--no-serve` is FALSE (sporenet integration writes happen; serve startup is the operator's call separately).
- **COUPLING:** the integration biome — depends on `audit-findings`, `audit-testers`, `audit-aggregator`, `audit-heal-loop`, `audit-sporenet`. Last in merge order before docs.
- **LOAD WHEN:** any leaf touching `cli/src/commands/audit-run.ts`, the top-level command registration, or the orchestration pipeline.

## Scope
Implement the CLI entry point. Wire all the other audit biomes together. Add the `scaffold-tester` subcommand. Register in the top-level program. No new framework primitives — purely composition.

## Deliverables by leaf

### `audit.cli.command`
- File: `cli/src/commands/audit-run.ts`
- Commander program. Exports `auditRunCommand: Command` for registration in `cli/src/index.ts`.
- All flags from NUTRIENTS §7 wired:
  - `--autofix` (boolean)
  - `--max-iterations <n>` (number, default `3`)
  - `--only-tester <tester_id>` (string)
  - `--against <ref>` (string — baseline `findings.jsonl` path or git ref)
  - `--concurrency <n>` (number, default = read from `mycelium.yaml` `routing.*.concurrency` or fall back to 30)
  - `--no-serve` (boolean — skips the sporenet writes when set; off by default)
  - `--autofix-branch <name>` (string — sub-organism mode)
  - `--max-budget-usd <n>` (number — phase 2)
  - `--dry-run` (boolean — print execution plan; spawn no sessions)
- Subcommand: `mycelium audit-run scaffold-tester <biome>` (see `audit.cli.scaffold`).
- Register the top-level command in `cli/src/index.ts`. Follow the existing registration pattern (look at how `cultivate` and `harvest` are registered).
- Exit codes per NUTRIENTS §7:
  - `0`: no findings (or autofix succeeded — zero criticals at termination)
  - `1`: findings present in non-autofix mode
  - `2`: autofix exhausted with criticals remaining (max-iter or budget)
  - `3`: tester_error count > 0

### `audit.cli.orchestrator`
- Embedded in `cli/src/commands/audit-run.ts` action handler.
- Resolves the cultivation directory (default: `process.cwd()`; for now no flag to override).
- Creates `audit/<ISO-timestamp-fs-safe>/` directory.
- Reads `brief.md` from `<cultivationDir>/brief.md` if present; passes the string to `composeBriefFix` later.
- `loadTesters(cultivationDir)` — bail with a clear error if zero testers found (`hyphae/HYPHA-TEST-*.md` glob empty) and `--only-tester` not set.
- `filterTesters({ onlyTesterId })` when `--only-tester` is passed.
- `runTestersInPool(testers, ctx)` — emit a `tester_started` log line per spawn (visible in stdout for operator).
- `aggregate(findings)` → `composeBriefFix(brief, aggregated, baselinePath)` → write `brief-fix.md` and `summary.json`.
- If `--against <ref>`: load the baseline `findings.jsonl` from `<ref>` (path or git ref), diff against new findings, mark old-and-new as `unchanged`, new-only as `regression`, old-only as `fixed`. Report regression count separately in stdout.
- When `--autofix`: hand off to `runHealLoop` (passes `runTestersInPool` as the `runTestersFn` closure).
- When `--no-serve` is **not** set: call `writeAuditBlock` from `audit-sporenet` at run start/middle/end.

### `audit.cli.scaffold`
- Subcommand: `mycelium audit-run scaffold-tester <biome>`.
- Reads the biome's HYPHA from `<cultivationDir>/hyphae/HYPHA-<BIOME>.md` (or `HYPHA-<BIOME>-AGENT.md` for legacy organisms).
- Emits `<cultivationDir>/hyphae/HYPHA-TEST-<biome>.md` with:
  - Pre-filled `TESTER_ID: tester.<biome>`
  - `MIRRORS_BIOME: <biome>`
  - `SCOPE` lifted from the biome HYPHA's CACHE HEADER scope line
  - `INPUTS: ` line listing the biome's `Deliverables` file paths (parsed from the HYPHA)
  - `TOOLS: Read, Bash`
  - `## Assertions` section with TODO bullets (one per `Acceptance criteria` line in the source HYPHA — invites the operator to convert each into an assertion).
  - `## Repro recipe` section with a TODO note.
  - `## Suggested fix template` section with a TODO note.
- Refuses to overwrite an existing `HYPHA-TEST-<biome>.md` — emits an error and exits non-zero. Operator must `--force` (not yet exposed; leave a TODO comment in code).

## Contract dependencies
- NUTRIENTS.md §7 (CLI surface) — frozen
- NUTRIENTS.md §1, §2, §3, §4, §5, §6, §8 — all consumed by the orchestrator via the library biomes.

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `mycelium audit-run --help` lists every flag in NUTRIENTS §7.
- `mycelium audit-run --dry-run` in a cultivation with one tester HYPHA prints the execution plan (testers to run, output paths) and exits 0 without spawning sessions.
- `mycelium audit-run scaffold-tester <biome>` emits a valid HYPHA-TEST file the loader can parse.
- `mycelium audit-run scaffold-tester <biome>` exits non-zero if the file already exists.
- The command is registered in `cli/src/index.ts` alongside the other commands.

## Out of scope
- Modifying `cli/src/commands/cultivate.ts` (framework rule #2). Import the concurrency helper, do not change cultivate.
- Mass-renaming or removing any existing flag on any other command.
- Building a TUI / interactive mode — flags-only.

## Merge instructions
Last in merge order before `audit-docs`. Imports from `audit-findings`, `audit-testers`, `audit-aggregator`, `audit-heal-loop`, `audit-sporenet`. Registers in `cli/src/index.ts` following the existing `program.addCommand(...)` pattern.
