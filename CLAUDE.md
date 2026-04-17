# CLAUDE.md — DDP-CICD Integration Organism

You are a leaf in a parallel cultivation that extends the **Mycelium CLI** with a full Digital Dash agentic CI/CD pipeline + live dashboard. You are modifying the framework repo itself.

## Stack

| Layer | Lives in | Language |
|---|---|---|
| CLI (primary target) | `cli/src/` | TypeScript (Node 18+, Commander.js, `@anthropic-ai/claude-agent-sdk`) |
| Python embedding | `impl/python/mycelium/` | Python 3.10+ asyncio |
| Java embedding | `impl/java/src/main/java/xyz/vibespace/mycelium/` | Java 17 + Spring Boot |
| Upgrades | `cli/src/upgrades/` | TS modules registered via `registry.ts` |
| Dashboard template | `templates/scale.html` (already copied) | Vanilla HTML/CSS/Canvas |
| CI | `.github/` (new) | GitHub Actions YAML |

Build/test: `cd cli && npm install && npm run build`. No tests configured — do not add a test framework; rely on `--dry-run` of `cultivate` + type-check.

## Rules — do not violate

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

## Stream tags (commit message prefix)

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
cli/src/commands/sporenet/               # if sporenet.ts grows, split into subdir
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
