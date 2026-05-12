# Mycelium Framework — Developer Guide

A complete reference for taking the Mycelium CLI and shipping a real organism.

## 1. What it is

Mycelium is a CLI-driven orchestration framework that takes a single YAML config and spawns a tree of Claude Agent SDK sessions in parallel, each working on a scoped slice of a larger software build. Agents are nested biomes → specialists → leaves; each leaf becomes one Claude session writing code on its own git branch.

- **Package:** `@vibespace/mycelium-cli`
- **Source:** `cli/src/` in this repo
- **Stack:** Node/TypeScript, Commander.js, `@anthropic-ai/claude-agent-sdk`, `yaml`, `chalk`, `ora`

## 2. Install

```bash
cd cli
npm install
npm run build               # produces dist/index.js
npm link                    # exposes `mycelium` globally
# or alias:
alias mycelium="node $(pwd)/dist/index.js"
```

Requires `ANTHROPIC_API_KEY` in env (read by the Agent SDK at leaf spawn time).

## 3. Project skeleton

A cultivated project needs these files in its root (cwd when running `mycelium`):

```
my-project/
├── mycelium.yaml           # organism config — REQUIRED
├── CLAUDE.md               # stack, rules, stream tags — every leaf reads this
├── NUTRIENTS.md            # frozen data/design/API contracts
├── CELLULAR-MAP.md         # optional — human-readable tree visualization
├── hyphae/                 # per-biome instruction specs
│   └── HYPHA-<DOMAIN>-AGENT.md   # one per biome, matching biome id
└── contracts/              # JSON-schema chemical signals (optional)
```

The leaf prompt hardcodes these file names (`cli/src/commands/cultivate.ts:352-384`) — rename at your peril.

## 4. `mycelium.yaml` schema

```yaml
organism:
  name: my-app                      # string, required
  ship_target: "2026-05-01"         # free-form, shown in banner
  health_pulse_interval: 30         # seconds (network status polling)
  harvest_threshold: 0.8            # min success ratio to pass harvest
  cellular: true                    # walk sub_agents recursively (default false)
  gating: contract-freeze           # "wave" (default) | "contract-freeze"
  max_depth: 3                      # documentation only; not enforced

contracts:                          # list of contract refs
  - { name: member, path: NUTRIENTS.md#member }

agents:                             # list of BIOMES (depth-1)
  - id: data-agent                  # MUST match hyphae/HYPHA-<ID minus -agent>-AGENT.md
    scope: "Postgres schema + clients"
    branch: feat/data-agent
    blocked_by: []                  # biome ids that must FRUIT_READY first (wave mode)
    blocks: [api-agent]
    capabilities: [postgresql, supabase]
    sub_agents:                     # depth-2 specialists (optional)
      - id: data.schema-migrations
        scope: "9 tables + FKs"
        sub_agents:                 # depth-3 leaves (optional)
          - { id: data.schema.members, scope: "members + ambassadors tables" }

merge_order: [data-agent, api-agent]   # deterministic merge sequence

timeline:                           # documentation only
  parallel_phases:
    - { hours: "0-24", active: [data-agent] }
```

**Leaf = any node with no `sub_agents`.** The CLI flattens the tree and spawns one session per leaf. A flat biome (no sub_agents) is itself a leaf.

## 5. Commands

| Command | Purpose |
|---|---|
| `mycelium init [-n name] [-d dir]` | Scaffold `mycelium.yaml`, `contracts/`, `agents/` |
| `mycelium plant <brief> [-s stack]` | Feed a business-brief markdown to Claude; SDK generates `mycelium.yaml`, `CLAUDE.md`, `NUTRIENTS.md`, and one `HYPHA-*.md` per identified domain |
| `mycelium agent create <name>` | Drop a stub agent file in `agents/` |
| `mycelium contracts freeze` | Stamp every contract in the yaml with `frozen: true` + ISO timestamp |
| `mycelium cultivate` | **Spawn the organism** — flattens the tree and runs Claude Agent SDK sessions |
| `mycelium network status` | Print biome states + dependency table |
| `mycelium network visualize` | ASCII render of the dependency graph |
| `mycelium flow` | Analyze which agents are unblocked and ready to receive work |
| `mycelium harvest [-t 0.8]` | Summarize FRUIT_READY deliverables; fail if below threshold |

### `cultivate` flags

| Flag | Default | Effect |
|---|---|---|
| `--dry-run` | false | Print execution plan, spawn nothing |
| `-c, --max-concurrency <n>` | 50 | Cap on simultaneous leaf sessions |
| `--only-biome <id>` | — | Run one biome's subtree (for targeted re-runs) |

## 6. Execution model

**Flattening** (`cultivate.ts:185-218`). `flattenBiome` walks each biome's `sub_agents` tree; any node without children is a leaf. Each leaf gets `branch: feat/<id>`, a lineage path (`biome → specialist → leaf`), and its biome tag.

**Gating.**
- `gating: wave` — biome-level `blocked_by` graph builds waves; each wave waits for upstream biomes to finish.
- `gating: contract-freeze` — a single wave: **every leaf starts at once** the moment `mycelium contracts freeze` has run. Leaves consume frozen type stubs + mocks from `NUTRIENTS.md`, not upstream code. Integration happens at merge time in `merge_order`.

**Concurrency.** A promise pool (`runWithConcurrency`, `cultivate.ts:252-274`) caps simultaneous SDK sessions at `--max-concurrency`.

**Leaf prompt** (`cultivate.ts:352-384`). Each session gets a prompt that:
- Identifies the leaf by id, lineage, scope, branch
- Mandates reading `CLAUDE.md`, `NUTRIENTS.md`, `hyphae/HYPHA-<BIOME>-AGENT.md`, `mycelium.yaml`
- Allows only `Read/Write/Edit/Bash/Glob/Grep` tools with `permissionMode: "acceptEdits"`
- Forbids `git` (orchestrator owns commits — see below)
- Requires a final line: `[<leaf-id>] FRUIT_READY — <one-line summary>`

**Git serialization** (`cultivate.ts:388-443`). A `CommitQueue` chains commits one-at-a-time to prevent races. Each leaf's files are `git add -A`-ed and committed with message `<TAG>/<leaf-id>: <scope>`, then pushed to `origin` (swallows "no remote"). Uses `--no-verify` to skip hooks.

**Health.** Final summary reports `ok/total`, total files, max wall-clock, and compares `ok/total` against `organism.harvest_threshold`.

## 7. HYPHA files

`hyphae/HYPHA-<DOMAIN>-AGENT.md` — the full spec for a biome. The CLI reference is:

```js
`hyphae/HYPHA-${biome.id.replace(/-agent$/, "").toUpperCase()}-AGENT.md`
```

So `id: data-agent` → `hyphae/HYPHA-DATA-AGENT.md`. Typical HYPHA contains: scope, deliverables, KPI gates / Health Pulse checks, contract dependencies, merge instructions.

## 8. Contracts / NUTRIENTS.md

`NUTRIENTS.md` is the project's single source of truth for cross-agent interfaces (data shapes, design tokens, API signatures, JWT claims, etc.). Freeze it before cultivate so all leaves see the same types. The `contracts:` block in `mycelium.yaml` references anchor sections in it.

## 9. End-to-end workflow

```bash
# A. scaffold from brief (or init + hand-author)
mycelium plant ./brief.md -s nextjs-fastapi-supabase
# …edit mycelium.yaml, CLAUDE.md, NUTRIENTS.md, hyphae/*…

# B. freeze signals
mycelium contracts freeze

# C. sanity check
mycelium cultivate --dry-run

# D. full run
mycelium cultivate -c 150

# E. targeted re-run of failures
mycelium cultivate --only-biome api-agent -c 20

# F. status + harvest
mycelium network status
mycelium harvest -t 0.8
```

## 10. Authoring checklist

- [ ] Every biome id ends in `-agent` and has a matching `hyphae/HYPHA-<DOMAIN>-AGENT.md`.
- [ ] Every leaf scope is one sentence, one deliverable, no "and".
- [ ] `NUTRIENTS.md` covers every contract named in the yaml.
- [ ] `CLAUDE.md` lists the stack, forbidden patterns, and stream tags.
- [ ] `blocked_by` forms a DAG (no cycles) — `cultivate` dumps remaining leaves into one final wave on cycle detection, which is usually not what you want.
- [ ] `--dry-run` shows the expected leaf count before you spend real tokens.

## 11. Known limits

- No rate-limit backoff beyond SDK default retries. Large `-c` values may 429.
- `git push` is best-effort; failures are logged but don't fail the leaf.
- `network status` / `flow` / `harvest` are status-only — they don't observe actual git/SDK state, just infer from the DAG. Truth lives in git history after `cultivate`.
- `max_depth` in yaml is ignored by code; nesting is unbounded in practice.
- HYPHA path resolution is convention-based; a typo in biome id silently breaks the leaf prompt — install `hypha-validator` (§12) to fail fast.

## 12. Upgrades — opt-in installable capabilities

An organism can slot upgrades into its cultivation lifecycle via `organism.upgrades` in `mycelium.yaml`:

```yaml
organism:
  name: bloom
  cellular: true
  gating: contract-freeze
  upgrades:
    - hypha-validator
    - depth-3-enforcement
    - crash-recovery
```

Nothing activates without an explicit install. Existing organisms without an `upgrades:` field behave exactly as before.

### Bundled

| Name | Category | Hooks | Effect |
|------|----------|-------|--------|
| `hypha-validator` | validation | `beforePlan` | Abort if any biome lacks a matching `hyphae/HYPHA-<BIOME>-AGENT.md` |
| `depth-3-enforcement` | validation | `beforePlan` | Abort if any biome is flat (no `sub_agents`); warn on shallow (<2 specialists) |
| `crash-recovery` | runtime | `beforePlan`, `beforeSpawn`, `afterLeaf`, `onCrash` | Record fruited leaves to `.mycelium/fruited.json`; skip already-fruited leaves on re-run |
| `cache-headers` | convention | `transformPrompt` | Extract `## CACHE HEADER` blocks from biome hypha files and inject at top of leaf prompt (~50-token preload in highest-attention region) |
| `routing-map` | convention | `beforePlan` | JIT cache routing. Reads `organism.routing: biome → [adjacent biomes]` and expands each leaf's preload set for `cache-headers` to inject |

### CLI

```bash
mycelium upgrades list                # all bundled + what's installed in this organism
mycelium upgrades info <name>         # description, hooks, conflicts
mycelium upgrades install <name>      # add to mycelium.yaml
mycelium upgrades remove <name>       # remove from mycelium.yaml
```

### Hook lifecycle

| Hook | Fires | Can | Used by |
|------|-------|-----|---------|
| `beforePlan` | After tree flattening, before execution | abort with reason, or push warnings | validators, routing-map |
| `beforeSpawn` | Before each leaf's SDK `query()` | skip the leaf (counted as success, no session) | resumers |
| `transformPrompt` | Between `buildLeafPrompt` and `query()` | return a modified prompt; chained across upgrades in install order | cache-headers |
| `afterLeaf` | After fruit or fail | record state; errors logged, non-fatal | trackers |
| `onCrash` | Outer catch around the wave loop | best-effort flush; errors swallowed | persisters |

All hooks are optional. An upgrade can implement any subset.

### Cache-headers ↔ routing-map composition

`cache-headers` alone injects the leaf's own biome hypha CACHE HEADER. Add `routing-map` to expand the preload set per biome:

```yaml
organism:
  name: bloom
  upgrades: [cache-headers, routing-map]
  routing:
    auth-agent:   [identity-agent, data-agent]
    api-agent:    [auth-agent, data-agent]
    "*":          [data-agent]             # wildcard: applies to any leaf not otherwise listed
```

A hypha file contributes to the cache preload by adding a `## CACHE HEADER` block at the top:

```markdown
# HYPHA — auth-agent

## CACHE HEADER
- **SCOPE:** authentication surface (signup / login / verify / recovery)
- **PRIMITIVES:** JWT claims · email token · rate limiter · session middleware
- **RULES:** bcrypt cost >= 12 · tokens expire in 15m · never log plaintext pw
- **COUPLING:** identity-agent (user entity), data-agent (user table)
- **LOAD WHEN:** leaves touching auth routes, token lifecycle, credential storage

## Rest of the hypha spec...
```

The extractor grabs `## CACHE HEADER` through the next `## ` heading. If no header is present, the upgrade silently skips that biome.

### Authoring

Bundled upgrades live in `cli/src/upgrades/` and register through `cli/src/upgrades/registry.ts`. Each upgrade is a plain TS module exporting a default `Upgrade` object — see `cli/src/lib/upgrades/types.ts` for the type and `cli/src/upgrades/hypha-validator.ts` for a minimal example.

Project-local custom upgrades are a future extension; the registry is static today for deterministic version behavior.

### Coming

Substrate plugins (`substrate-api`, `substrate-max`), convention packs (`commit-convention`, `canonical-depth3`), and memory-config interop (`cache-headers`, `routing-map`).

---

## 13. CI/CD with Digital Dash

Run a full Mycelium cultivation inside GitHub Actions with DDP (Digital Dash Pipeline) stage gates. The composite action wraps `plant → freeze → cultivate → harvest` with per-stage event emission for dashboard visualization.

### 13.1 Composite action

**Path:** `.github/actions/mycelium-run/action.yml`

Drop this action into your workflow to run a complete organism build.

#### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `brief-path` | **yes** | — | Path to your `brief.md` business spec |
| `organism-name` | **yes** | — | Name for the organism (used in telemetry) |
| `max-concurrency` | no | `50` | Cap on simultaneous leaf sessions |
| `harvest-threshold` | no | `0.8` | Minimum success ratio to pass harvest |
| `stack` | no | `""` | Stack hint passed to `mycelium plant -s` |
| `anthropic-api-key` | **yes** | — | Your Anthropic API key (use a secret!) |

#### Outputs

| Output | Description |
|--------|-------------|
| `run-id` | Telemetry run ID (`<organism>-<ISO-8601>-<hash>`) |
| `health` | Final success ratio (`ok/total`) |
| `event-log-path` | Artifact path to the JSONL event log |

### 13.2 Example workflow

```yaml
# .github/workflows/cultivate.yml
name: Cultivate Organism

on:
  workflow_dispatch:
    inputs:
      brief:
        description: "Path to brief.md"
        required: true
        default: "./brief.md"
      organism:
        description: "Organism name"
        required: true
      concurrency:
        description: "Max parallel leaves"
        required: false
        default: "50"

jobs:
  cultivate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Mycelium
        id: mycelium
        uses: ./.github/actions/mycelium-run
        with:
          brief-path: ${{ inputs.brief }}
          organism-name: ${{ inputs.organism }}
          max-concurrency: ${{ inputs.concurrency }}
          harvest-threshold: "0.8"
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Report
        run: |
          echo "Run ID: ${{ steps.mycelium.outputs.run-id }}"
          echo "Health: ${{ steps.mycelium.outputs.health }}"
```

### 13.3 DDP stages

The Digital Dash Pipeline wraps each build phase with event emission. Stage events (`ddp_stage_started`, `ddp_stage_ended`) write to the same JSONL log consumed by the dashboard.

| Stage | Icon | What it does |
|-------|------|--------------|
| `merge-order` | M | Validates `mycelium.yaml`, prints execution plan |
| `lint` | L | Runs `npm run lint` if script exists, else skips |
| `typecheck` | T | Runs `npx tsc --noEmit` |
| `test` | ✓ | Runs `npm test` if script exists, else skips |
| `build` | B | Runs `npm run build` |
| `deploy-stg` | S | **Placeholder** — user overrides via hook |
| `smoke` | ~ | **Placeholder** — user overrides via hook |
| `deploy-prod` | P | **Placeholder** — gated on manual approval |

Stages execute in order. A failing stage (except placeholders) aborts the pipeline.

### 13.4 Stage execution order

The composite action executes steps in this order:

1. Checkout repo
2. Setup Node 20
3. `npm ci` in `cli/`
4. `npm run build` in `cli/`
5. `mycelium plant ${brief-path} -s ${stack}`
6. `mycelium contracts freeze`
7. **DDP: merge-order** → validate + plan
8. **DDP: lint** → optional lint pass
9. **DDP: typecheck** → TypeScript check
10. **DDP: test** → optional test suite
11. **DDP: build** → compile
12. `mycelium cultivate -c ${max-concurrency}`
13. `mycelium harvest -t ${harvest-threshold}`
14. **DDP: deploy-stg** → placeholder
15. **DDP: smoke** → placeholder
16. **DDP: deploy-prod** → placeholder
17. Upload artifacts

### 13.5 Overriding deploy stages

Deploy stages are placeholders by default. To customize, create hook scripts in your repo:

```
.github/hooks/
├── deploy-stg.sh       # Staging deployment
├── smoke.sh            # Post-deploy smoke tests
└── deploy-prod.sh      # Production deployment
```

The composite action sources these if present. Your hook scripts receive these environment variables:

| Variable | Description |
|----------|-------------|
| `MYCELIUM_RUN_ID` | Unique run identifier for telemetry correlation |
| `MYCELIUM_ORGANISM` | Organism name from `mycelium.yaml` |
| `GITHUB_SHA` | Git commit SHA being deployed |
| `GITHUB_REF` | Git ref (branch/tag) being deployed |

Example hook:

```bash
# .github/hooks/deploy-stg.sh
#!/usr/bin/env bash
set -euo pipefail

echo "Deploying ${GITHUB_SHA:0:7} to staging..."
kubectl apply -k overlays/staging/
echo "Staging deployment complete for $MYCELIUM_ORGANISM"
```

**Production gating:** `deploy-prod` only runs if `MYCELIUM_ALLOW_PROD=true`. Use GitHub's environment protection rules to require manual approval:

```yaml
jobs:
  deploy-prod:
    environment: production   # requires approval in repo settings
    env:
      MYCELIUM_ALLOW_PROD: "true"
```

### 13.6 Secrets and environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | **yes** | Claude API access for leaf sessions |
| `MYCELIUM_SLACK_WEBHOOK` | no | Slack webhook URL for alerts (see NUTRIENTS.md §7) |
| `MYCELIUM_S3_BUCKET` | no | S3 bucket for event log replication |
| `MYCELIUM_ALLOW_PROD` | no | Gate for production deploy stage (`true` to enable) |

**Never** commit secrets. Use GitHub repository secrets or environment secrets.

### 13.7 Event emission

Each DDP stage is wrapped by `.github/scripts/ddp-emit.sh`, which writes events to `.mycelium/events/<run_id>.jsonl`:

```bash
# Emits ddp_stage_started event
./.github/scripts/ddp-emit.sh <stage-id> start

# Run the stage...

# Emits ddp_stage_ended event with status
./.github/scripts/ddp-emit.sh <stage-id> end <success|failure|skipped>
```

The script automatically calculates `wall_ms` from the start/end timestamps.

Event payloads follow the frozen schema in NUTRIENTS.md §1:

```json
{
  "v": 1,
  "run_id": "ddp-integration-20260417T1830Z-a7f3",
  "organism": "ddp-integration",
  "ts": "2026-04-17T18:31:45.123Z",
  "kind": "ddp_stage_started",
  "data": {
    "stage_id": "build",
    "gh_run_id": "12345678",
    "gh_run_url": "https://github.com/org/repo/actions/runs/12345678"
  }
}
```

### 13.8 Artifacts

The action uploads a single artifact on completion:

**Artifact name:** `mycelium-run-<run_id>`

**Contents:**

| File | Description |
|------|-------------|
| `.mycelium/events/<run_id>.jsonl` | Full event log (all lifecycle + DDP stage events) |
| `sporenet/state.json` | Final leaf states for dashboard replay |
| `CELLULAR-MAP.md` | Tree visualization of the organism |

Artifacts are retained for 30 days. Download via the GitHub Actions UI or API for post-hoc analysis, dashboard replay, or fleet aggregation.

### 13.9 Local simulation

Test the pipeline locally before pushing:

```bash
# Dry-run cultivate
mycelium cultivate --dry-run

# Run with reduced concurrency
mycelium cultivate -c 5

# Check harvest threshold
mycelium harvest -t 0.8
```

The composite action is just orchestration sugar — all CLI commands work standalone.

---

## 14. Dashboard & Fleet View

Visualize active cultivations in real time with the SporeNet dashboard. The server reads from `sporenet/state.json` (phase 1–2) and `.mycelium/events/<run_id>.jsonl` (phase 3) to render a live-updating canvas view of all leaves, biomes, and CI/CD stages.

### 14.1 Starting the server

```bash
mycelium sporenet init              # scaffold sporenet/ with state.json
mycelium sporenet serve --port 4444 # launch dashboard at localhost:4444
```

The `serve` command starts an HTTP server rooted in your organism directory. Open `http://localhost:4444` to see the live dashboard, or `http://localhost:4444/fleet` for the cross-organism fleet view.

### 14.2 Route table

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Dashboard shell (`scale.html`) — canvas tree + session pool + DDP pipeline |
| `/api/state` | GET | Current `sporenet/state.json` as JSON |
| `/api/events` | GET | JSONL events from `.mycelium/events/<run_id>.jsonl`. Supports `?since=<ISO-ts>&limit=<n>` |
| `/api/events/stream` | GET | SSE stream tailing the current JSONL run file. Real-time event push |
| `/fleet` | GET | Fleet overview page — mini cards per organism |
| `/api/fleet/organisms` | GET | List organisms with `name`, `last_run_at`, `run_count` |
| `/api/fleet/organism/:name` | GET | Detail rollup: `avg_health`, `total_runs`, `total_cost_usd`, `stage_durations[]` |
| `/diff/:leafId` | GET | Git diff for a completed leaf's commit (used by modal popup) |

All routes are read-only. No authentication in v1 — assume localhost only.

### 14.3 Dashboard phases

The dashboard infers the current pipeline phase from event data:

| Phase | Trigger | Visual indicator |
|-------|---------|------------------|
| **1 — cultivate** | `run_started` event or any `leaf_started` | Phase 1 pill active (teal), timer running, pool cells animate |
| **2 — harvest** | Health ≥ 80% (FRUIT_READY leaves / total) | Phase 1 done (green), phase 2 active, progress bar turns green |
| **3 — digital-dash** | First `ddp_stage_started` event | Phase 2 done, phase 3 active (purple), DDP pipeline block reveals |
| **4 — done** | `run_ended` event or all DDP stages complete | All phases green, timer shows "DEPLOYED" |

Phase inference happens client-side using both `/api/state` polling and `/api/events/stream` SSE. The server doesn't store phase — it's derived from event history.

### 14.4 Simulator mode (`?demo=1`)

The dashboard ships with a built-in simulator for demos and testing. Append `?demo=1` to the URL:

```
http://localhost:4444/?demo=1
```

Simulator mode enables:

- **Configuration panel**: Sliders for biomes × specialists × leaves (2×2×2 up to 10×20×50)
- **Max-concurrency slider**: Adjust `--max-concurrency` and watch pool behavior change
- **Presets**: Quick buttons for 8 / 1k / 10k session counts
- **Simulated run**: Click "▶ run cultivate" to animate a complete cultivation → harvest → DDP cycle

Simulator mode is purely client-side — no API calls. Use it to show stakeholders what a cultivation looks like before spending tokens.

### 14.5 scale.html data-binding slot

The dashboard template (`cli/src/commands/sporenet/templates/scale.html`) expects a JSON blob in a script tag for server-side injection:

```html
<script id="mycelium-data" type="application/json">
{
  "organism": "my-app",
  "run_id": "my-app-20260417T1830Z-a7f3",
  "phase": 1,
  "biomes": [
    { "id": "auth-agent", "label": "auth", "leafCount": 4 },
    { "id": "data-agent", "label": "data", "leafCount": 6 }
  ],
  "leaves": [
    { "id": "auth.signup", "biome": "auth-agent", "status": "done", "wall_ms": 12340 },
    { "id": "auth.login",  "biome": "auth-agent", "status": "active" }
  ],
  "stats": { "total": 10, "running": 2, "queued": 3, "done": 5, "health_pct": 50 },
  "ddp": [
    { "id": "merge-order", "status": "done", "wall_ms": 2100 },
    { "id": "lint",        "status": "active" }
  ],
  "elapsed_ms": 45000
}
</script>
```

This slot follows the frozen schema in NUTRIENTS.md §9. In live mode, the dashboard ignores this slot and fetches data via `/api/state` + SSE. The slot exists for static HTML snapshots and pre-rendered reports.

### 14.6 Fleet view

The fleet view (`/fleet`) aggregates metrics across all organisms in `.mycelium/events/`. It uses DuckDB (WASM) to query JSONL files directly — no ETL step required.

**What it shows:**

- **Organism cards**: One card per distinct organism with run count and last-run timestamp
- **Detail drill-down**: Click a card to see `avg_health`, `total_cost_usd`, and per-stage duration stats

**How it works:**

```
┌─────────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│ .mycelium/events/   │ ──▶  │ DuckDB WASM      │ ──▶  │ /api/fleet/*    │
│   *.jsonl           │      │ (read_json_auto) │      │ JSON responses  │
└─────────────────────┘      └──────────────────┘      └─────────────────┘
```

Query functions live in `cli/src/lib/fleet/queries.ts`:

| Function | Purpose |
|----------|---------|
| `listOrganisms()` | All organisms with `name`, `last_run_at`, `run_count` |
| `organismRollup(name)` | `avg_health`, `total_runs`, `total_cost_usd`, `last_health`, `last_run_wall_ms` |
| `stageDurations(name, lastN?)` | Average and p95 duration per DDP stage |
| `leafFailureRate(name)` | Failure rate by biome (for alerting thresholds) |

DuckDB is the one approved new dependency (per NUTRIENTS.md §10). If the `duckdb` npm package isn't installed, fleet routes return stub data and log no errors — the dashboard remains functional for single-organism use.

### 14.7 Customizing the dashboard

To extend or theme the dashboard:

1. **Copy the template**: `cp cli/src/commands/sporenet/templates/scale.html my-dashboard.html`
2. **Edit CSS variables**: Override `:root` vars (`--bg`, `--green`, `--dd`, etc.)
3. **Serve your version**: Point `sporenet serve` at a directory containing your `index.html`, or mount your own static server

The canvas renderers (`drawTree`, `drawPool`) and phase state machine are vanilla JS — no framework lock-in. All DOM updates use `document.getElementById`, making it easy to reskin.

---

## 15. Audit-Run

Post-cultivation inspection layer. `cultivate` plants code; `audit-run` inspects the running organism against the behaviors declared in NUTRIENTS. Think symmetric test cultivation: for every production biome you cultivated, you can run a tester biome that exercises the output and emits structured findings.

### 15.1 When to use it

- **After every cultivate** of a real-client workload — surfaces silent behavior bugs that `FRUIT_READY` status alone can't catch.
- **Before merging a heal-loop autofix** — verify the re-cultivated biomes actually fixed the finding.
- **For regression triage** — compare against a prior run with `--against <ref>` and report only regressions.

### 15.2 Command surface

| Flag | Default | Effect |
|------|---------|--------|
| (none) | — | Baseline run; writes findings + brief; no autofix |
| `--autofix` | — | Enable heal loop; re-cultivates affected biomes until clean or capped |
| `--max-iterations <n>` | 3 | Maximum autofix iterations before bailing |
| `--only-tester <id>` | — | Run a single tester (useful for debugging audit-run itself) |
| `--against <ref>` | — | Baseline diff mode; report only regressions vs. a prior run |
| `--concurrency <n>` | organism's cultivate concurrency | Cap on simultaneous tester sessions |
| `--no-serve` | — | Skip sporenet integration (no live dashboard updates) |
| `--autofix-branch <name>` | — | Sub-organism mode: commits to a separate branch instead of on top |
| `--max-budget-usd <n>` | lib/budget.ts default | Cost cap for the entire audit run (testers + re-plants) |
| `--dry-run` | — | Print execution plan; spawn no sessions |
| `scaffold-tester <biome>` | — | Subcommand: emit a stub `hyphae/HYPHA-TEST-<biome>.md` from the biome's HYPHA |

**Exit codes:** `0` clean, `1` findings present (non-autofix mode), `2` autofix exhausted with criticals remaining, `3` tester error count > 0 (operator concern, not cultivation defect).

Source: `cli/src/commands/audit-run.ts`.

### 15.3 Output layout

Every audit-run produces a timestamped directory under `audit/`:

```
audit/<ISO-timestamp>/
  findings.jsonl                    # one Finding per line (§15.4)
  summary.json                      # counts, severity buckets, biomes affected
  brief-fix.md                      # aggregator-composed re-plant brief
  testers/<tester_id>/stdout.log    # per-tester stdout
  testers/<tester_id>/stderr.log    # per-tester stderr
  testers/<tester_id>/finding.json  # the single finding the tester emitted (empty if clean)
  iterations/<n>/                   # autofix iterations (0 = baseline)
    findings.jsonl
    summary.json
    brief-fix.md
    testers/...
```

**Gitignore + breadcrumb pattern:** `audit/` is gitignored in cultivated apps. Only `audit/<ts>/summary.json` is committed as a lightweight breadcrumb — explicit `git add audit/<ts>/summary.json` after each run.

See NUTRIENTS.md §2 for the frozen path conventions.

### 15.4 The Finding shape

Testers emit findings as JSONL. The schema (from `cli/src/lib/audit/findings.ts`):

```ts
type Severity = "critical" | "major" | "minor";
//   critical → blocks contract-freeze on re-plant
//   major    → blocks harvest threshold
//   minor    → informational; included in brief but non-blocking

interface Finding {
  id: string;            // sha256(tester_id + biome + summary + file_path + line_range)
  tester_id: string;     // e.g., "tester.flow.talent"
  biome: string;         // production biome this finding maps to
  severity: Severity;
  file_path?: string;
  line_range?: [number, number];
  summary: string;       // one-line headline
  detail: string;        // multi-line root-cause explanation
  repro_steps: string[]; // ordered commands or actions to reproduce
  suggested_fix: string; // free-text; the re-plant leaf consumes this as acceptance criterion
  observed_at: string;   // ISO-8601 with ms
  iteration: number;     // which autofix iteration produced this (0 = baseline)
}
```

**Worked example** — the run8 talent-onboarding bug as a finding:

```json
{
  "id": "9f3a...",
  "tester_id": "tester.flow.talent",
  "biome": "talent-onboarding",
  "severity": "critical",
  "file_path": "src/screens/onboarding/talent/TalentNameScreen.tsx",
  "line_range": [12, 24],
  "summary": "talent_profiles row not persisted after onboarding wizard completes",
  "detail": "Headless run of the 8-step wizard with synthetic input completes. saveTalentProfile() is invoked but the resulting talent_profiles row is empty (all fields NULL). Root cause: each step screen owns its own useState; state is lost on navigation.",
  "repro_steps": [
    "maestro test e2e/talent-onboarding-full.yaml",
    "psql $SUPABASE_DB -c \"select * from talent_profiles order by created_at desc limit 1;\""
  ],
  "suggested_fix": "Lift onboarding state to a Context Provider. Each step screen reads/writes via useTalentOnboarding() instead of local useState.",
  "observed_at": "2026-05-11T14:32:11.000Z",
  "iteration": 0
}
```

**ID determinism:** `id = sha256(tester_id + "|" + biome + "|" + summary + "|" + (file_path || "") + "|" + (line_range ? line_range.join("-") : ""))`. The same defect across autofix iterations produces the same id, so dedupe is automatic.

### 15.5 Autofix loop

With `--autofix`, audit-run enters a heal loop that re-cultivates affected biomes until clean:

1. **Baseline run** — spawn all testers, collect findings.
2. **Compose brief-fix.md** — the aggregator prepends `only_biomes: [<critical + major biomes>]` and promotes each finding to an acceptance criterion ("MUST persist all 8 wizard fields…").
3. **Re-plant** — invoke `mycelium cultivate --only-biome <id>` for each affected biome. F1 skip-already-done filters out clean biomes automatically.
4. **Re-audit** — run testers again; if criticals remain and iterations < max, loop back to step 2.

**Termination conditions** (any one ends the loop):
- Zero critical findings (success).
- `iteration === maxIterations` (capped at 3 by default).
- Cumulative cost >= `--max-budget-usd` (budget exhausted).
- Findings count didn't decrease on a non-zero-criticals iteration (no progress — bail early).

Per-iteration metadata is persisted under `audit/<ts>/iterations/<n>/`. A final `heal-loop-summary.json` records all iterations.

See NUTRIENTS.md §8 for the `IterationRecord` schema.

### 15.6 Sporenet integration

Audit-run extends `sporenet/state.json` with an optional `audit` block:

```ts
interface SporenetAuditBlock {
  status: "pending" | "running" | "complete" | "failed";
  audit_run_id: string | null;
  iteration: number;
  findings_count: number;
  by_severity: { critical: number; major: number; minor: number };
  biomes_affected: string[];
  last_run_at: string | null;
  started_at: string | null;
}
```

The `sporenet serve` dashboard renders an **Audit pane** below the leaf grid when `state.audit` is present. The pane shows current status, finding counts by severity, and affected biomes — same auto-refresh path that surfaces cultivate in-flight state.

During long heal loops, audit progress is visible in real time. Reference: `cli/src/commands/sporenet.ts` F5 handler, `cli/src/lib/audit/sporenet-integration.ts`.

### 15.7 Authoring testers

Testers are operator-authored as `hyphae/HYPHA-TEST-<id>.md` files in your cultivation. Use the scaffold helper to generate a stub:

```bash
mycelium audit-run scaffold-tester <biome>
```

For the full authoring guide — CACHE HEADER fields, assertion patterns, repro recipes, tool budgets — see `docs/audit-run-tester-authoring.md`.

---

That's the full surface area. A new dev should be able to read `cli/src/commands/cultivate.ts` + this guide and ship their own organism.

*The network provides.* 🍄
