# Architecture — Legendary Funicular / Mycelium DDP

**VibeSpace LLC · The network provides.**

---

## The core design decision

Two things that look similar are actually different jobs:

| | Who owns it | What it's good at |
|---|---|---|
| **Execution mechanics** | Framework (TypeScript) | Parallelism, reproducibility, audit trail, hooks |
| **Decision intelligence** | Claude (operator layer) | Failure reasoning, adaptive re-planning, natural language |

The framework runs the machine. Claude decides what the machine should do next.

They are not competing — they compose. Claude holds tools that map to framework primitives. The framework emits a structured event log that Claude reads. Neither knows how to do the other's job well.

---

## Layer diagram

```
┌─────────────────────────────────────────────────────┐
│  User (browser / terminal)                          │
│  ↕  natural language                                │
├─────────────────────────────────────────────────────┤
│  Claude Operator Layer                              │
│  · reads state.json + JSONL event log               │
│  · reasons about failures, costs, health            │
│  · calls framework tools: cultivate_biome,          │
│    harvest, read_events, run_ddp, mark_leaf         │
├─────────────────────────────────────────────────────┤
│  Framework Execution Layer  (mycelium CLI)          │
│  · plant → contracts freeze → cultivate → harvest   │
│  · parallel fan-out: 30 leaves × Claude Agent SDK  │
│  · upgrade hooks: telemetry, cost, alerting         │
│  · JSONL event log: .mycelium/events/<run_id>.jsonl │
│  · state: sporenet/state.json                       │
├─────────────────────────────────────────────────────┤
│  DDP CI/CD Pipeline  (.github/)                     │
│  · composite action: mycelium-run                   │
│  · 8 stages: merge-order → lint → typecheck →       │
│    test → build → deploy-stg → smoke → deploy-prod  │
│  · ddp-emit.sh writes stage events into JSONL       │
└─────────────────────────────────────────────────────┘
```

---

## Entry points

### `mycelium brief`
Conversational brief generator. Claude asks questions about your project; the conversation produces a structured `brief.md`. Optionally pipes straight into `mycelium plant` then `mycelium ddp`.

This is the zero-friction onramp — no manual YAML, no reading docs first.

```
you → claude (Q&A) → brief.md → plant → contracts freeze → cultivate → harvest → dashboard
```

### `mycelium ddp`
Single-command pipeline runner. Chains everything that previously required 5 separate commands:

```
[plant] → contracts freeze → sporenet init → cultivate -c 30 → harvest → sporenet serve
```

Options: `--brief`, `--concurrency`, `--threshold`, `--port`, `--no-serve`, `--dry-run`.

### `mycelium sporenet serve`
Live dashboard + Claude operator interface. Two panels:

- **Left:** scale.html cultivation tree, DDP pipeline bars, fleet view — driven by live JSONL tail via SSE
- **Right:** Chat panel — Claude reads state and events, answers questions, and can execute operator tools

---

## Claude operator tools (dashboard chat)

These are the tools Claude gets when running as the chat-panel operator. They wrap framework CLI calls and file reads — no net-new logic.

```ts
read_state()                    // → sporenet/state.json
read_events(since?: string)     // → JSONL lines from .mycelium/events/<run_id>.jsonl
cultivate_biome(id: string)     // → mycelium cultivate --only-biome <id>
harvest(threshold?: number)     // → mycelium harvest -t <threshold>
run_ddp(options?)               // → mycelium ddp (full chain)
mark_leaf(id, status, commit?)  // → mycelium sporenet mark <id> -s <status>
list_upgrades()                 // → mycelium upgrades list
```

Claude's system prompt injects the current organism context (name, run_id, leaf summary, DDP stage status) on every message. The operator sees exactly what the dashboard shows.

**The framework still owns parallelism.** When Claude calls `cultivate_biome(id)`, it's invoking the TypeScript execution loop — not reasoning about scheduling 30 parallel Claude sessions itself.

---

## Execution upgrade stack

Upgrades are composable hooks that fire at lifecycle points inside `cultivate`. They are the framework's plugin system — not Claude logic.

```
cultivate starts
    │
    ├── beforePlan     → telemetry-emitter (generate run_id, emit run_started)
    │
    ├── beforeSpawn    → (each leaf) → cache-headers, routing-map load HYPHA context
    │                                → crash-recovery skips already-fruited leaves
    │
    ├── transformPrompt → cache-headers injects CACHE HEADER into leaf prompt
    │
    ├── afterLeaf      → telemetry-emitter (emit leaf_fruited / leaf_failed)
    │                  → cost-tracker (emit cost_recorded from SDK usage metadata)
    │                  → alerting (evaluate trigger policy, fire Slack / GH issue)
    │
    └── onCrash        → telemetry-emitter (emit run_ended with health=0)
                       → alerting (severity=critical, always fires)
```

Upgrades are opt-in per organism via `organism.upgrades` in `mycelium.yaml`. The DDP organism activates all of them.

---

## Data flows

### Telemetry flow
```
leaf completes
  → afterLeaf hook (telemetry-emitter)
    → buildLeafFruited() / buildLeafFailed()
      → sink-jsonl.ts appends to .mycelium/events/<run_id>.jsonl
      → sink-s3.ts (if MYCELIUM_S3_BUCKET set) uploads best-effort
```

### Dashboard live-update flow
```
JSONL file grows on disk
  → /api/events/stream (SSE endpoint in sporenet serve)
    tails the file, emits new lines as server-sent events
      → scale.html EventSource listener
        → re-renders leaf status, DDP bars, stats panel
```

### DDP stage flow
```
GitHub Actions step starts
  → ddp-emit.sh writes ddp_stage_started to JSONL
    → step executes (lint, typecheck, test, build, deploy...)
      → ddp-emit.sh writes ddp_stage_ended with status + wall_ms
        → dashboard DDP panel updates live
```

### Two workflows, two targets (not a contradiction)
- `.github/workflows/cultivate.yml` — the full **8-stage DDP pipeline** (merge-order → lint → typecheck → test → build → deploy-stg → smoke → deploy-prod) for **cultivated apps** (organisms grown from a brief).
- `.github/workflows/ci.yml` — a **4-stage PR gate** (lint → typecheck → test → build) for **framework code itself** (PRs / pushes to this repo). It reuses the same DDP stage scripts but stops at the reproducible-locally stages; deploy stages are deferred until a prod instance exists.

Same stage scripts, different subjects: cultivate.yml validates what the framework *grows*; ci.yml validates the framework that *does the growing*.

### Fleet query flow
```
.mycelium/events/*.jsonl  (many runs, many organisms)
  → duckdb.ts (DuckDB WASM over JSONL, no ETL)
    → queries.ts: listOrganisms(), organismRollup(), stageDurations()
      → /api/fleet/* HTTP endpoints
        → fleet.html organism cards
```

---

## What the framework is not

- **Not a sequential task runner.** The entire leaf tree fans out in one wave (contract-freeze gating). Scheduling is the framework's job, not Claude's.
- **Not Claude reasoning about its own parallelism.** Claude cannot efficiently manage 30 concurrent sessions; the TypeScript loop does that.
- **Not opinionated about stack.** Leaves write whatever they write — TypeScript, Python, YAML, shell. The framework only cares about `FRUIT_READY` / `FRUIT_FAILED` in the last line.

---

## File layout (what matters)

```
legendary-funicular/
├── cli/src/
│   ├── commands/
│   │   ├── brief.ts           ← NEW: conversational brief generator
│   │   ├── ddp.ts             ← NEW: single-command pipeline runner
│   │   ├── cultivate.ts       ← DO NOT CHANGE public contract
│   │   ├── sporenet.ts        ← EXTEND: add /api/state, /api/events, /api/chat
│   │   └── sporenet/templates/
│   │       ├── scale.html     ← data-bound version (mycelium-data slot + chat panel)
│   │       └── fleet.html
│   ├── upgrades/
│   │   ├── telemetry-emitter.ts   ← NEW
│   │   ├── cost-tracker.ts        ← NEW
│   │   ├── alerting.ts            ← NEW
│   │   └── registry.ts            ← EXTEND: register 3 new upgrades
│   └── lib/
│       ├── telemetry/
│       │   ├── events.ts          ← exists
│       │   ├── ddp-stages.ts      ← exists
│       │   ├── sink-jsonl.ts      ← NEW
│       │   ├── sink-s3.ts         ← NEW
│       │   ├── sink-slack.ts      ← NEW
│       │   ├── sink-github.ts     ← NEW
│       │   ├── cost-table.ts      ← NEW
│       │   ├── cost-reconcile.ts  ← NEW
│       │   ├── cost-rollup.ts     ← NEW
│       │   └── alert-triggers.ts  ← exists
│       └── fleet/
│           ├── duckdb.ts          ← NEW
│           └── queries.ts         ← exists
├── .github/
│   ├── actions/mycelium-run/action.yml   ← NEW
│   ├── workflows/cultivate.yml           ← NEW
│   └── scripts/
│       ├── ddp-emit.sh                   ← NEW
│       └── stages/                       ← NEW (8 scripts)
├── ARCHITECTURE.md   ← this file
├── MANIFESTO.md
├── DEVELOPER_GUIDE.md
├── mycelium.yaml
├── NUTRIENTS.md
└── CLAUDE.md
```

---

## Build order (dependency sequence)

```
1. lib/telemetry/sink-jsonl.ts         no deps
2. lib/telemetry/sink-s3.ts            no deps
3. lib/telemetry/cost-table.ts         no deps
4. lib/telemetry/cost-reconcile.ts     uses cost-table
5. lib/telemetry/cost-rollup.ts        uses cost-reconcile
6. lib/telemetry/sink-slack.ts         uses alert-triggers (exists)
7. lib/telemetry/sink-github.ts        uses alert-triggers
8. lib/fleet/duckdb.ts                 no deps (duckdb npm)
9. upgrades/telemetry-emitter.ts       uses sink-jsonl, sink-s3, events
10. upgrades/cost-tracker.ts           uses cost-reconcile, cost-table, events
11. upgrades/alerting.ts               uses sink-slack, sink-github, alert-triggers
12. upgrades/registry.ts               add 9/10/11
13. sporenet.ts                        add /api/state, /api/events, /api/chat routes
14. sporenet/templates/scale.html      port from templates/scale.html + chat panel
15. commands/brief.ts                  uses Anthropic SDK streaming
16. commands/ddp.ts                    uses all commands as library calls
17. index.ts                           register brief + ddp
18. .github/ CI/CD files               pure YAML/bash, no TS deps
19. harvest.ts                         add cost summary section
20. DEVELOPER_GUIDE.md §13/14          docs, last
```

*The network provides.* 🍄
