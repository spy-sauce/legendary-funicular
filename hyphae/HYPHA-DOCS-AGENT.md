# HYPHA — docs-agent

## CACHE HEADER
- **SCOPE:** extend DEVELOPER_GUIDE.md with CI/CD + dashboard sections; create Python and Java embedding guides.
- **PRIMITIVES:** markdown · examples · file trees · code blocks.
- **RULES:** append-only to DEVELOPER_GUIDE — do not rewrite existing sections · polyglot guides clarify embedding vs orchestration · link back to NUTRIENTS.md where applicable.
- **COUPLING:** documents outputs of every other biome; no code changes.
- **LOAD WHEN:** any leaf writing documentation.

## Scope
Lock in institutional memory for everything this cultivation produced. The code must be self-documenting via HYPHA files during the run; this biome ensures that after merge, a new dev landing on the repo can find what exists and how to use it.

## Deliverables by leaf

### `docs.guide.cicd`
- File: appends a new section to `DEVELOPER_GUIDE.md` at the end (before the final "*The network provides.*" line).
- Section heading: `## 13. CI/CD with Digital Dash`
- Covers:
  - The composite action path (`.github/actions/mycelium-run/action.yml`) with an inputs/outputs table.
  - An example `cultivate.yml` workflow snippet.
  - DDP stages list with icons and what each does.
  - How to override deploy stages via `./.github/hooks/<stage>.sh` in consuming repos.
  - Required + optional secrets (`ANTHROPIC_API_KEY`, `MYCELIUM_SLACK_WEBHOOK`, `MYCELIUM_S3_BUCKET`).
  - Where event logs land and how artifact upload works.
- ~120–180 lines.

### `docs.guide.dashboard`
- File: appends `## 14. Dashboard & Fleet View`
- Covers:
  - `mycelium sporenet serve` usage.
  - The three phases (cultivate / harvest / digital-dash) and how phase inference works.
  - Route table (`/`, `/api/state`, `/api/events`, `/api/events/stream`, `/fleet`, `/api/fleet/*`).
  - The `?demo=1` simulator mode.
  - scale.html data-binding slot — how to customize the shell.
  - Fleet view: what it shows, DuckDB under the hood, how to scope to one organism.
- ~100–140 lines.

### `docs.polyglot.python`
- File: **new** `impl/python/README.md`
- Clearly states: *the CLI is the orchestrator. Python is for embedding agents inside an existing Python service that should participate in a Mycelium network as a leaf or specialist.*
- Covers:
  - Install: `pip install -e impl/python`
  - `BaseAgent` subclass minimal example with `execute()`, `flow()`, `fruit()`.
  - How to join a network via `LocalEventBus` (single-process) or plan for a Redis bus (future).
  - When NOT to use this: if you want to orchestrate from scratch, use the TS CLI instead.
- ~80–120 lines.

### `docs.polyglot.java`
- File: **new** `impl/java/README.md`
- Symmetric to Python but Spring-flavored.
- Covers:
  - Maven coordinates: `org.vibespace:mycelium-framework:1.0.0-SNAPSHOT`.
  - `MyceliumAgent` subclass example with `@MyceliumNode` annotation.
  - Spring Boot autowiring of `MyceliumOrchestrator` and `LocalEventBus` / `RedisEventBus`.
  - Clarifies that `MyceliumOrchestrator` in Java does **not** replace `mycelium cultivate` — it's an in-process coordinator for JVM-side agents that participate in a larger organism.
- ~80–120 lines.

## Contract dependencies
- All of NUTRIENTS.md (documenting what others built)
- Actual code shipped by other biomes in this cultivation — **you must `Read` the files before documenting them**. Do not invent APIs. If a file doesn't exist at write-time, leaf it as TBD rather than hallucinating.

## Acceptance criteria
- `DEVELOPER_GUIDE.md` still contains every existing section unchanged — only appends `## 13` and `## 14`.
- `impl/python/README.md` and `impl/java/README.md` both exist and link back to the main README.
- No broken links to files that don't exist (especially important for leaves that run last — check with `Read` before linking).
- Main `README.md` gets one new line at the bottom pointing to the new sections: *"See DEVELOPER_GUIDE.md §13–14 for CI/CD and dashboard."*

## Out of scope
- Rewriting the README or MANIFESTO.
- Translating existing docs to other languages.
- API reference generation — prose is fine.

## Merge instructions
Merged last so documented APIs reflect what actually shipped. Read the merged state of `cli/src/upgrades/`, `cli/src/commands/sporenet/`, `cli/src/lib/fleet/`, `.github/`, `impl/python/`, `impl/java/` before writing. If a referenced file is missing, document it as "planned" and emit a FRUIT_FAILED if more than one documented feature is absent.
