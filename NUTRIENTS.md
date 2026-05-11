# NUTRIENTS.md — Audit-Run

Frozen contracts for the **audit-run** cultivation — building `mycelium audit-run` into the framework. Every leaf consumes these. Do not redesign at leaf-time; halt and flag if a contract is wrong.

Source spec: `docs/mycelium-audit-run-spec.md`. §10 leans adopted as written (max-iterations=3, Maestro v1, gitignored `audit/`, commit-on-top w/ `--autofix-branch` escape, separate `tester.contract`, operator-written testers).

Phase 1 + Phase 2 + Phase 3 all in this cultivation. Sequencing: contract-freeze gates all biomes; biomes germinate in parallel; cross-biome data flows through these sections only.

---

## 1. Finding schema — the wire between testers and the aggregator

**Location:** TypeScript interface exported from `cli/src/lib/audit/findings.ts`. All testers emit findings in this exact shape via the JSONL writer; the aggregator consumes them in this exact shape.

```ts
export type Severity = "critical" | "major" | "minor";
//   critical → blocks contract-freeze on re-plant
//   major    → blocks harvest threshold
//   minor    → informational; included in brief but non-blocking

export interface Finding {
  id: string;            // sha256(tester_id + biome + summary + file_path + line_range)
  tester_id: string;     // e.g., "tester.flow.talent"
  biome: string;         // production biome this finding maps to
  severity: Severity;
  file_path?: string;
  line_range?: [number, number];
  summary: string;       // one-line headline
  detail: string;        // multi-line root-cause explanation
  repro_steps: string[]; // ordered commands or actions to reproduce
  suggested_fix: string; // free-text; the re-plant leaf consumes this as acceptance criterion
  observed_at: string;   // ISO-8601 with ms
  iteration: number;     // which autofix iteration produced this (0 = baseline)
}
```

**ID determinism:** `id = sha256(tester_id + "|" + biome + "|" + summary + "|" + (file_path || "") + "|" + (line_range ? line_range.join("-") : ""))`. SHA-256 hex, lowercase. The same defect across `--autofix` iterations produces the same `id` so dedupe is automatic.

**Writer contract:** `appendFinding(runDir: string, finding: Finding): void` — atomic append to `findings.jsonl`, one finding per line, UTF-8, `\n`-terminated. Dedupe by `id` against existing lines in the same file before append. Never throws on filesystem error — log to stderr and continue (mirrors telemetry-emitter pattern).

**Severity validation:** `validateFinding(finding: Finding): asserts finding is Finding` — runtime guard; throws if severity not in the union, if id length ≠ 64, if observed_at not ISO-8601.

---

## 2. `audit/` directory layout — frozen path conventions

Every audit-run produces one timestamped directory. Layout is part of the contract — sporenet integration, heal-loop, and `--against <ref>` baseline diff all rely on these paths.

```
audit/<ISO-timestamp>/
  findings.jsonl                    # one Finding per line (§1)
  summary.json                      # counts, severity buckets, biomes affected, audit_baseline pointer
  brief-fix.md                      # aggregator-composed re-plant brief (§5)
  testers/<tester_id>/stdout.log    # per-tester stdout
  testers/<tester_id>/stderr.log    # per-tester stderr
  testers/<tester_id>/finding.json  # the single finding the tester emitted (or empty if clean)
  iterations/<n>/                   # phase 2 autofix iterations; iteration 0 is the baseline run
    findings.jsonl
    summary.json
    brief-fix.md
    testers/...
```

**ISO timestamp:** `YYYY-MM-DDTHH-mm-ss-mmmZ` (filesystem-safe — colons replaced with dashes). The directory is the source of truth; no other state.

**summary.json shape:**

```ts
interface AuditSummary {
  audit_run_id: string;           // <iso-timestamp>-<4-char-hash>
  organism: string;               // from mycelium.yaml
  started_at: string;             // ISO-8601 with ms
  ended_at: string;
  wall_ms: number;
  testers_run: number;
  testers_failed: number;         // tester_error count (operator concern, not cultivation defect)
  findings_count: number;
  by_severity: { critical: number; major: number; minor: number };
  biomes_affected: string[];      // biomes with ≥1 critical|major finding
  iteration: number;              // 0 for baseline; n for autofix run n
  audit_baseline?: string;        // path to prior findings.jsonl (for --against)
}
```

**Gitignore:** `audit/` is gitignored in cultivated apps (§10.4 lean). `audit/<ts>/summary.json` is committed as a breadcrumb — explicit `git add audit/<ts>/summary.json` after each run.

---

## 3. Sporenet audit block — state.json extension

Phase 3. Extends the existing `sporenet/state.json` shape (see `cli/src/commands/sporenet.ts:34-42`) with an optional `audit` block. Existing fields preserved (per framework rule #9).

```ts
interface SporenetAuditBlock {
  status: "pending" | "running" | "complete" | "failed";
  audit_run_id: string | null;        // null when status === "pending"
  iteration: number;                  // 0 for baseline, n for autofix iteration
  findings_count: number;
  by_severity: { critical: number; major: number; minor: number };
  biomes_affected: string[];
  last_run_at: string | null;         // ISO-8601 with ms
  started_at: string | null;          // ISO-8601 with ms; null when not running
}

// Added to existing state.json root, optional:
interface SporenetState {
  // ...existing fields preserved verbatim...
  audit?: SporenetAuditBlock;
}
```

**Writer contract:** `writeAuditBlock(stateDir: string, block: SporenetAuditBlock): Promise<void>` — atomic temp-file/rename pattern (mirrors the `writeLeafState` serialization fix from 2026-05-10). Awaited via `drainAuditStateWrites` before audit-run exits.

**Read path:** `sporenet serve` `/` handler re-reads state.json on every request (the F5 path); the existing `renderHtml` is extended to render an "Audit" pane below the leaf grid when `state.audit` is present.

---

## 4. Tester registry + runner contract — what audit-cli imports from audit-testers

**Tester definition** (operator-authored as `hyphae/HYPHA-TEST-<id>.md` in the cultivation being audited):

```ts
export interface TesterDef {
  id: string;                    // "tester.<name>" — must start with "tester."
  mirrors_biome: string | null;  // null for cross-cutting testers
  scope: string;                 // one-line description
  inputs: string[];              // paths (cultivated artifacts + NUTRIENTS — read-only)
  assertion_summary: string;     // what the tester asserts (free text from HYPHA)
  tools: ("Read" | "Bash")[];    // default ["Read", "Bash"] — Write/Edit never granted
  hypha_path: string;            // path to the source HYPHA-TEST-*.md file
}
```

**Loader contract:**

```ts
export function loadTesters(cultivationDir: string): TesterDef[];
//   Scans <cultivationDir>/hyphae/HYPHA-TEST-*.md
//   Parses CACHE HEADER (mirrors existing HYPHA format) for fields.
//   Throws on malformed HYPHA — operator concern, not silent skip.

export function filterTesters(
  testers: TesterDef[],
  opts: { onlyTesterId?: string }
): TesterDef[];
//   --only-tester flag implementation.
```

**Runner contract:**

```ts
export interface TesterResult {
  tester_id: string;
  exit_code: number;
  wall_ms: number;
  finding: Finding | null;
  stdout_path: string;
  stderr_path: string;
}

export function runTester(
  def: TesterDef,
  ctx: { auditRunDir: string; cultivationDir: string; iteration: number }
): Promise<TesterResult>;
//   Spawns a Claude Agent SDK session.
//   Tool budget enforced: only Read + Bash by default; never Write/Edit unless --autofix is on,
//     and even then Write/Edit are reserved for the re-plant biome leaves, NOT the tester itself.
//   Tester prompt is built by mirroring buildLeafPrompt at cli/src/commands/cultivate.ts:492.
//   Stdout written to <auditRunDir>/testers/<tester_id>/stdout.log.
//   On finding, the tester emits one Finding JSON to <auditRunDir>/testers/<tester_id>/finding.json.

export function runTestersInPool(
  testers: TesterDef[],
  ctx: { auditRunDir: string; cultivationDir: string; iteration: number; concurrency: number }
): Promise<TesterResult[]>;
//   Imports `runWithConcurrency` from `cli/src/lib/concurrency.ts` (the shared utility — extracted
//     from cultivate.ts before this cultivation started; cultivate.ts now imports from there too).
//     Do NOT modify cultivate.ts.
```

---

## 5. Aggregator → brief composition contract

```ts
export interface AggregatedFindings {
  byBiome: Record<string, Finding[]>;
  criticalBiomes: string[];                // biomes with ≥1 critical finding
  majorBiomes: string[];                   // biomes with ≥1 major (and no critical)
  minorOnlyBiomes: string[];
}

export function aggregate(findings: Finding[]): AggregatedFindings;
//   Pure function; deterministic ordering (biome alpha, findings by severity then id).

export function composeBriefFix(
  originalBrief: string,                   // contents of brief.md from the cultivation
  aggregated: AggregatedFindings,
  auditBaselinePath: string | null
): string;
//   Returns the full text of brief-fix.md.
//   Inherits originalBrief verbatim, prepends:
//     - `only_biomes: [<criticalBiomes + majorBiomes>]` field at the top
//     - per-affected-biome "Active findings" sections with MUST-line acceptance criteria
//     - `audit_baseline: <path>` field (null on iteration 0)
//   minor findings appear in the brief as informational notes only — never as MUST lines.
```

**`only_biomes` consumption:** the heal-loop passes this list to `mycelium cultivate --only-biome <id>` (one invocation per biome, since cultivate currently accepts a single biome — sequential, not parallel, in iteration n).

---

## 6. HYPHA-TEST-*.md authoring schema

Operator-authored. Lives in the cultivation being audited at `hyphae/HYPHA-TEST-<id>.md`. The audit-testers loader parses this format.

```markdown
# HYPHA-TEST — <tester-id>

## CACHE HEADER
- **TESTER_ID:** tester.<name>
- **MIRRORS_BIOME:** <biome-id> | (cross-cutting)
- **SCOPE:** <one-line>
- **INPUTS:** <comma-list of cultivated artifact paths + NUTRIENTS sections>
- **TOOLS:** Read, Bash  (default — Write/Edit never granted)

## Assertions
<free-text description of what the tester asserts, including the
 deterministic exit-code / file / row / grep conditions for fail>

## Repro recipe
<ordered commands the tester runs; tester emits these as
 finding.repro_steps when an assertion fails>

## Suggested fix template
<free-text the tester uses as a starting point for finding.suggested_fix>
```

**Helper:** `mycelium audit-run scaffold-tester <biome>` (phase 1 deliverable on audit-cli) — emits a stub `hyphae/HYPHA-TEST-<biome>.md` pre-filled from the biome's HYPHA scope. Operator edits assertions/repro/fix.

---

## 7. `mycelium audit-run` CLI surface — frozen

Public command-line surface. Once frozen, additions only — no renames or removals.

```
mycelium audit-run                                  # baseline run; writes findings + brief; no autofix
mycelium audit-run --autofix                        # heal loop; default --max-iterations 3
mycelium audit-run --autofix --max-iterations <n>   # custom iteration cap
mycelium audit-run --only-tester <tester_id>        # single tester (audit-run debugging)
mycelium audit-run --against <ref>                  # baseline diff; report regressions only
mycelium audit-run --concurrency <n>                # default = organism's cultivate concurrency
mycelium audit-run --no-serve                       # skip sporenet integration
mycelium audit-run --autofix-branch <name>          # phase 2; sub-organism mode (default: commit-on-top)
mycelium audit-run --max-budget-usd <n>             # phase 2; cost cap; defaults to lib/budget.ts default
mycelium audit-run scaffold-tester <biome>          # subcommand; emits hyphae/HYPHA-TEST-<biome>.md stub
mycelium audit-run --dry-run                        # print execution plan; spawn no sessions
```

Exit codes: `0` clean, `1` findings present (non-autofix mode), `2` autofix exhausted with criticals remaining, `3` tester_error count > 0 (operator concern).

---

## 8. Heal-loop iteration contract

Phase 2 only. Per-iteration metadata written under `audit/<ts>/iterations/<n>/`.

```ts
export interface IterationRecord {
  iteration: number;                          // 0 = baseline, 1..N = autofix
  started_at: string;
  ended_at: string;
  wall_ms: number;
  findings_in: number;                        // findings carried over from prior iteration
  findings_out: number;                       // findings present after this iteration
  criticals_in: number;
  criticals_out: number;
  biomes_replanted: string[];                 // only_biomes from prior brief-fix.md
  replant_command: string;                    // exact command line invoked
  replant_exit_code: number;
  cost_usd: number;                           // tracked via lib/budget.ts
  cumulative_cost_usd: number;
  budget_remaining_usd: number;
}
```

**Termination conditions** (any one ends the loop):
1. `findings.by_severity.critical === 0` (success).
2. `iteration === maxIterations` (capped — default 3).
3. `cumulative_cost_usd >= maxBudgetUsd` (budget exhausted).
4. `findings_out >= findings_in` on a non-zero-criticals iteration (no progress — same severity set survived a re-plant).

Loop emits a final `audit/<ts>/heal-loop-summary.json` with all `IterationRecord`s.

---

## 9. Cost / budget tie-in

Phase 2 only. Reuses `cli/src/lib/budget.ts` (existing). Audit-run treats each iteration's re-plant as a cost-tracked cultivation event; testers' cost is also tracked via the standard cost-recorded event path (audit testers are Claude Agent SDK sessions, same as leaves).

```ts
// Existing in lib/budget.ts (do not modify):
//   getMaxBudgetUsd(opts: { fromCli?: number; fromYaml?: number }): number
//   formatBudget(usd: number): string
```

Audit-run's `--max-budget-usd` reads from CLI flag; falls back to `mycelium.yaml` `budget.maxUsd`; falls back to lib/budget.ts default.

---

## 10. Cultivate.ts re-use boundaries

Audit-run **imports** from a new shared lib (extracted from cultivate.ts before cultivation started):
- `runWithConcurrency<T, R>` from `cli/src/lib/concurrency.ts` — the canonical concurrency-limited promise pool. cultivate.ts now imports from there as well. Audit's `runTestersInPool` (§4) calls this directly.

Audit-run **mirrors** (does NOT import) module-private patterns inside cultivate.ts:
- The `buildLeafPrompt` shape (`cultivate.ts:771`) — mirrored locally as `buildTesterPrompt` (different prompt body, same skeleton). Module-private in cultivate.ts; do not import.

Audit-run **does not modify** `cli/src/commands/cultivate.ts` further:
- No new flags on cultivate.
- No changes to CommitQueue behavior.
- No changes to the F1 skip-already-done path (`cultivate.ts:158-170`) — heal-loop invokes `mycelium cultivate --only-biome <id>` and lets F1 do its job unchanged.
- Per framework rule #2 (CLAUDE.md): "Don't touch cli/src/commands/cultivate.ts public contract."

If audit-run discovers a need to change cultivate's behavior, halt and flag — that is a separate framework change, not part of this cultivation.
