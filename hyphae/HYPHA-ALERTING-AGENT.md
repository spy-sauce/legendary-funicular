# HYPHA — alerting-agent

## CACHE HEADER
- **SCOPE:** alert upgrade that fires to Slack + GitHub issues on crash, leaf failure, and health thresholds.
- **PRIMITIVES:** webhook poster · gh CLI subprocess · trigger policy evaluator.
- **RULES:** never throw from a hook · sinks are env-gated and feature-detected · trigger policy is configurable via `organism.alerting`.
- **COUPLING:** composes with telemetry-emitter (emits `alert` events); independent sinks that also post externally.
- **LOAD WHEN:** any leaf touching alert delivery, trigger thresholds, or Slack/GitHub integration.

## Scope
When things go wrong, someone needs to know. Hook into the Upgrade lifecycle, evaluate trigger policy, fan out to configured sinks, and emit an `alert` telemetry event so the dashboard also shows it.

## Deliverables by leaf

### `alerting.hook.upgrade`
- File: `cli/src/upgrades/alerting.ts`
- Default export: `Upgrade` with `name: "alerting"`, `category: "runtime"`.
- Hooks:
  - `afterLeaf(ctx)` — if leaf failed, evaluate triggers with `source: "leaf-failure"`.
  - `onCrash(ctx)` — always fire, severity `critical`, source `crash`.
  - `beforePlan(ctx)` — attach the current run's organism + run_id so triggers can reference them later.
- Trigger dispatch: synchronously build `AlertPayload` (NUTRIENTS.md §7), then fire-and-forget to each configured sink. Also `ctx.emit?.("alert", payload)` if telemetry-emitter present.
- Register in `cli/src/upgrades/registry.ts`.

### `alerting.hook.triggers`
- File: `cli/src/lib/telemetry/alert-triggers.ts`
- `evaluateTriggers(policy, evt): AlertPayload | null` — returns a payload if the event trips a trigger, else null.
- Policy shape (read from `mycelium.yaml` → `organism.alerting`, all optional):
  ```yaml
  organism:
    alerting:
      on_crash: true
      on_leaf_failure: true
      health_threshold: 0.7          # fire if end-of-run health < this
      biome_fail_rate: 0.5           # fire if any biome's fail_rate > this
  ```
- Also implement `evaluateEndOfRun(events, policy)` — called from the run summary path, returns zero or more payloads.

### `alerting.sinks.slack`
- File: `cli/src/lib/telemetry/sink-slack.ts`
- `postSlack(payload): Promise<void>`
- Reads `MYCELIUM_SLACK_WEBHOOK` env. If unset, returns immediately.
- Builds Block Kit JSON with severity emoji (info:🔵 warn:🟡 error:🔴 critical:🚨), title as header, detail as markdown section.
- POSTs with `fetch` (Node 20 native). 5s timeout. Catches all errors, logs to stderr, never throws.

### `alerting.sinks.github`
- File: `cli/src/lib/telemetry/sink-github.ts`
- `postGitHubIssue(payload): Promise<void>`
- Feature-detects `gh` via `which gh` / `execFileSync("gh", ["--version"])`. If missing, returns immediately.
- Calls `gh issue create --title "[mycelium][<severity>] <title>" --body "<detail>" --label "mycelium,<severity>"`.
- Requires `GH_TOKEN` or `gh` already authed — neither is our responsibility; log if creation fails.
- Rate limit guard: if the same title fired in the last 5 minutes (in-memory cache), skip. Prevents storms.

## Contract dependencies
- NUTRIENTS.md §1 — event schema (`alert` payload)
- NUTRIENTS.md §7 — alert payload shape
- `telemetry-emitter` upgrade — soft dependency for emitting `alert` events to the dashboard

## Acceptance criteria
- `npx tsc --noEmit` passes.
- Upgrade registered and visible in `mycelium upgrades list`.
- Running cultivate with `upgrades: [telemetry-emitter, alerting]` and a forced leaf failure produces an `alert` event in the JSONL.
- With `MYCELIUM_SLACK_WEBHOOK=<test webhook>`, the Slack webhook is called (can't verify delivery in this repo — just the POST attempt).
- With Slack unset and gh unauthenticated, the run completes without errors from alerting code.

## Out of scope
- Email / PagerDuty / Discord sinks. V2.
- UI component for alerts on the dashboard (dashboard-agent shows the alert events naturally via the event stream).
- Alert acknowledgment / suppression beyond in-memory de-dup.

## Merge instructions
Merged fourth. Touches: `cli/src/upgrades/alerting.ts` (new), `cli/src/lib/telemetry/alert-*.ts` (new), `cli/src/upgrades/registry.ts` (add entry). No edits to existing upgrades or to `cultivate.ts`.
