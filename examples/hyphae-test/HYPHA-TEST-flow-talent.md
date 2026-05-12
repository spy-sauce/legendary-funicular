# HYPHA-TEST — tester.flow.talent

## CACHE HEADER
- **TESTER_ID:** tester.flow.talent
- **MIRRORS_BIOME:** audit-testers
- **SCOPE:** Validate tester runner spawns sessions with correct tool budget
- **INPUTS:** cli/src/lib/audit/testers-runner.ts, cli/src/lib/audit/testers.ts, NUTRIENTS.md
- **TOOLS:** Read, Bash

## Assertions
This tester validates that the tester runner enforces the correct tool budget
per NUTRIENTS §4: testers receive Read and Bash only, never Write or Edit.

**Tool budget contract checks:**
1. `runTester` function must exist in `testers-runner.ts`.
2. Tool budget passed to Claude Agent SDK session must not include `Write`.
3. Tool budget passed to Claude Agent SDK session must not include `Edit`.
4. `TesterDef.tools` defaults to `["Read", "Bash"]` per HYPHA-AUDIT-TESTERS-AGENT.md.
5. If a HYPHA-TEST declares Write or Edit in TOOLS, the runner must strip them and log a warning.

**Exit conditions:**
- Exit 0 if tool budget enforcement is correctly implemented.
- Exit 1 and emit a Finding if Write or Edit could leak into tester sessions.

## Repro recipe
1. Read `cli/src/lib/audit/testers-runner.ts` to locate `runTester` function.
2. Search for tool budget array construction passed to the Agent SDK.
3. Verify the array is filtered to exclude "Write" and "Edit" strings.
4. Check for warning log when stripping prohibited tools.
5. Run `npx tsc --noEmit` to confirm no type errors in the runner.

## Suggested fix template
The tester runner at `cli/src/lib/audit/testers-runner.ts` does not properly
enforce the Read+Bash-only tool budget. Add a filter step before session spawn:
`const safeTools = def.tools.filter(t => ["Read", "Bash"].includes(t))`.
Log a warning if any tools were stripped.
