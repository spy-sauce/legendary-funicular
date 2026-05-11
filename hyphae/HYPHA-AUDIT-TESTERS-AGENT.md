# HYPHA — audit-testers

## CACHE HEADER
- **SCOPE:** Tester registry, HYPHA-TEST-*.md loader, tester runner pool — the engine that spawns Claude Agent SDK sessions for each tester and collects their findings.
- **PRIMITIVES:** Markdown CACHE HEADER parsing · `@anthropic-ai/claude-agent-sdk` session spawn · concurrency runner pool (re-used from cultivate.ts, import only) · Read+Bash tool budget enforcement.
- **RULES:** Write/Edit are **never** in the tester tool budget · the tester emits one Finding to `finding.json`, never writes elsewhere · loader throws on malformed HYPHA (no silent skip) · runner is bounded by `--concurrency` flag (default = organism's cultivate concurrency).
- **COUPLING:** consumes `Finding` type from `audit-findings`. Provides `TesterDef`, `TesterResult`, `loadTesters`, `runTester`, `runTestersInPool` to `audit-cli` and (transitively) `audit-aggregator` via the runner output.
- **LOAD WHEN:** any leaf parsing HYPHA-TEST-*.md, spawning testers, or computing tester results.

## Scope
Implement the tester loader + runner. Loader scans `hyphae/HYPHA-TEST-*.md` in the cultivation being audited. Runner spawns a Claude Agent SDK session per tester with a locked-down tool budget (Read + Bash only). Runner pool reuses cultivate.ts's existing concurrency helper — **import only, do not modify** per framework rule #2.

Ship example HYPHA-TEST stubs under `examples/hyphae-test/` so the loader has fixtures even before any real cultivation authors testers.

## Deliverables by leaf

### `audit.testers.types`
- File: `cli/src/lib/audit/testers.ts`
- Export: `TesterDef`, `TesterResult` per NUTRIENTS §4.
- `TesterDef.tools` defaults to `["Read", "Bash"]`. The runner never grants `Write` or `Edit`, even if a HYPHA tries to declare them — log a warning and strip them.

### `audit.testers.loader`
- File: `cli/src/lib/audit/testers-loader.ts`
- `loadTesters(cultivationDir: string): TesterDef[]`
- Scans `<cultivationDir>/hyphae/HYPHA-TEST-*.md` (glob; alphabetical order).
- Parses the CACHE HEADER per NUTRIENTS §6:
  - `**TESTER_ID:** tester.<name>`
  - `**MIRRORS_BIOME:** <id>` or literal `(cross-cutting)` → `mirrors_biome: null`
  - `**SCOPE:** <one-line>`
  - `**INPUTS:** <comma-list>`
  - `**TOOLS:** Read, Bash` (default)
- Parses the free-text "Assertions", "Repro recipe", and "Suggested fix template" sections into `assertion_summary`, plus raw fields preserved for the runner.
- Throws `MalformedTesterError` with the file path and offending line if a required field is missing.
- `filterTesters(testers, { onlyTesterId? })` — applied by CLI for `--only-tester`.

### `audit.testers.runner`
- File: `cli/src/lib/audit/testers-runner.ts`
- `runTester(def: TesterDef, ctx: { auditRunDir, cultivationDir, iteration }): Promise<TesterResult>`
- Spawns one Claude Agent SDK session via `@anthropic-ai/claude-agent-sdk`.
- Tool budget: `Read` and `Bash` only. Strip Write/Edit even if requested.
- Prompt construction mirrors `buildLeafPrompt` at `cli/src/commands/cultivate.ts:771` — same skeleton (CACHE HEADER + scope + rules + acceptance), different body (assertions instead of deliverables). Implement locally as `buildTesterPrompt` — `buildLeafPrompt` is module-private in cultivate.ts and is NOT imported. Inline the **EXACT BEHAVIOR** the tester must produce: read the assertion set, exercise the cultivated app, emit one `Finding` JSON to `<auditRunDir>/testers/<tester_id>/finding.json` (or no file if all assertions pass).
- Captures stdout to `<auditRunDir>/testers/<tester_id>/stdout.log`, stderr to `stderr.log`.
- On Agent SDK crash or timeout: log a `tester_error` line to the run-level event log (do not emit a Finding — it's an operator concern, not a cultivation defect).
- Returns `TesterResult` with `exit_code`, `wall_ms`, and the parsed `Finding | null`.

### `audit.testers.pool`
- File: `cli/src/lib/audit/testers-pool.ts`
- `runTestersInPool(testers, ctx): Promise<TesterResult[]>` — imports `runWithConcurrency` from `../concurrency.js` (a shared utility shipped pre-cultivation at `cli/src/lib/concurrency.ts` — same module cultivate.ts now imports from). Do **not** modify cultivate.ts.
- Default concurrency: `ctx.concurrency || 30` (matches cultivate's default).
- Each tester's `Finding | null` is forwarded to `appendFinding` (from `audit-findings`) immediately on completion — partial findings.jsonl is readable mid-run.

### `audit.testers.examples`
- Create `examples/hyphae-test/HYPHA-TEST-types.md`, `HYPHA-TEST-tokens.md`, `HYPHA-TEST-flow-talent.md` as fixture stubs.
- Each is a valid HYPHA-TEST per NUTRIENTS §6 with realistic Assertions / Repro recipe / Suggested fix sections drawn from spec §4 of the audit-run doc.
- These exist so the loader can be exercised in `--dry-run` even before any real cultivation authors testers.

## Contract dependencies
- NUTRIENTS.md §1 (Finding schema) — frozen
- NUTRIENTS.md §4 (Tester registry + runner contract) — frozen
- NUTRIENTS.md §6 (HYPHA-TEST-*.md authoring schema) — frozen
- NUTRIENTS.md §10 (cultivate.ts re-use boundaries) — frozen

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `loadTesters` parses each fixture in `examples/hyphae-test/` into a valid `TesterDef`.
- `loadTesters` throws `MalformedTesterError` for a HYPHA missing `TESTER_ID`.
- `runTester` with a no-op mock SDK returns a `TesterResult` with `finding: null`.
- `runTestersInPool` respects concurrency — N testers with concurrency=2 spawn at most 2 sessions simultaneously.
- No imports of `Write` or `Edit` tools into the tester session.

## Out of scope
- Authoring real testers — operators do that in cultivation repos via the `scaffold-tester` subcommand (`audit-cli`).
- Aggregation across testers — `audit-aggregator`.
- Re-plant of the cultivation — `audit-heal-loop`.

## Merge instructions
After `audit-findings`. Imports `Finding` and `appendFinding` from there. No changes to `cli/src/commands/cultivate.ts`.
