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

The composite action sources these if present:

```bash
# .github/hooks/deploy-stg.sh
#!/usr/bin/env bash
set -euo pipefail

echo "Deploying to staging..."
fly deploy --app my-app-staging
```

**Production gating:** `deploy-prod` only runs if the `MYCELIUM_PROD_APPROVED` environment variable is set to `true`. Use GitHub's environment protection rules to require manual approval:

```yaml
jobs:
  deploy-prod:
    environment: production   # requires approval in repo settings
    env:
      MYCELIUM_PROD_APPROVED: "true"
```

### 13.6 Secrets and environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | **yes** | Claude API access for leaf sessions |
| `MYCELIUM_SLACK_WEBHOOK` | no | Slack webhook URL for alerts (see NUTRIENTS.md §7) |
| `MYCELIUM_S3_BUCKET` | no | S3 bucket for event log replication |
| `MYCELIUM_PROD_APPROVED` | no | Gate for production deploy stage |

**Never** commit secrets. Use GitHub repository secrets or environment secrets.

### 13.7 Event emission

Each DDP stage is wrapped by `.github/scripts/ddp-emit.sh`, which writes events to `.mycelium/events/<run_id>.jsonl`:

```bash
# Emits ddp_stage_started event
./ddp-emit.sh start <stage-id>

# Run the stage...

# Emits ddp_stage_ended event with status
./ddp-emit.sh end <stage-id> <success|failure|skipped> <wall_ms>
```

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

The action uploads three artifacts on completion:

| Artifact | Contents |
|----------|----------|
| `mycelium-events-<run_id>` | `.mycelium/events/<run_id>.jsonl` — full event log |
| `mycelium-state-<run_id>` | `sporenet/state.json` — final leaf states |
| `mycelium-cellular-map` | `CELLULAR-MAP.md` — tree visualization |

Download artifacts via the GitHub Actions UI or API for post-hoc analysis, dashboard replay, or fleet aggregation.

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

That's the full surface area. A new dev should be able to read `cli/src/commands/cultivate.ts` + this guide and ship their own organism.

*The network provides.* 🍄
