# HYPHA — audit-sporenet

## CACHE HEADER
- **SCOPE:** Phase 3 — extend `sporenet/state.json` with an optional `audit` block; extend `sporenet serve` `/` handler to render an Audit pane below the leaf grid.
- **PRIMITIVES:** atomic temp-file/rename writes (mirror `writeLeafState` from cultivate.ts 2026-05-10 fix) · `sporenet serve` re-reads state.json on every request (F5 path) — additions auto-flow.
- **RULES:** `state.audit` is **optional** — must not break existing readers that don't know about it (framework rule #9: preserve state.json shape) · the Audit pane renders only when `state.audit` is present · drain pending audit writes before audit-run exit (mirror `drainLeafStateWrites`).
- **COUPLING:** consumes `AuditSummary` from `audit-findings`. Read by `sporenet serve` (existing — extend, do not replace).
- **LOAD WHEN:** any leaf touching `sporenet/state.json`, the `sporenet serve` HTML renderer, or audit progress visibility.

## Scope
Implement the sporenet integration. Two surfaces: a writer that updates the audit block during a run, and a renderer extension that surfaces audit progress in the live dashboard.

The F5 path means we don't need any new server endpoints — just emit state.json updates and extend the existing renderHtml.

## Deliverables by leaf

### `audit.sporenet.state`
- File: `cli/src/lib/audit/sporenet-integration.ts`
- Export `SporenetAuditBlock` interface per NUTRIENTS §3.
- `writeAuditBlock(stateDir: string, block: SporenetAuditBlock): Promise<void>`
  - Reads `<stateDir>/sporenet/state.json`.
  - Merges `audit: block` into the root object (preserving all existing fields verbatim).
  - Writes via atomic temp-file/rename (mirror the `writeLeafState` pattern in `cli/src/commands/cultivate.ts`).
  - Returns a `Promise<void>`; serialized internally via a per-file promise chain so concurrent writes never lose updates.
- `drainAuditStateWrites(): Promise<void>` — awaitable by audit-run before exit to ensure all pending writes flush.
- `clearAuditBlock(stateDir: string): Promise<void>` — removes the `audit` key from state.json (for clean state at next cultivation).

### `audit.sporenet.render`
- File: extend `cli/src/commands/sporenet.ts` (or `cli/src/commands/sporenet/render.ts` if the file has been split per the F5 path notes).
- Locate the `renderHtml` function. Add a new helper `renderAuditPane(audit: SporenetAuditBlock): string` that returns an HTML fragment.
- Insert the audit pane immediately below the leaf grid in the existing template. Render only when `state.audit` is present.
- Pane contents:
  - Header: `Audit-Run · <status> · iteration <n>`
  - One row per severity with the count: `critical · major · minor`
  - Affected biomes (chip list)
  - `last_run_at` formatted as relative time
  - When `status === "running"` and `started_at` is recent, render a subtle pulse animation (same primitive the leaf grid uses for in-flight leaves).
- The pane must be plain HTML/CSS — no new JS, no new dependencies (matches `templates/scale.html` conventions).
- **Preserve every existing renderHtml output verbatim.** If a refactor is tempting, halt and flag — phase 3 is additive only.

## Contract dependencies
- NUTRIENTS.md §2 (audit directory layout — `last_run_at` source) — frozen
- NUTRIENTS.md §3 (sporenet audit block schema) — frozen

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `writeAuditBlock` is idempotent — calling twice with the same block produces identical state.json.
- `writeAuditBlock` preserves all existing state.json fields (verify by snapshot before/after for a sample state).
- Concurrent `writeAuditBlock` calls do not lose updates (serialization chain works).
- `sporenet serve` `/` request with a state.json that has no `audit` field returns the same HTML as before this change (byte-for-byte if practical — at minimum semantically equivalent).
- `sporenet serve` `/` request with a state.json that includes a populated `audit` block renders an Audit pane with all five severity counts visible.

## Out of scope
- The audit run itself — `audit-cli` invokes `writeAuditBlock` from inside the run lifecycle.
- New routes on the sporenet server — the F5 path means we re-read state.json on every `/` request; no new endpoints required.
- The leaf grid renderer — untouched.

## Merge instructions
After `audit-findings`. Imports `AuditSummary` from there for typing the source of the audit block fields. Extends — does not replace — `cli/src/commands/sporenet.ts`. Preserves all existing exports and CLI behavior per framework rule #9.
