# HYPHA — telemetry-agent

## CACHE HEADER
- **SCOPE:** event emitter upgrade + JSONL/S3 sinks — the backbone all other biomes depend on.
- **PRIMITIVES:** `Upgrade` hooks · JSONL append · run_id generation · EventKind builders.
- **RULES:** never throw out of a hook · never block a leaf on sink failure · event schema is frozen in NUTRIENTS.md §1.
- **COUPLING:** every biome consumes our events; we consume only the Upgrade lifecycle.
- **LOAD WHEN:** any leaf emitting or consuming telemetry events, defining event shapes, or touching `.mycelium/events/`.

## Scope
Implement `telemetry-emitter` as a new bundled Upgrade. It generates a `run_id`, writes one JSONL event per lifecycle transition, and exposes a sink abstraction so other upgrades (cost-tracker, alerting) can emit through the same pipe.

## Deliverables by leaf

### `telemetry.emitter.upgrade`
- File: `cli/src/upgrades/telemetry-emitter.ts`
- Default export: `Upgrade` with `name: "telemetry-emitter"`, `category: "runtime"`.
- Hooks:
  - `beforePlan(ctx)` — generate `run_id`, open JSONL file at `.mycelium/events/<run_id>.jsonl`, emit `run_started`. Attach `{ runId, emit }` onto `ctx` so other upgrades can call `ctx.emit(kind, data)`.
  - `beforeSpawn(ctx)` — emit `leaf_started`. Return `true` (never skip).
  - `afterLeaf(ctx)` — emit `leaf_fruited` (on success) or `leaf_failed`.
  - `onCrash(ctx)` — flush open events; emit `run_ended` with partial counts.
- Register in `cli/src/upgrades/registry.ts`.

### `telemetry.emitter.events`
- File: `cli/src/lib/telemetry/events.ts`
- Exports: `EventKind`, `BaseEvent`, and one builder per kind (e.g. `buildLeafStarted(opts): BaseEvent`). Shapes exactly match NUTRIENTS.md §1.
- Also export `DDP_STAGES` constant in `cli/src/lib/telemetry/ddp-stages.ts` per NUTRIENTS.md §2. `cicd-agent` and `dashboard-agent` import from here.

### `telemetry.sink.jsonl`
- File: `cli/src/lib/telemetry/sink-jsonl.ts`
- `openJsonlSink(runId): { append(event), close() }`
- `append` uses `fs.appendFileSync` with `\n` — one event per line, synchronous to preserve order across parallel leaves.
- Creates the directory if missing. Never throws on write failure — log to stderr and continue.

### `telemetry.sink.s3`
- File: `cli/src/lib/telemetry/sink-s3.ts`
- `openS3Sink(runId): { append(event), close() }`
- Gated on `MYCELIUM_S3_BUCKET` env. If unset, returns a no-op sink.
- Buffers events and flushes on `close()` or every 50 events / 5s. Uses `@aws-sdk/client-s3` **only if already present** — otherwise emits a single stderr warning and no-ops. **Do not add aws-sdk to package.json.** This leaf produces the adapter shape; wiring real S3 is deferred.

## Contract dependencies
- NUTRIENTS.md §1 (event schema) — frozen
- NUTRIENTS.md §2 (DDP stages constant) — frozen
- NUTRIENTS.md §3 (Upgrade interface) — frozen, do not modify

## Acceptance criteria
- `npx tsc --noEmit` passes.
- Running `mycelium cultivate --dry-run` on an organism with `upgrades: [telemetry-emitter]` produces a `.mycelium/events/<run_id>.jsonl` containing `run_started` and `run_ended`.
- Other upgrades can call `ctx.emit(kind, data)` and their events appear in the JSONL.
- `DDP_STAGES` array order matches `templates/scale.html:272-281`.

## Out of scope
- Wiring emission to the CI/CD composite action (that is `cicd-agent`'s job — it calls the emitter via `ddp-emit.sh`).
- DuckDB querying of the logs (that is `fleet-agent`).
- UI rendering (that is `dashboard-agent`).

## Merge instructions
First in merge order. `registry.ts` gets one new entry. No changes to existing upgrades. No changes to `cultivate.ts` beyond the existing `ctx` extension pattern.
