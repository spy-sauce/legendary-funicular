# HYPHA — cost-agent

## CACHE HEADER
- **SCOPE:** token-cost tracking upgrade with per-leaf attribution and harvest integration.
- **PRIMITIVES:** SDK usage metadata parser · cost table (USD/Mtok) · rollup (organism → biome → leaf).
- **RULES:** estimates only — state this explicitly in output · never block a leaf on cost failure · compose with telemetry-emitter, don't duplicate its sink.
- **COUPLING:** emits `cost_recorded` events through telemetry-emitter; reads same JSONL back for rollup.
- **LOAD WHEN:** any leaf touching cost attribution, usage parsing, or harvest output.

## Scope
Produce a realistic USD estimate per leaf and a rollup at the end of the run. Plug into the existing `harvest` command output so users see cost alongside health.

## Deliverables by leaf

### `cost.tracker.upgrade`
- File: `cli/src/upgrades/cost-tracker.ts`
- Default export: `Upgrade` with `name: "cost-tracker"`, `category: "runtime"`.
- Hook `afterLeaf(ctx)`: extract usage from the SDK result (see `cultivate.ts` — final message carries token counts on Claude SDK responses; check `result.usage` / `message.usage` depending on SDK version).
- If `telemetry-emitter` is installed, call `ctx.emit("cost_recorded", payload)`. If not, silently skip.
- Register in `cli/src/upgrades/registry.ts`. **Depends_on: telemetry-emitter** — document in the upgrade's `conflicts/depends` field if the type supports it; otherwise log a warning on missing dependency.

### `cost.tracker.reconcile`
- File: `cli/src/lib/telemetry/cost-reconcile.ts`
- `reconcileUsage(sdkUsage, model): { input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, usd_estimate }`
- Reads `cli/src/lib/telemetry/cost-table.ts` for per-model USD rates.
- Handles missing fields (older SDK responses) by defaulting to zero with a one-time warning per run.

### `cost.attribution.rollup`
- File: `cli/src/lib/telemetry/cost-rollup.ts`
- `rollupFromJsonl(jsonlPath): { total_usd, by_biome: Record<string, number>, by_leaf: Record<string, number>, tokens: { input, output, cache_read, cache_write } }`
- Streams the file line-by-line (don't load the whole thing into memory — runs can be large).
- Filters `kind === "cost_recorded"`, groups by `biome` (derived from `leaf_id`) and `leaf_id`.

### `cost.attribution.report`
- File: touches `cli/src/commands/harvest.ts`
- After the existing health summary, append a "Cost estimate" section when the JSONL event log exists for this organism's latest run.
- Format:
  ```
  Cost estimate (current run):
    Total:     $1.24
    Tokens:    1.2M in / 340k out / 410k cache-read / 18k cache-write
    Top biomes by cost:
      telemetry-agent   $0.42
      cicd-agent        $0.31
      dashboard-agent   $0.28
    (* estimates based on published rates — reconcile against billing)
  ```
- If no events file, skip the section silently (preserves existing harvest behavior).

### Also create `cli/src/lib/telemetry/cost-table.ts`
Exports the `COST_TABLE` constant per NUTRIENTS.md §8. Include a `getCost(model): Entry` helper that falls back to `default`.

## Contract dependencies
- NUTRIENTS.md §1 — event schema (`cost_recorded` payload shape)
- NUTRIENTS.md §8 — cost table (USD per Mtok)
- `telemetry-emitter` upgrade must be present for events to flow — document as soft dependency.

## Acceptance criteria
- `npx tsc --noEmit` passes.
- Running cultivate with `upgrades: [telemetry-emitter, cost-tracker]` on a small organism produces `cost_recorded` events in the JSONL and a cost summary in `mycelium harvest`.
- Running `mycelium harvest` without telemetry-emitter installed still works (no cost section).

## Out of scope
- Real-time budget enforcement (killing runs over cost). V2 feature.
- Rate-limit detection. V2 feature.
- Multi-run aggregation (that is `fleet-agent`).

## Merge instructions
Merged third, after telemetry. Touches: `cli/src/upgrades/cost-tracker.ts` (new), `cli/src/lib/telemetry/cost-*.ts` (new), `cli/src/upgrades/registry.ts` (add entry), `cli/src/commands/harvest.ts` (additive edit only — keep all existing output, append the cost block).
