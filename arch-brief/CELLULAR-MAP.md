# arch-brief Cellular Execution Map

> **Gating model**: Max-concurrency execution tree where gating is determined by
> **contract freeze**, not fruit completion. Every leaf specialist operates as
> its own Claude Agent SDK session on its own branch. Specialists consume frozen
> contract stubs from NUTRIENTS.md, not upstream code. Integration happens at
> merge time via deterministic merge order, not execution time.

---

## Concurrency Math

| Depth | Count |
|-------|-------|
| Biomes (1) | 5 |
| Specialists (2) | 10 (estimated after first decomposition) |
| Leaf specialists (3) | 15-20 (target for full decomposition) |
| **Peak concurrent sessions (now)** | **4** (component, layout, panel, cost run in parallel) |
| **Peak concurrent sessions (target)** | **12-15** (after leaf decomposition) |

---

## Gating Semantics

**Old wave-gating**: Agents waited for upstream agents to complete (`fruit()`)
before starting. This created sequential bottlenecks — agent B couldn't start
until agent A finished, even if B only needed A's interface contract, not A's
actual output.

**New contract-freeze gating**: All agents consume frozen contracts from
NUTRIENTS.md. An agent can start as soon as its contract dependencies are
frozen, regardless of whether upstream agents have finished. The only true
dependency is at merge time: agents merge in declared order, and integration
tests run post-merge. This maximizes parallelism — in arch-brief, all four
leaf agents (component, layout, panel, cost) can run simultaneously because
they all consume the same frozen contracts with no code dependencies on each
other.

---

## Execution Tree

```
organism: arch-brief
│
├── component-agent (2) — extracts source metadata
│   ├── component-agent.file-reader — reads and parses TypeScript files
│   └── component-agent.json-writer — assembles and writes arch-data.json
│
├── layout-agent (3) — builds visual shell
│   ├── layout-agent.html-structure — creates layer containers and grid
│   ├── layout-agent.particle-canvas — implements canvas particle background
│   └── layout-agent.flow-connectors — adds animated layer connectors
│
├── panel-agent (3) — builds detail panel
│   ├── panel-agent.panel-chrome — creates panel structure and transitions
│   ├── panel-agent.code-display — implements syntax highlighting
│   └── panel-agent.interactions — handles close, copy, navigation
│
├── cost-agent (2) — builds cost visualization
│   ├── cost-agent.data-prep — extracts numbers from NUTRIENTS.md §8
│   └── cost-agent.visualization — builds animated bar comparison
│
└── wiring-agent (1) — flat; leaf decomposition TODO
    └── (integration agent — runs after all upstream, minimal decomposition value)
```

---

## What's Next

1. **Decompose layout-agent into 3 specialists** (+2 concurrent sessions)
   - Separate particle canvas from flow connectors from HTML structure
   - Each can be developed/tested independently

2. **Decompose panel-agent into 3 specialists** (+2 concurrent sessions)
   - Panel chrome, syntax highlighting, and interaction handlers are independent
   - Syntax highlighting is the most complex — benefits from isolation

3. **Decompose component-agent into 2 specialists** (+1 concurrent session)
   - File reading/parsing vs JSON assembly
   - Minor gain but cleaner separation

4. **Decompose cost-agent into 2 specialists** (+1 concurrent session)
   - Data extraction vs visualization
   - Visualization could be further split (bars, numbers, animation)

**Total session delta**: +6 concurrent sessions (from 4 to 10 at depth-2)

---

## Parked for Later

- **Rate-limit tuning**: Claude API rate limits may throttle actual concurrency below theoretical max
- **Circuit breakers**: No retry/fallback logic for failed specialists yet
- **Cost caps**: No per-organism spend limits implemented
- **Telemetry hooks**: Specialist-level telemetry not wired (parent organism telemetry only)
- **Branch conflict resolution**: Merge order handles most cases; edge cases deferred
- **Hot reload**: No live recomposition of running organisms
