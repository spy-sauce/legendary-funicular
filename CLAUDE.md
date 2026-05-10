# Mycelium — Framework-Level Context

@HANDOFF.md

## What this is
**Mycelium** — language-agnostic multi-agent orchestration framework. Patent-pending. Decentralized: no central node, peer-to-peer biome messaging. Created by Space Cowboy #9 — VibeSpace LLC.

This repo contains BOTH:
1. **The framework itself** — `cli/`, `impl/python/`, `impl/java/`, `templates/`, `sporenet/`, `upgrades/`, `examples/`, `spec/`, `arch-brief/`
2. **An active cultivation** that uses the framework to extend the framework — `hyphae/`, `NUTRIENTS.md`, `CELLULAR-MAP.md`, `mycelium.yaml` (currently scoped to "ddp-integration")

When you cd in fresh, default to **framework-level work**. Cultivation context lives in the second half of this file — load it only when working on the active cultivation.

## Stack
| Layer | Lives in | Language |
|---|---|---|
| CLI (orchestration) | `cli/src/` | TypeScript (Node 18+, Commander.js, `@anthropic-ai/claude-agent-sdk`) |
| Python embedding | `impl/python/mycelium/` | Python 3.10+ asyncio |
| Java embedding | `impl/java/src/main/java/xyz/vibespace/mycelium/` | Java 17 + Spring Boot (`xyz.vibespace:mycelium-framework`) |
| Dashboard | `sporenet/` + `templates/` | Vanilla HTML/CSS/Canvas + SSE |
| Upgrade modules | `cli/src/upgrades/` | TS modules registered via `registry.ts` |

**TS CLI is the orchestration layer.** Python and Java are *embedding-only* — they let an app participate as a leaf in a cultivation, not run a cultivation themselves.

## Architecture in 30 seconds
Three composable layers (per `ARCHITECTURE.md`):

1. **Claude Operator Layer** — natural language; reads `state.json` + JSONL events; reasons about failures, costs, health; calls framework tools.
2. **Framework Execution Layer** — TS CLI; owns parallelism, reproducibility, audit trail, hooks; emits structured events; runs the cultivation.
3. **DDP CI/CD Pipeline** — `.github/` composite action + 8-stage pipeline (merge-order → lint → typecheck → test → build → deploy-stg → smoke → deploy-prod).

Framework owns parallelism. Claude owns decision intelligence. They compose; neither tries to do the other's job.

## Common commands
```bash
# Build the CLI
cd cli && npm install && npm run build

# Type-check (no test framework — by design)
cd cli && npx tsc --noEmit

# Zero-friction onramp (Claude Q&A → brief.md → plant → freeze → cultivate → harvest)
mycelium brief

# Full pipeline (plant → freeze → cultivate → harvest → serve)
mycelium ddp

# Live dashboard + Claude operator panel
mycelium sporenet serve --port 3333
```

## Where things live
- `cli/src/commands/` — CLI entry points (cultivate, harvest, plant, brief, ddp, sporenet)
- `cli/src/upgrades/` — upgrade modules (telemetry-emitter, cost-tracker, alerting, etc.)
- `cli/src/lib/` — shared utilities (telemetry, fleet, etc.)
- `impl/python/mycelium/` — Python embedding library
- `impl/java/.../mycelium/` — Java embedding library
- `templates/` — dashboard HTML templates (`scale.html`, `fleet.html`)
- `sporenet/` — dashboard server + per-organism `state.json`
- `upgrades/` — registered upgrade specs
- `examples/` — example consumers
- `arch-brief/`, `spec/`, `MANIFESTO.md`, `ARCHITECTURE.md`, `DEVELOPER_GUIDE.md` — evergreen docs
- `hyphae/`, `NUTRIENTS.md`, `CELLULAR-MAP.md`, `mycelium.yaml` — **per-cultivation** artifacts (currently ddp-integration)

## Stream tag
Framework-level work: `MYC/<short-kebab-desc>` per global taxonomy.
Cultivation work uses cultivation-specific tags (see cultivation context below — current cultivation uses `MF/TELEMETRY`, `MF/CICD`, etc.).

## Frozen vocab + lifecycle
**Vocab (do not redefine):** HYPHA · HYPHAE · NUTRIENTS · BIOME BUS · FRUITING BODY · SPORULATION · PRUNING · HPP · NFA

**Lifecycle:** SPORE → GERMINATING → GROWING → FLOWING → FRUITING → DORMANT (then back to SPORE for the next cycle)

See `MANIFESTO.md` for the full Five Laws and conceptual model.

## Hard rules — framework-level
1. **Don't run `git`** — orchestrator owns commits. Read-only `git log` / `git diff` only.
2. **Don't touch `cli/src/commands/cultivate.ts` public contract** (flags, prompt shape, CommitQueue behavior). Add hooks inside lifecycle extension points only.
3. **Don't rename existing commands or flags.** Adding is fine; renaming breaks prior organisms.
4. **Don't install new npm/pip/maven dependencies without strong justification.** Document *why* in your `FRUIT_READY` line if unavoidable.
5. **Don't write tests.** This repo intentionally has none — `--dry-run` of cultivate + `tsc --noEmit` is the discipline.
6. **Don't modify another biome's files.** Use frozen stubs in `NUTRIENTS.md` for cross-biome data.
7. **Read before write.** Read `NUTRIENTS.md` and your own `hyphae/HYPHA-<BIOME>-AGENT.md` before touching code.
8. **No secrets in code or commits.** `ANTHROPIC_API_KEY`, Slack webhooks, etc. are env-var only.
9. **Preserve `sporenet/state.json` shape** (see `cli/src/commands/sporenet.ts:34-42`). May extend with optional fields; may not remove or rename existing ones.
10. **Preserve the `Upgrade` interface** in `cli/src/lib/upgrades/types.ts`. New hooks require coordination.

## Patent + IP
Mycelium is **patent-pending**. Don't describe internals externally without confirming with SPY first. Same posture as the AMMSS guardrail in the global `CLAUDE.md`.

## Pointer: mycelium-claude (extension)
The `mycelium-claude` extension — agent definitions that execute total product builds from business requirements — lives in `zip_dbl_cup` (NAS storage, off-machine). NOT in this repo. Don't reference as if local. Analysis deferred to post-Session-8 archive merge.

---
---

# Cultivation Context — ddp-integration

> The section below is **per-cultivation context** for the active "ddp-integration" cultivation. It applies when working inside that cultivation's scope. Skip if you're doing framework-level work above.

You are a leaf in a parallel cultivation that extends the **Mycelium CLI** with a full Digital Dash agentic CI/CD pipeline + live dashboard. You are modifying the framework repo itself.

## Stack (cultivation-scoped)

| Layer | Lives in | Language |
|---|---|---|
| CLI (primary target) | `cli/src/` | TypeScript (Node 18+, Commander.js, `@anthropic-ai/claude-agent-sdk`) |
| Python embedding | `impl/python/mycelium/` | Python 3.10+ asyncio |
| Java embedding | `impl/java/src/main/java/xyz/vibespace/mycelium/` | Java 17 + Spring Boot |
| Upgrades | `cli/src/upgrades/` | TS modules registered via `registry.ts` |
| Dashboard template | `templates/scale.html` (already copied) | Vanilla HTML/CSS/Canvas |
| CI | `.github/` (new) | GitHub Actions YAML |

Build/test: `cd cli && npm install && npm run build`. No tests configured — do not add a test framework; rely on `--dry-run` of `cultivate` + type-check.

## Cultivation rules — do not violate

1. **Do not run `git`**. Orchestrator owns commits. If you need to inspect history, use `git log` / `git diff` only (read-only). Never `commit`, `push`, `reset`, `checkout`, `branch`, `merge`, `rebase`.
2. **Do not touch `cli/src/commands/cultivate.ts` public contract** (flags, prompt shape, CommitQueue behavior). You may add hooks inside existing lifecycle extension points only.
3. **Do not rename existing commands or flags.** Adding is fine; renaming breaks prior organisms.
4. **Do not install new npm/pip/maven dependencies without strong justification.** Prefer Node stdlib, fs/http. If a new dep is unavoidable, document *why* in your FRUIT_READY line.
5. **Do not write tests** unless your HYPHA explicitly asks for them. This repo has none today.
6. **Do not modify another biome's files.** Your HYPHA lists your scope. If you need something from another biome, use the frozen stubs in `NUTRIENTS.md`.
7. **Read before write.** Every leaf must read `NUTRIENTS.md` and its own `hyphae/HYPHA-<BIOME>-AGENT.md` before writing code.
8. **No secrets in code or commits.** `ANTHROPIC_API_KEY`, Slack webhook URLs, etc. come from env vars only.
9. **Preserve the existing `sporenet/state.json` shape** (see `cli/src/commands/sporenet.ts:34-42`). You may *extend* it with optional fields; you may not remove or rename existing fields.
10. **Preserve the existing `Upgrade` interface** in `cli/src/lib/upgrades/types.ts`. New hooks require coordination — not in scope for this cultivation.

## Cultivation stream tags (commit message prefix)

Orchestrator auto-tags commits based on biome. Your biome → tag:

| Biome | Tag |
|---|---|
| telemetry-agent | `MF/TELEMETRY` |
| dashboard-agent | `MF/DASHBOARD` |
| cicd-agent | `MF/CICD` |
| cost-agent | `MF/COST` |
| alerting-agent | `MF/ALERTING` |
| fleet-agent | `MF/FLEET` |
| docs-agent | `MF/DOCS` |

## File layout for new code

```
cli/src/upgrades/telemetry-emitter.ts     # telemetry biome
cli/src/upgrades/cost-tracker.ts          # cost biome
cli/src/upgrades/alerting.ts              # alerting biome
cli/src/lib/telemetry/                    # shared telemetry helpers (sinks, event builders)
cli/src/lib/fleet/                        # DuckDB query layer
cli/src/commands/sporenet/templates/      # dashboard HTML templates
cli/src/commands/sporenet/                # if sporenet.ts grows, split into subdir
.github/actions/mycelium-run/action.yml   # composite action
.github/workflows/cultivate.yml           # example workflow
.github/scripts/ddp-emit.sh               # DDP stage event emitter
DEVELOPER_GUIDE.md                        # append-only edits, do not rewrite existing sections
impl/python/README.md                     # new — embedding guide
impl/java/README.md                       # new — embedding guide
```

Existing `cli/src/commands/sporenet.ts` may be split into `cli/src/commands/sporenet/index.ts` + modules if needed for phase-3 wiring, preserving all current exports and CLI behavior.

## Leaf completion

Each leaf must finish with exactly one line:

```
[<leaf-id>] FRUIT_READY — <one-sentence deliverable summary>
```

If blocked or unable to complete, finish with:

```
[<leaf-id>] FRUIT_FAILED — <reason>
```

Orchestrator commits your staged diff under the appropriate stream tag. Do not `git add` or `git commit` yourself.
