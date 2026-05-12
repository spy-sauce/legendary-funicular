# Contract Tests from NUTRIENTS — replace harvest's `-t 0.8` heuristic

**Status:** Build-ready · 3-phase plan · code-grounded
**Source:** ECC `ai-regression-testing` adoption + run8 bug 2 (silent contract drift)
**Stored:** 2026-05-10

---

## Context

Harvest today gates on a count: `fruitReady.length / agents.length >= 0.8`
(`cli/src/commands/harvest.ts:129,169`). This says nothing about whether the
leaves *actually produced what the contracts demand*. Run8 illustrated the
gap exactly:

- Cultivate reported 10/10 FRUIT_READY (252 files).
- talent-onboarding's commit was silently absorbed into discovery's
  (HANDOFF bug 2). The output looked correct on disk; the *contract*
  ("each leaf gets its own commit") was violated invisibly.
- Harvest threshold passed every check anyway, because file counts looked
  right.

Mycelium already has the answer to "what should each leaf produce" — the
frozen contracts in `NUTRIENTS.md`. The `event_schema`, `DDP_STAGES` array,
`Upgrade` interface, `SporeNetState` shape, and the server route table are
all explicit specifications, machine-readable, and *the source of truth* for
cross-leaf coordination. We never compare them against actual leaf output.

This spec generates contract tests **from those frozen stubs** at harvest
time and uses the pass rate as the threshold gate.

The honest constraint: contract tests can only catch contract-shape
violations (wrong field name, missing event kind, route returns 500 instead
of 200). They cannot catch semantic bugs ("the events were emitted but the
data is wrong"). For semantic catches, see `docs/mycelium-eval-spec.md` —
the two compose.

## Architecture

```
mycelium harvest
  │
  ├── (existing) load mycelium.yaml + sporenet/state.json
  │
  ├── (new) load NUTRIENTS.md, parse fenced blocks tagged
  │         #contract:event_schema | #contract:ddp_stages |
  │         #contract:upgrade_interface | #contract:sporenet_state |
  │         #contract:server_routes
  │
  ├── (new) for each contract, run its generator → produce assertions
  │
  ├── (new) execute assertions against live cultivation artifacts:
  │         .mycelium/events/<run_id>.jsonl
  │         sporenet/state.json
  │         cli/src/upgrades/*.ts (TS-AST shape check)
  │         http://localhost:<port>/api/* (if sporenet is up)
  │
  └── (new) gate: contract_pass_rate >= --contract-threshold (default 1.0)
            falls back to file-count threshold only when no contracts
            apply (e.g., a non-DDP cultivation with no NUTRIENTS.md)
```

## Contract block format in NUTRIENTS.md

NUTRIENTS already contains code blocks. We add a single tag annotation per
block to make them machine-discoverable. Example:

```ts contract:event_schema
interface BaseEvent {
  v: 1;
  run_id: string;
  organism: string;
  ts: string;
  kind: EventKind;
  data: Record<string, unknown>;
}
type EventKind =
  | "run_started"  | "leaf_started"  | "leaf_fruited"  | "leaf_failed"
  | "run_ended"    | "ddp_stage_started" | "ddp_stage_ended"
  | "alert"        | "cost_recorded";
```

The fence-language extension (`ts contract:event_schema`) is ignored by
markdown renderers — `ts` is the syntax highlight, `contract:event_schema`
is metadata for our parser. **No reflow of NUTRIENTS.md is required**;
this is additive.

Six initial contract types map to NUTRIENTS sections 1–6:

| Tag | Source section | Generator | Assertion |
|---|---|---|---|
| `contract:event_schema` | §1 | TS interface → JSON Schema | Every emitted event in `events/<run_id>.jsonl` matches schema |
| `contract:ddp_stages` | §2 | parse `DDP_STAGES` const array | `templates/scale.html` lines `272-281` match ids+order; `cli/src/lib/telemetry/ddp-stages.ts` exports same array |
| `contract:upgrade_interface` | §3 | TS interface → required keys | All registered upgrades (`registry.ts`) implement the interface (TS-AST check) |
| `contract:sporenet_state` | §4 | TS interface → required keys + enum check | `sporenet/state.json` has all required fields; `status` values are in the enum |
| `contract:server_routes` | §5 | parse route table → URL list | `mycelium sporenet serve` responds 200 + correct `content-type` to each route |
| `contract:gh_action_io` | §6 | parse YAML → required inputs/outputs | `.github/actions/mycelium-run/action.yml` declares all required inputs |

## Contract runner

```
cli/src/lib/contracts/
  ├── parser.ts      — extract fenced blocks tagged #contract:* from NUTRIENTS.md
  ├── generators/
  │     ├── event-schema.ts
  │     ├── ddp-stages.ts
  │     ├── upgrade-interface.ts
  │     ├── sporenet-state.ts
  │     ├── server-routes.ts
  │     └── gh-action-io.ts
  ├── runner.ts      — orchestrates generators, collects results
  └── report.ts      — human table + JSON for --json mode
```

Each generator is a pure function `(contractText: string, ctx: HarvestCtx) =>
ContractAssertion[]`. Each `ContractAssertion` has:

```ts
interface ContractAssertion {
  contract_id: string;        // e.g., "event_schema/leaf_fruited"
  description: string;        // human-readable
  check: (artifacts: Artifacts) => Promise<AssertionResult>;
}
type AssertionResult =
  | { status: "pass" }
  | { status: "fail", detail: string, location?: string }
  | { status: "skip", reason: string };  // e.g., no events file produced
```

The runner walks all assertions in parallel where independent, sequentially
where ordered (server routes need `sporenet serve` to be up — runner spawns
+ teardown).

## Integration with `mycelium harvest`

New flag: `--contract-threshold <number>` (default `1.0`). Invocation:

```bash
mycelium harvest                                  # uses both gates (legacy + contract)
mycelium harvest -t 0.8                           # legacy file-count gate only (back-compat)
mycelium harvest --contract-threshold 1.0         # require all contracts pass
mycelium harvest -t 0.8 --contract-threshold 0.95 # both gates must pass
```

Default behavior change: when `NUTRIENTS.md` exists *and* contains tagged
contract blocks, harvest auto-applies `--contract-threshold 1.0` in addition
to the file-count gate. When NUTRIENTS is absent or untagged, behavior is
identical to today (rule #3: don't break prior organisms).

Output extends the existing harvest table:

```
  🧺 Harvest Time — collecting deliverables from the organism...

  ✅ schema-core      feat/schema-core      FRUIT_READY   ...
  ✅ design-system    feat/design-system    FRUIT_READY   ...
  ⏳ talent-onboarding feat/talent-onboarding GROWING      ...

  🎉 File-count threshold: 90% >= 80%

  📜 Contract Pass Report
  ┌────────────────────────────┬────────┬───────┬─────────────────────────────┐
  │ Contract                    │ Total  │ Pass  │ Detail                       │
  ├────────────────────────────┼────────┼───────┼─────────────────────────────┤
  │ event_schema/leaf_started  │ 10     │ 10    │ ✓                            │
  │ event_schema/leaf_fruited  │ 10     │ 9     │ talent-onboarding: missing   │
  │ ddp_stages/order           │ 1      │ 1     │ ✓                            │
  │ sporenet_state/required    │ 1      │ 1     │ ✓                            │
  │ server_routes/api_state    │ 1      │ 1     │ ✓                            │
  └────────────────────────────┴────────┴───────┴─────────────────────────────┘

  ⚠️  Contract threshold not met: 95% < 100%
       talent-onboarding never emitted leaf_fruited (consistent with
       HANDOFF bug 2 — silent commit-skip)

  ❌ NOT READY TO SHIP
```

Note how the contract gate would have surfaced run8 bug 2 *before* anyone
inspected git history. That's the win.

## Why this composes with eval

`mycelium-eval-spec.md` adds a `contract` judge type:

```yaml
judge:
  - type: contract
    schema: nutrients.event_schema
    against: .mycelium/events/<run_id>.jsonl
```

The eval judge calls into the same generators in
`cli/src/lib/contracts/generators/`. Build the runner once, consume it from
both `harvest` and `eval`. Single source of truth for "what is a passing
contract."

## Phased build plan

### Phase 1 — Parser + two generators (1 day)
- `cli/src/lib/contracts/parser.ts` — fenced-block extractor
- `event-schema.ts` + `sporenet-state.ts` generators (highest run8 leverage —
  these would have caught bug 2 + bug 1 respectively)
- `runner.ts` skeleton with sequential execution
- Wire into `harvest.ts` behind `--contract-threshold`; default off (opt-in
  for v0)
- Tag the corresponding NUTRIENTS.md sections with `contract:event_schema`
  and `contract:sporenet_state`. Backward compatible — older NUTRIENTS files
  without tags simply yield zero contracts.

### Phase 2 — Three more generators (1.5 days)
- `ddp-stages.ts` — diff-based check across all three sources
- `upgrade-interface.ts` — TS AST walk via TypeScript Compiler API (already
  a transitive dep of `@anthropic-ai/claude-agent-sdk`; no new dep)
- `server-routes.ts` — spawns `sporenet serve --port 0`, hits endpoints,
  tears down. Uses Node `fetch` (Node 18+ has it native — rule #4 satisfied)

### Phase 3 — Default-on + cross-cultivation generalization (1 day)
- `gh-action-io.ts` — YAML parse against `action.yml`
- Default `--contract-threshold 1.0` when NUTRIENTS.md has tagged contracts
- Doc pass: `DEVELOPER_GUIDE.md` append-only addition explaining how to tag
  blocks in a *new* cultivation's `NUTRIENTS.md`. Example NUTRIENTS for a
  hypothetical "shopify-storefront" cultivation showing how to write
  cultivation-specific contracts.

**Total runway:** ~3.5 days. No new npm/pip/maven deps. No changes to
cultivate.ts public contract.

## Edge cases

- **NUTRIENTS.md missing.** Harvest behaves like today. No contracts to
  evaluate; file-count gate is sole gate.
- **Contract refers to a file the cultivation didn't produce.** Result:
  `skip` (with reason). `skip` count is shown in the report but does not
  fail the gate. (Otherwise, every cultivation would fail unless it covered
  every contract.)
- **`sporenet serve` already running on the same port.** Runner uses port 0
  (kernel-assigned). Spawns a temp server bound to its own port; tears down
  on completion or error.
- **Contract block parse error.** Logged loudly, treated as `fail` (not
  `skip`) — a malformed contract is a NUTRIENTS bug that should block
  harvest, same as a malformed YAML config does today.
- **Generator throws.** Treated as `fail` with the error message in
  `detail`. Other contracts continue to evaluate.

## Anti-patterns

- **Auto-generating contract blocks.** NUTRIENTS is human-authored and
  human-frozen. The runner *consumes* contracts; it never *writes* them.
- **Inferring contracts from code.** Contracts are declarative — they
  describe what code *should* do. Inferring them from current code makes the
  test always pass on the day it's written. Wrong direction.
- **Loosening contracts to make tests pass.** If a contract test fails,
  either the code is wrong or the contract is wrong. Fix one or the other —
  never relax the assertion to make red go green.
- **Adding a contract per file.** Contracts cover *cross-leaf coordination*.
  Within-leaf correctness is in-scope for `mycelium eval`, not contract
  tests. Don't bloat NUTRIENTS with per-file expectations.

## Open questions

1. Should `harvest` auto-fail on a single contract `fail`, or only when
   pass-rate dips below `--contract-threshold`? Default 1.0 makes them
   equivalent for the headline case. **Lean: pass-rate, with default 1.0
   — gives operators a knob if they need it.**
2. Where does the contract report persist? `harvest --json` shows it; is
   there a per-run artifact? **Lean: write to
   `.mycelium/contracts/<run_id>.json` for fleet-view aggregation later.**
3. Is the AST check on `Upgrade` interface a build-time check (during
   `tsc --noEmit`) or a runtime check (during harvest)? Build-time would
   catch drift earlier. **Lean: both — a build-time TS type check is free
   and the runtime check covers the case where someone adds a new upgrade
   between builds.**
4. Should custom cultivations declare their own contracts in
   cultivation-scoped `NUTRIENTS.md`, with the framework providing only the
   parser + generator scaffolding? **Lean: yes — the six initial generators
   ship as framework defaults; cultivations can register additional
   generators via the same `cli/src/lib/contracts/generators/` shape.**

## Files touched

```
cli/src/lib/contracts/parser.ts             (new)
cli/src/lib/contracts/runner.ts             (new)
cli/src/lib/contracts/report.ts             (new)
cli/src/lib/contracts/generators/*.ts       (new)
cli/src/commands/harvest.ts                 (additive — flag + gate; existing
                                             logic untouched)
NUTRIENTS.md                                 (annotate fenced blocks with
                                             contract:* tags; no content change)
DEVELOPER_GUIDE.md                          (append-only — contract authoring
                                             guide, phase 3)
```

## References

- `docs/mycelium-eval-spec.md` — consumes the same generators via the
  `contract` judge type
- `cli/src/commands/harvest.ts:129,169` — current `-t 0.8` gate
- `NUTRIENTS.md` — six contract sections that drive initial generators
- HANDOFF 2026-05-09 — run8 bug 2 (the silent contract violation this gate
  would have caught)
- ECC `ai-regression-testing` skill — sandbox-mode test pattern, the
  AI-blind-spot framing
