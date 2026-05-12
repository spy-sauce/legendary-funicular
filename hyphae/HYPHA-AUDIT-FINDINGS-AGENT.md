# HYPHA — audit-findings

## CACHE HEADER
- **SCOPE:** Finding type + JSONL writer + SHA dedupe + severity validation — the wire every tester emits and the aggregator consumes.
- **PRIMITIVES:** `Finding` interface · sha256 id · JSONL append · ISO-8601 timestamps.
- **RULES:** never throw on filesystem error (mirrors telemetry-emitter) · id is deterministic by content so the same defect across iterations dedupes automatically · severity union is closed (no new severities at leaf-time).
- **COUPLING:** every other audit biome imports `Finding` and writer helpers from here. Heal-loop iterates findings; aggregator groups findings; sporenet reads finding counts; testers emit findings; CLI orchestrates the lifecycle.
- **LOAD WHEN:** any leaf defining or consuming the Finding shape, touching `audit/<ts>/findings.jsonl`, or computing severity buckets.

## Scope
Implement `cli/src/lib/audit/findings.ts` — the canonical Finding type plus filesystem helpers (atomic append, dedupe, validation). First in merge order. No other audit biome can land before this freezes the schema and dedupe semantics.

## Deliverables by leaf

### `audit.findings.type`
- File: `cli/src/lib/audit/findings.ts`
- Exports: `Severity` union (`"critical" | "major" | "minor"`), `Finding` interface, `AuditSummary` interface — all shapes exactly per NUTRIENTS.md §1 and §2.
- Severity inline-documented with the contract-freeze / harvest / informational mapping (NUTRIENTS §1).
- Also export `findingId(parts: { tester_id: string; biome: string; summary: string; file_path?: string; line_range?: [number, number] }): string` — deterministic sha256 hex over `tester_id + "|" + biome + "|" + summary + "|" + (file_path||"") + "|" + (line_range ? line_range.join("-") : "")`. Lowercase hex. 64 chars.

### `audit.findings.writer`
- File: `cli/src/lib/audit/findings-writer.ts`
- `appendFinding(runDir: string, finding: Finding): Promise<void>` — atomic append to `<runDir>/findings.jsonl`. UTF-8, `\n`-terminated, one JSON per line. Reads existing lines to check dedupe by `id` before append. Skip-no-op on dupe (do not write a second line, do not throw).
- `readFindings(runDir: string): Promise<Finding[]>` — line-by-line parse; tolerate empty/missing file (return `[]`); throw only on malformed JSON (operator concern).
- Creates the directory if missing. Never throws on write failure — log a single stderr line and continue (mirror `cli/src/lib/telemetry/sink-jsonl.ts:append`).
- Use Node `fs/promises` + a serialized promise chain on a per-file basis to prevent concurrent appends from interleaving (mirror the `writeLeafState` serialization fix in `cli/src/commands/cultivate.ts` from 2026-05-10).

### `audit.findings.validate`
- File: `cli/src/lib/audit/findings-validate.ts`
- `validateFinding(finding: unknown): asserts finding is Finding` — runtime guard. Throws `AuditValidationError` with the offending field path if:
  - `severity` not in the union
  - `id` length ≠ 64 or not lowercase hex
  - `observed_at` not parseable as ISO-8601
  - `tester_id` does not start with `"tester."`
  - `repro_steps` is not an array of strings
- Pure function; no I/O.
- Re-exported from `findings.ts` for ergonomics.

## Contract dependencies
- NUTRIENTS.md §1 (Finding schema) — frozen at contract-freeze
- NUTRIENTS.md §2 (audit directory layout) — frozen

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `appendFinding` is idempotent — calling twice with the same `Finding` produces a single line in `findings.jsonl`.
- `readFindings` returns `[]` for a missing file (does not throw).
- `validateFinding` throws on each malformed shape enumerated above.
- `findingId` is deterministic — same inputs always produce same hex.

## Out of scope
- Aggregation / grouping by biome — `audit-aggregator`.
- Sporenet state.json writes — `audit-sporenet`.
- Heal-loop iteration record persistence — `audit-heal-loop` (lives at a different path).
- The testers themselves — `audit-testers`.

## Merge instructions
First in merge order. Other audit biomes have `blocked_by` paths waiting on the `Finding` type to land. No changes to existing framework code outside `cli/src/lib/audit/`.
