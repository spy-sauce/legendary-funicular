# HYPHA-TEST — tester.types

## CACHE HEADER
- **TESTER_ID:** tester.types
- **MIRRORS_BIOME:** audit-findings
- **SCOPE:** Validate Finding and Severity type exports in cli/src/lib/audit/findings.ts
- **INPUTS:** cli/src/lib/audit/findings.ts, NUTRIENTS.md
- **TOOLS:** Read, Bash

## Assertions
This tester validates that the Finding interface and Severity union exported from
`cli/src/lib/audit/findings.ts` match the frozen contract in NUTRIENTS.md §1.

**Type contract checks:**
1. `Severity` must be a union of exactly `"critical" | "major" | "minor"`.
2. `Finding` interface must include all required fields: `id`, `tester_id`, `biome`, `severity`, `summary`, `detail`, `repro_steps`, `suggested_fix`, `observed_at`, `iteration`.
3. `Finding` interface must include optional fields: `file_path`, `line_range`.
4. `line_range` must be typed as `[number, number]` (two-element tuple).
5. `repro_steps` must be typed as `string[]`.

**Exit conditions:**
- Exit 0 if all assertions pass.
- Exit 1 and emit a Finding if any type mismatch is detected.

## Repro recipe
1. Read `cli/src/lib/audit/findings.ts` to extract type definitions.
2. Run `npx tsc --noEmit cli/src/lib/audit/findings.ts` to validate syntax.
3. Grep for `export type Severity` and verify union members.
4. Grep for `export interface Finding` and verify all fields present.
5. Compare extracted field types against NUTRIENTS.md §1 frozen schema.

## Suggested fix template
The Finding type definition in `cli/src/lib/audit/findings.ts` does not match
NUTRIENTS.md §1. Update the interface to include the missing or mistyped field:
`<field_name>: <expected_type>`.
