# HYPHA — audit-docs

## CACHE HEADER
- **SCOPE:** Developer documentation — `DEVELOPER_GUIDE.md` audit-run section + operator runbook for authoring `HYPHA-TEST-*.md` files.
- **PRIMITIVES:** Markdown composition · cross-linking · realistic worked examples.
- **RULES:** **append-only edits** to `DEVELOPER_GUIDE.md` — do not rewrite existing sections (framework convention) · runbook lives in `docs/`, not at repo root · examples reference real spec sections by file:line where helpful · do not duplicate NUTRIENTS content (link, don't restate).
- **COUPLING:** documents the public surface authored by the other six biomes. Last in merge order.
- **LOAD WHEN:** any leaf writing developer-facing documentation for audit-run.

## Scope
Document audit-run from the operator's perspective. Two artifacts: a section in the existing `DEVELOPER_GUIDE.md` (command surface, lifecycle, integration), and a runbook in `docs/` for the tester-authoring workflow (the operator-written-testers lean from §10.7).

This biome should land after the others, so the docs can reference real shipped behavior and not the spec's hypotheticals.

## Deliverables by leaf

### `audit.docs.guide`
- File: `DEVELOPER_GUIDE.md` — **append** a new top-level section titled "Audit-Run". Do not modify existing sections.
- Section contents:
  - **What it is** — one paragraph framing the symmetric-test-cultivation idea from spec §1 (cultivate plants, audit-run inspects).
  - **When to use it** — bullets: after every cultivate of a real-client workload; before merging a heal-loop autofix; for `--against <prior-run>` regression triage.
  - **Command surface** — table of every flag from NUTRIENTS §7 with one-line descriptions. Reference `cli/src/commands/audit-run.ts` for source.
  - **Output layout** — code-fenced tree of `audit/<ts>/` per NUTRIENTS §2. Note the gitignore + `summary.json` commit pattern (§10.4 lean).
  - **The Finding shape** — quote the `Finding` interface from `cli/src/lib/audit/findings.ts` with a worked example (use the run8 talent-onboarding finding from spec §5 — quote the JSON).
  - **Autofix loop** — walk through the §9 worked example (cultivate completes → audit-run finds the bug → autofix re-cultivates affected biome → audit-run clean). Mention the termination conditions in plain English.
  - **Sporenet integration** — screenshot-or-description of the Audit pane; reference `state.audit` block in `cli/src/commands/sporenet.ts`.
  - **Authoring testers** — one paragraph pointing at the runbook (deliverable below).
- Length budget: ~150 lines of new markdown. Tight.

### `audit.docs.runbook`
- File: `docs/audit-run-tester-authoring.md`
- Operator-facing runbook for writing `HYPHA-TEST-*.md` files in a cultivation.
- Contents:
  - **Two paths in** — `mycelium audit-run scaffold-tester <biome>` (recommended) or hand-author from the schema (NUTRIENTS §6).
  - **The CACHE HEADER fields** — what each one does, with examples drawn from `examples/hyphae-test/HYPHA-TEST-*.md` (the fixtures shipped by `audit-testers`).
  - **Writing assertions** — guidance on the deterministic exit-code / file / row / grep conditions (spec §4 calls these out). Show one assertion of each style:
    - exit-code (e.g., `tsc --noEmit` returns 0)
    - file presence (e.g., specific file exists or matches regex)
    - DB row check (e.g., `psql ... | grep` predicate)
    - Maestro flow assertion (spec §10.3 lean for v1)
  - **Repro recipe** — ordered command list the tester runs; same commands flow into `finding.repro_steps` on fail.
  - **Suggested fix template** — what to write so the re-plant leaf can consume it as an acceptance criterion. The talent-onboarding example from spec §5 is the canonical reference.
  - **Tool budget** — Read + Bash. Why no Write/Edit. What the runner does if a HYPHA tries to declare Write.
  - **Common patterns** — cross-cutting testers (types, security), mirror-biome testers, contract-delegating testers (the `tester.contract` pattern — flag that it stubs to a no-op until `contract-tests-from-nutrients` ships per spec §7 sequencing).
- Length budget: ~200 lines.

## Contract dependencies
- NUTRIENTS.md §1, §2, §3, §6, §7 — referenced by both deliverables; do not restate verbatim, link by section.

## Acceptance criteria
- `DEVELOPER_GUIDE.md` has a new top-level `## Audit-Run` section (or `# Audit-Run` if the file uses single-`#` top-level sections; match the existing style).
- All NUTRIENTS §7 flags appear in the command-surface table.
- The runbook references at least one example HYPHA-TEST file from `examples/hyphae-test/`.
- The autofix loop walkthrough references the run8 talent-onboarding finding by its key facts (8-step wizard, empty `talent_profiles` row, lift state to context).
- No edits to existing `DEVELOPER_GUIDE.md` sections (verify with `git diff DEVELOPER_GUIDE.md` — only new lines appended at the bottom or in a new section).

## Out of scope
- Marketing / external-facing positioning (separate concern; `arch-brief.md` if needed).
- Translating to other languages.
- Auto-generating docs from code annotations — manual prose is fine for v1.

## Merge instructions
Last in merge order. Reads from every other audit biome's shipped behavior — do not start writing until the others have produced their files (the framework's wave-based cultivation gives this for free, but if this leaf wakes up before another biome's files exist, halt and emit FRUIT_FAILED with the missing path).
