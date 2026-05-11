# Hooks via Agent SDK — scoping pass for ECC-style hook adoption

**Status:** SCOPING — *not* build-ready · research-first · **no implementation
until decision gate clears**
**Source:** ECC adoption analysis (8 PreToolUse hooks) · advisor-flagged
plumbing concern
**Stored:** 2026-05-10

---

## The question

ECC's reliability gains come substantially from PreToolUse / PostToolUse /
Stop hooks — config-protection, fact-force gates, no-git enforcement, doc-file
warnings, governance capture. Several of those hooks would be load-bearing
for Mycelium leaves:

- `pre:bash:no-git` would *enforce* CLAUDE.md hard rule #1 (currently a
  prose instruction the leaf can rationalize around).
- `pre:config-protection` would block leaves from weakening `tsconfig.json`,
  `.eslintrc`, etc. when their code fails type-check.
- `pre:doc-file-warning` would surface unwanted `*.md` creation (the
  framework keeps producing these despite CLAUDE.md saying not to).
- `post:quality-gate` would re-run `tsc --noEmit` after a leaf's last edit
  and feed the failure back into the leaf's context — same idea as
  `--dry-run` but during cultivation, not after.

**Unknown:** ECC's hooks fire in the Claude Code *harness* (the desktop /
CLI process) via `~/.claude/settings.json` and bootstrap shims. Mycelium
leaves are spawned through `@anthropic-ai/claude-agent-sdk`, which is a
*different invocation surface*. We don't yet know whether the SDK exposes
a hook API rich enough to host these patterns, or whether porting them
requires non-trivial re-plumbing.

This document is the scoping pass before any code lands.

## Surface comparison

```
ECC (Claude Code harness)                         Mycelium (Agent SDK)
──────────────────────────                        ─────────────────────────
~/.claude/settings.json hooks                     query({ ...options })
   │                                                 │
   ├── PreToolUse (matcher: tool name)              ?  before-tool-use callback
   ├── PostToolUse                                  ?  after-tool-use callback
   ├── PreCompact                                   ?  N/A (different harness)
   ├── PostToolUseFailure                           ?  on-error callback
   ├── Stop                                         ?  on-finish callback
   ├── SessionStart                                 ?  N/A (orchestrator owns
   │                                                    leaf spawn — Mycelium
   │                                                    *is* the SessionStart)
   └── SessionEnd                                   ?  N/A — same as above

Hook script: arbitrary bash/node                  Hook callback: in-process JS
Hook output: stdout JSON; exit code controls     Hook output: ? (must verify)
allow/block                                       
```

The right-side `?` rows are the deliverable of this scoping. Each must be
answered with: (a) does it exist; (b) what's its shape; (c) does it support
*blocking* a tool call, or only *observing* it.

## ECC hook → Mycelium need mapping

| ECC hook | Why Mycelium wants it | Adoption rubric |
|---|---|---|
| `pre:bash:dispatcher` (no-git, push-guard) | Enforces hard rule #1; would have prevented run8's commit-attribution race | Easy port if SDK supports `canUseTool`-style block; medium if observe-only |
| `pre:write:doc-file-warning` | Leaves keep producing surplus `.md` despite instruction | Easy port — pure observation suffices; just emit a warning event |
| `pre:edit-write:suggest-compact` | N/A — Mycelium leaves are short-lived, no compaction | **Skip** |
| `pre:observe:continuous-learning` | Captures tool-use observations for later pattern extraction | Easy — fits cleanly as a telemetry sink |
| `pre:governance-capture` | Secrets / policy / approval-request capture | Medium — depends on whether SDK exposes a structured event channel |
| `pre:config-protection` | Block edits to `tsconfig.json`, `.eslintrc`, `package.json` deps | **Critical** — needs *blocking* hook semantics |
| `pre:mcp-health-check` | N/A — Mycelium leaves don't currently use MCP | **Skip** |
| `pre:edit-write:gateguard-fact-force` | Force investigation before first edit per file | Hardest — requires per-file state across tool calls |
| `post:quality-gate` (PostToolUse) | Re-run `tsc --noEmit` after edits, feed failures back | Medium — needs error-injection back into leaf context |
| `post:edit:console-warn` | Warn on `console.log` in edits | Easy — pattern match on tool input |
| `stop:format-typecheck` (Stop hook) | Batch format + tsc at leaf end | Maps to `afterLeaf` hook in `Upgrade` interface — already exists |
| `stop:check-console-log` | Final check before `FRUIT_READY` line | Maps to `afterLeaf` — already exists |
| `stop:cost-tracker` | Already exists in Mycelium (`cli/src/upgrades/cost-tracker.ts`) | **Already done** |

The `Stop` family in ECC roughly corresponds to Mycelium's existing
`afterLeaf` upgrade hook. The *gap* is the `PreToolUse` family — Mycelium
has no equivalent, and that's where the bulk of ECC's reliability lift comes
from.

## Investigation steps

This is the actual work to do *before* writing any hooks code.

### Step 1 — Read the SDK
- Inspect `node_modules/@anthropic-ai/claude-agent-sdk/dist/*.d.ts` for hook
  callback signatures.
- Specifically look for: `onToolUse`, `canUseTool`, `beforeMessage`,
  `interceptors`, `middleware`, anything that runs *between* the model
  emitting a tool call and the tool actually executing.
- Note whether the callback is sync or async, whether its return value can
  *cancel* the tool call, and whether it sees full tool input or just
  metadata.

### Step 2 — Prototype the cheapest hook
- Pick `pre:write:doc-file-warning` (observe-only, low risk) or
  `pre:bash:no-git` (block-required, high signal).
- Wire one hook end-to-end through whatever SDK surface step 1 surfaces.
- Run a 1-leaf cultivation against a fixture that triggers the hook. Verify
  the hook fires and behaves as expected.
- Time-box: 2 hours. If the SDK surface doesn't allow it, that's a
  finding — record and move on.

### Step 3 — Decision matrix

After step 2 produces evidence, classify each ECC hook in the table above
into one of:

- **EASY** — port the script content as a hook callback. ≤1 day per hook.
- **MEDIUM** — needs adapter (e.g., re-emitting the result as a Mycelium
  telemetry event). ~2–3 days per hook.
- **HARD** — requires SDK changes, fork, or a different harness entirely.
  Defer to a v2 question.
- **SKIP** — not applicable to Mycelium's leaf model.

Output: a one-page table that the user can use to decide *which subset* to
build, given the actual cost.

### Step 4 — Path-not-taken analysis (briefly)

If the SDK surface is too thin, three escape hatches exist:

1. **Wrap the SDK.** Mycelium already wraps `query()` at `cultivate.ts:480`.
   Add a `transformPrompt`-style wrapper that intercepts certain tool
   patterns *via system-prompt augmentation* — weaker than blocking, but
   doesn't require SDK hook surface.
2. **Hook at the Bash boundary.** Bash is the highest-leverage tool surface
   (everything from git to package install). If the SDK lets us replace the
   `Bash` tool implementation (likely — most SDKs let consumers register
   custom tools), wrap the default Bash with a guard layer. Same idea as
   `pre:bash:dispatcher`, just expressed differently.
3. **Multi-harness reach via OpenRouter (Lane B).** The Router 30-day plan's
   Lane B (`mycelium llm`) bypasses the Agent SDK entirely and calls
   OpenRouter directly. Hooks in that lane are wholly under our control —
   no SDK constraint. *Worth tracking:* if the user's "broader harness
   reach" goal is the priority, Lane B is where harness-portability work
   pays off, not the Agent SDK lane.

## Decision gate (must clear before any hooks code lands)

Concrete artifacts required before this scoping doc converts to a build
plan:

- [ ] One-page SDK hook surface inventory (output of step 1)
- [ ] One working prototype hook (output of step 2)
- [ ] Classification table — EASY / MEDIUM / HARD / SKIP per ECC hook
- [ ] Estimate: total dev days to port the EASY tier only
- [ ] Comparison vs. effort of expanding `transformPrompt` / custom-Bash
      escape hatches

If EASY tier ports cleanly in ≤5 days total → proceed with a build spec.
If everything classifies MEDIUM or harder → recommend escape hatch (#1 or
#2) instead, and revisit after Lane B ships in the Router 30-day plan.

## What this is *not*

- **Not a build plan.** Until step 1–4 produce evidence, anything past this
  doc is speculation.
- **Not a Claude Code harness adoption.** Mycelium does not become a Claude
  Code wrapper. The SDK is the integration point; hooks ride the SDK or
  they don't ride at all.
- **Not multi-harness reach in itself.** Hooks improve *single-harness
  reliability*. The harness-portability question — "can Mycelium drive
  Codex / Cursor / Opencode leaves?" — is a separate scope, partially
  addressed by Router Lane B.

## Open questions to resolve in scoping

1. Does the Agent SDK expose a sync `canUseTool(tool, input) => boolean |
   string` callback, or only async observation? **Critical** — determines
   whether `config-protection` and `bash-dispatcher` are even possible.
2. Can we register custom tool implementations that *replace* the default
   `Bash`, `Write`, `Edit` tools? If yes, that's a fallback for blocking
   semantics regardless of explicit hook support.
3. Is hook callback failure (thrown error) treated as tool-call abort, or as
   silent failure? Determines blast radius of a buggy hook.
4. Do hooks see the *current* leaf's context (organism, leaf_id, tag) or
   are they globally scoped? If the latter, we need to thread leaf context
   through closure capture in `cultivateLeaf`.
5. Does the SDK persist hook state across tool calls within one leaf?
   `gateguard-fact-force` needs per-file state ("first edit" semantics);
   without persistence, we'd need an external store (memory map keyed by
   `leaf_id + file_path`).

## Files touched (during scoping)

None. This is read-only research:

- `cli/node_modules/@anthropic-ai/claude-agent-sdk/dist/*.d.ts` — read
- `cli/src/commands/cultivate.ts:480` — read context only
- `cli/package.json` — confirm SDK version pinned

A follow-up build spec (`docs/hooks-via-agent-sdk-build.md`) would be
authored *after* the decision gate clears.

## References

- `docs/mycelium-router-30day-plan.md` Lane B — the alternative path for
  harness-portability work
- ECC `hooks/hooks.json` — the 25-hook taxonomy this scopes against
- ECC `safety-guard` skill — the conceptual model (Careful / Freeze / Guard
  modes) that hooks would implement on the Mycelium side
- CLAUDE.md hard rule #1 (don't run `git`) — the most concrete example of
  a prose rule that should become a hook
