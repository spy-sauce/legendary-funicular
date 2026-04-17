# NUTRIENTS.md — DDP-CICD Integration

Frozen contracts for the DDP-CICD cultivation. Every leaf consumes these. Do not redesign these at leaf-time; if something is wrong, halt and flag, don't drift.

---

## 1. Event log — the canonical telemetry wire

**Location:** `.mycelium/events/<run_id>.jsonl` (append-only, one JSON object per line, UTF-8, newline-terminated).

**Run ID:** `<organism>-<ISO-8601-compact>-<4-char-hash>` — e.g. `ddp-integration-20260417T1830Z-a7f3`. Generated once by telemetry-emitter at `beforePlan` and passed through context.

### Event schema (superset — every event has these)

```ts
interface BaseEvent {
  v: 1;                           // schema version
  run_id: string;
  organism: string;               // mycelium.organism.name
  ts: string;                     // ISO-8601 with ms
  kind: EventKind;
  data: Record<string, unknown>;  // kind-specific, see below
}

type EventKind =
  | "run_started"
  | "leaf_started"
  | "leaf_fruited"
  | "leaf_failed"
  | "run_ended"
  | "ddp_stage_started"
  | "ddp_stage_ended"
  | "alert"
  | "cost_recorded";
```

### Per-kind `data` payloads

```ts
// kind: "run_started"
{ total_leaves: number, biomes: string[], max_concurrency: number, gating: string }

// kind: "leaf_started"
{ leaf_id: string, biome: string, tag: string, scope: string, branch: string, lineage: string[] }

// kind: "leaf_fruited"
{ leaf_id: string, biome: string, commit_sha: string | null, wall_ms: number, files_written: number, summary: string }

// kind: "leaf_failed"
{ leaf_id: string, biome: string, wall_ms: number, error: string }

// kind: "run_ended"
{ ok: number, failed: number, total: number, health: number, wall_ms: number }

// kind: "ddp_stage_started"
{ stage_id: DDPStageId, gh_run_id?: string, gh_run_url?: string }

// kind: "ddp_stage_ended"
{ stage_id: DDPStageId, status: "success" | "failure" | "skipped", wall_ms: number, logs_url?: string }

// kind: "alert"
{ severity: "info" | "warn" | "error" | "critical", source: string, title: string, detail: string, leaf_id?: string }

// kind: "cost_recorded"
{ leaf_id: string, model: string, input_tokens: number, output_tokens: number, cache_read_tokens: number, cache_write_tokens: number, usd_estimate: number }
```

---

## 2. DDP stage list — locked

**This is the contract between `cicd-agent` and `dashboard-agent`.** The array must match `templates/scale.html:272-281` exactly. Order matters — it is the pipeline.

```ts
const DDP_STAGES = [
  { id: "merge-order", label: "merge-order", icon: "M" },
  { id: "lint",        label: "lint",         icon: "L" },
  { id: "typecheck",   label: "typecheck",    icon: "T" },
  { id: "test",        label: "test suite",   icon: "✓" },
  { id: "build",       label: "build",        icon: "B" },
  { id: "deploy-stg",  label: "deploy:stg",   icon: "S" },
  { id: "smoke",       label: "smoke tests",  icon: "~" },
  { id: "deploy-prod", label: "deploy:prod",  icon: "P" },
] as const;

type DDPStageId =
  | "merge-order" | "lint" | "typecheck" | "test"
  | "build" | "deploy-stg" | "smoke" | "deploy-prod";
```

Export this constant from `cli/src/lib/telemetry/ddp-stages.ts`. All code (CI emitter, dashboard renderer, fleet query) imports from here — no duplication.

---

## 3. Upgrade module shape

Existing interface at `cli/src/lib/upgrades/types.ts`. New upgrades (`telemetry-emitter`, `cost-tracker`, `alerting`) implement this directly — do not modify the interface.

```ts
export interface Upgrade {
  name: string;
  category: "validation" | "runtime" | "convention";
  hooks: {
    beforePlan?:      (ctx: PlanCtx)   => void | Promise<void>;
    beforeSpawn?:     (ctx: SpawnCtx)  => boolean | Promise<boolean>;  // false skips leaf
    transformPrompt?: (prompt: string, ctx: SpawnCtx) => string;
    afterLeaf?:       (ctx: LeafResultCtx) => void | Promise<void>;
    onCrash?:         (ctx: CrashCtx)  => void | Promise<void>;
  };
}
```

Register new upgrades in `cli/src/upgrades/registry.ts`. They are **opt-in** — an organism activates them via `organism.upgrades` in `mycelium.yaml`.

---

## 4. sporenet/state.json — dashboard phase 1–2 source

**Do not change existing fields.** Defined by `cli/src/commands/sporenet.ts:34-42`:

```ts
interface SporeNetState {
  session_id: string;
  organism: string;
  started_at: string;
  ship_target?: string;
  gating?: string;
  total: number;
  leaves: Leaf[];
}

interface Leaf {
  id: string;
  agent: string;        // biome id
  tag: string;          // stream tag
  scope: string;
  status: "pending" | "active" | "done" | "failed";
  commit?: string;
  started_at?: string;
  completed_at?: string;
}
```

`dashboard-agent` may **add** optional fields to `Leaf` — suggested additions: `wall_ms?: number`, `usd_estimate?: number`. Do not rename. Do not remove. Do not change `status` enum.

---

## 5. Sporenet server routes (new — from `dashboard-agent` + `fleet-agent`)

```
GET  /                     — dashboard shell (scale.html, data-bound)
GET  /api/state            — current sporenet/state.json
GET  /api/events           — JSONL event log, supports ?since=<ts>&limit=<n>
GET  /api/events/stream    — SSE stream of new events
GET  /fleet                — fleet overview page
GET  /api/fleet/organisms  — list organisms with rollup metrics
GET  /api/fleet/organism/:name  — detail rollup for one organism
```

All read-only. No mutating endpoints. No auth in v1 — assume localhost only; document in DEVELOPER_GUIDE.md.

---

## 6. GitHub Actions — composite action contract

**Path:** `.github/actions/mycelium-run/action.yml`

**Inputs:**
```yaml
inputs:
  brief-path:         { required: true,  description: "Path to brief.md" }
  organism-name:      { required: true }
  max-concurrency:    { required: false, default: "50" }
  harvest-threshold:  { required: false, default: "0.8" }
  stack:              { required: false, default: "" }
  anthropic-api-key:  { required: true }
```

**Outputs:**
```yaml
outputs:
  run-id:             { description: "Telemetry run_id" }
  health:             { description: "ok/total ratio" }
  event-log-path:     { description: "Artifact path of JSONL event log" }
```

**Steps (in order):**
1. Checkout repo
2. Setup Node 20
3. `npm ci` in cli/
4. `npm run build` in cli/
5. `mycelium plant ${brief-path} -s ${stack}` (writes organism files)
6. `mycelium contracts freeze`
7. **DDP stage: merge-order** — validate yaml, print plan
8. **DDP stage: lint** — `npm run lint` if script exists, else skip
9. **DDP stage: typecheck** — `npx tsc --noEmit`
10. **DDP stage: test** — `npm test` if present, else skip
11. **DDP stage: build** — `npm run build`
12. `mycelium cultivate -c ${max-concurrency}` — main run
13. `mycelium harvest -t ${harvest-threshold}` — threshold check
14. **DDP stage: deploy-stg** — placeholder, user overrides via hook
15. **DDP stage: smoke** — placeholder
16. **DDP stage: deploy-prod** — placeholder, gated on manual approval env var
17. Upload `.mycelium/events/<run_id>.jsonl` + `sporenet/state.json` + `CELLULAR-MAP.md` as artifacts

Each DDP stage is wrapped by `.github/scripts/ddp-emit.sh` which writes `ddp_stage_started` / `ddp_stage_ended` events into the current run's JSONL.

---

## 7. Alert payload

```ts
interface AlertPayload {
  severity: "info" | "warn" | "error" | "critical";
  source: "crash" | "leaf-failure" | "health-below-threshold" | "biome-fail-rate";
  organism: string;
  run_id: string;
  title: string;          // one line
  detail: string;         // markdown
  leaf_id?: string;
  biome?: string;
  event_log_url?: string;
}
```

**Sinks:**
- Slack — POST JSON to `$MYCELIUM_SLACK_WEBHOOK` (Block Kit), silently skip if env missing
- GitHub issue — `gh issue create --title "${title}" --body "${detail}"`, silently skip if `gh` not available

Trigger thresholds (configurable via `organism.alerting`):
- `onCrash` → always, severity=critical
- `afterLeaf` with failure → severity=error, source="leaf-failure"
- End-of-run `health < threshold` → severity=error, source="health-below-threshold"
- Biome fail rate > 0.5 → severity=warn, source="biome-fail-rate"

---

## 8. Cost estimation table (USD per million tokens)

Single source of truth for `cost-tracker`. Use current Anthropic pricing as of 2026-04:

```ts
const COST_TABLE: Record<string, { input: number; output: number; cache_read: number; cache_write: number }> = {
  "claude-opus-4-7":      { input: 15.00, output: 75.00, cache_read: 1.50,  cache_write: 18.75 },
  "claude-sonnet-4-6":    { input:  3.00, output: 15.00, cache_read: 0.30,  cache_write:  3.75 },
  "claude-haiku-4-5":     { input:  1.00, output:  5.00, cache_read: 0.10,  cache_write:  1.25 },
  // fallback
  "default":              { input:  3.00, output: 15.00, cache_read: 0.30,  cache_write:  3.75 },
};
```

Place in `cli/src/lib/telemetry/cost-table.ts`. Document that values are estimates — reconcile against actual billing externally.

---

## 9. scale.html data-binding slots

`dashboard-agent` replaces the simulation logic in `templates/scale.html` with data injection. The server-side template substitutes JSON blobs at these slots:

```html
<script id="mycelium-data" type="application/json">
{
  "organism": "...",
  "run_id": "...",
  "phase": 1,                    // 1=cultivate 2=harvest 3=ddp 4=done
  "biomes": [ { id, label, leafCount } ],
  "leaves": [ { id, biome, status, wall_ms? } ],
  "stats": { total, running, queued, done, health_pct },
  "ddp":  [ { id, status, wall_ms? } ],
  "elapsed_ms": 12345
}
</script>
```

The existing `drawTree`, `drawPool`, `updateStats`, DDP renderer stay — they just read `document.getElementById('mycelium-data').textContent`-parsed data instead of slider state. Sliders and "run cultivate" button are removed in live mode (keep them behind a `?demo=1` query param for the standalone simulator).

---

## 10. Fleet query (DuckDB over JSONL)

Use DuckDB's JSONL reader — no ETL step. Example query shape:

```sql
SELECT organism, COUNT(*) AS runs, AVG(health) AS avg_health
FROM read_json_auto('.mycelium/events/*.jsonl', format='newline_delimited')
WHERE kind = 'run_ended'
GROUP BY organism;
```

`fleet-agent` exposes query functions that return plain JS objects. No raw SQL leaks to the dashboard — query layer wraps everything.

Install: `duckdb` npm package (≈8MB WASM, acceptable). This is the one approved new dependency.

---

## 11. Stream-tag map (repeated from CLAUDE.md for reference)

| Biome | Tag | File prefix (commits) |
|---|---|---|
| telemetry-agent | `MF/TELEMETRY` | — |
| dashboard-agent | `MF/DASHBOARD` | — |
| cicd-agent | `MF/CICD` | — |
| cost-agent | `MF/COST` | — |
| alerting-agent | `MF/ALERTING` | — |
| fleet-agent | `MF/FLEET` | — |
| docs-agent | `MF/DOCS` | — |

---

## 12. Shared test invariant

None — this repo has no test framework and will not get one in this cultivation. Validate via:
- `cd cli && npx tsc --noEmit` — must pass
- `cd cli && npm run build` — must produce `dist/index.js`
- `node cli/dist/index.js --help` — must list all existing commands unchanged, plus any new ones

If any of these fail at `harvest` time, the run is below threshold.
