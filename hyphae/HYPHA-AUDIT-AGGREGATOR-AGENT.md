# HYPHA — audit-aggregator

## CACHE HEADER
- **SCOPE:** Group findings by biome, compose `brief-fix.md`, write `summary.json` — the pure composition layer between testers and the heal-loop.
- **PRIMITIVES:** deterministic ordering · markdown composition · severity bucketing.
- **RULES:** `aggregate` is a pure function (no I/O) · `composeBriefFix` inherits the original `brief.md` verbatim — appends/prepends only, never rewrites · `only_biomes` lists biomes with `critical` OR `major`, never minor-only · `minor` findings appear as informational notes, never as MUST-line acceptance criteria.
- **COUPLING:** consumes `Finding` + `appendFinding` from `audit-findings`. Provides `aggregate`, `composeBriefFix`, `writeSummary` to `audit-cli` and `audit-heal-loop`.
- **LOAD WHEN:** any leaf grouping findings, building brief-fix.md, or writing summary.json.

## Scope
Implement the aggregator. Reads `findings.jsonl`, groups by biome, sorts deterministically, composes the re-plant brief, and writes the run-level summary.

The aggregator is the layer that turns "13 testers emitted 27 findings" into "re-cultivate these 3 biomes with these specific MUST lines added to their HYPHAs."

## Deliverables by leaf

### `audit.aggregator.aggregate`
- File: `cli/src/lib/audit/aggregator.ts`
- Export `AggregatedFindings` interface per NUTRIENTS §5.
- `aggregate(findings: Finding[]): AggregatedFindings`
- Pure function. Deterministic ordering:
  - Biomes: alphabetical.
  - Findings within a biome: severity (critical → major → minor), then `id` (lexical).
- `criticalBiomes`: biomes with ≥1 critical.
- `majorBiomes`: biomes with ≥1 major **and zero criticals**.
- `minorOnlyBiomes`: biomes with only minor findings.
- A biome with both critical and major is listed in `criticalBiomes` only.

### `audit.aggregator.brief`
- File: `cli/src/lib/audit/aggregator-brief.ts`
- `composeBriefFix(originalBrief: string, aggregated: AggregatedFindings, auditBaselinePath: string | null): string`
- Returns the full text of `brief-fix.md`. Structure:
  ```
  ---
  only_biomes: [<criticalBiomes ∪ majorBiomes, alpha>]
  audit_baseline: <path or null>
  ---

  # Re-plant brief — audit-run autofix iteration <n>

  <originalBrief verbatim>

  ## Active findings — re-plant scope

  ### <biome_id>
  - **MUST** <summary> (audit-run finding <id-short>).
    Suggested fix: <suggested_fix>
  - ...

  ### <next biome>
  - ...

  ## Informational (minor) findings
  - <biome>: <summary> (<id-short>)
  - ...
  ```
- `<id-short>` is the first 8 hex chars of the finding `id` — full id in a parenthetical at the end of the line if helpful, never as the lead.
- The original brief text is included verbatim (no edits, no truncation). Operator may diff the new brief against the prior to see what changed.

### `audit.aggregator.summary`
- File: `cli/src/lib/audit/aggregator-summary.ts`
- `writeSummary(runDir: string, summary: AuditSummary): Promise<void>` — atomic temp-file/rename (mirror the `writeAuditBlock` pattern).
- Schema exactly per NUTRIENTS §2 (`AuditSummary` interface).
- Called once per audit-run iteration (baseline + each autofix iteration).

## Contract dependencies
- NUTRIENTS.md §1 (Finding schema) — frozen
- NUTRIENTS.md §2 (audit directory layout — summary.json schema) — frozen
- NUTRIENTS.md §5 (aggregator → brief composition contract) — frozen

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `aggregate([])` returns `{ byBiome: {}, criticalBiomes: [], majorBiomes: [], minorOnlyBiomes: [] }`.
- `aggregate` ordering is stable across two runs with the same inputs in a different order.
- `composeBriefFix` for a single critical finding in biome `talent-onboarding` produces a brief-fix.md that:
  - Starts with `only_biomes: [talent-onboarding]`
  - Contains the original brief text verbatim
  - Has a `### talent-onboarding` section with one MUST line
  - Quotes the suggested fix text
- `writeSummary` produces a JSON file matching the `AuditSummary` shape.

## Out of scope
- Driving the heal-loop iteration — `audit-heal-loop`.
- Reading the original `brief.md` from disk — that's `audit-cli`'s job; it passes the string in.
- Sporenet state updates — `audit-sporenet`.

## Merge instructions
After `audit-findings`. Imports `Finding`, `AuditSummary` from there. No changes to other framework code.
