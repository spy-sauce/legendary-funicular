# HYPHA — cicd-agent

## CACHE HEADER
- **SCOPE:** GitHub Actions composite action that runs `plant → freeze → cultivate → harvest` with DDP stage wrappers emitting events.
- **PRIMITIVES:** action.yml composite · bash stage scripts · workflow_dispatch inputs · artifact upload.
- **RULES:** each DDP stage wrapped by `ddp-emit.sh` · non-deploy stages use best-available tooling, gracefully skip if missing · deploy stages are placeholder hooks users override.
- **COUPLING:** emits to the same JSONL that `telemetry-agent` writes; consumes `DDP_STAGES` constant.
- **LOAD WHEN:** any leaf touching `.github/`, shell stage scripts, or workflow configuration.

## Scope
Make `mycelium cultivate` runnable from CI. Every run produces telemetry events matching the DDP stage taxonomy so the dashboard can render phase 3 from real data.

## Deliverables by leaf

### `cicd.action.composite`
- File: `.github/actions/mycelium-run/action.yml`
- Composite action per NUTRIENTS.md §6 — inputs: brief-path, organism-name, max-concurrency, harvest-threshold, stack, anthropic-api-key; outputs: run-id, health, event-log-path.
- Steps: checkout → setup-node@v4 (Node 20) → `npm ci` in cli/ → `npm run build` → plant → freeze → 7 DDP stages (merge-order through deploy-prod) → cultivate → harvest → artifact upload.
- Each DDP stage invokes `.github/scripts/ddp-emit.sh <stage-id> start` before, `<stage-id> end <status>` after. Exit code of the stage determines status.
- Sets `ANTHROPIC_API_KEY` from the action input (mapped to env).

### `cicd.action.workflow`
- File: `.github/workflows/cultivate.yml`
- Triggers: `workflow_dispatch` with inputs (brief, max-concurrency, organism-name), and `push` to paths `brief.md` for demo.
- One job `cultivate`, `runs-on: ubuntu-latest`, `timeout-minutes: 60`.
- Calls the composite action. Secrets: `ANTHROPIC_API_KEY`, `MYCELIUM_SLACK_WEBHOOK` (optional), `MYCELIUM_S3_BUCKET` (optional).

### `cicd.ddp.emit`
- File: `.github/scripts/ddp-emit.sh`
- Usage: `ddp-emit.sh <stage-id> start` → appends a `ddp_stage_started` event; `ddp-emit.sh <stage-id> end <success|failure|skipped>` → appends `ddp_stage_ended` with wall_ms delta.
- Event file: reads `run_id` from `.mycelium/events/LATEST` (written by telemetry-emitter's `run_started`).
- Pure bash + `jq`. If `jq` missing, falls back to heredoc JSON; never blocks the pipeline.
- Writes one JSON line via `>> .mycelium/events/<run_id>.jsonl`.

### `cicd.ddp.stages`
- Dir: `.github/scripts/stages/`
- Files: `merge-order.sh`, `lint.sh`, `typecheck.sh`, `test.sh`, `build.sh`.
- Each script is a thin wrapper: detects if the relevant tool is available and runs it.
  - `merge-order.sh`: `mycelium cultivate --dry-run` to print and validate the plan.
  - `lint.sh`: runs `npm run lint` in cli/ if script exists, else echoes `skipped: no lint script` and exits 0 (marked "skipped" in telemetry).
  - `typecheck.sh`: `cd cli && npx tsc --noEmit`.
  - `test.sh`: `cd cli && npm test` if present, else skipped.
  - `build.sh`: `cd cli && npm run build`, verify `dist/index.js` exists.
- Each script called by the composite action between `ddp-emit.sh` calls.

### `cicd.ddp.deploy`
- Dir: `.github/scripts/stages/`
- Files: `deploy-stg.sh`, `smoke.sh`, `deploy-prod.sh`.
- All are **placeholder hooks** — they look for `./.github/hooks/<stage>.sh` in the consuming repo and exec it if present; otherwise echo `skipped: no deploy hook configured` and exit 0.
- `deploy-prod.sh` additionally gates on `$MYCELIUM_ALLOW_PROD == "true"`; exits skipped if unset.
- Document the hook override pattern in a comment at the top of each script.

## Contract dependencies
- NUTRIENTS.md §1 — event schema (emit format)
- NUTRIENTS.md §2 — DDP stage list (must match exactly)
- NUTRIENTS.md §6 — composite action contract

## Acceptance criteria
- `.github/actions/mycelium-run/action.yml` parses with `yamllint` / `actionlint` (eyeball it — we don't run linters here).
- Locally: `bash .github/scripts/ddp-emit.sh lint start` appends a valid `ddp_stage_started` event to a JSONL you point it at.
- Stage scripts are executable (`chmod +x` — commit with exec bit if git tracks it).
- All 8 DDP stage ids from NUTRIENTS.md §2 are represented in the composite action order.

## Out of scope
- Actually running Slack/GitHub-issue alerts from CI (that is `alerting-agent`'s upgrade — CI just triggers the cultivate run; alerting happens inside the Node process).
- DuckDB aggregation (that is `fleet-agent`).
- Dashboard rendering (that is `dashboard-agent`).

## Merge instructions
Merged second. Does not touch cli/src at all — purely `.github/` additions. Safe to merge in parallel with everything after telemetry-agent. If `.github/` already exists in the repo, additive only.
