# Brief: Interactive Architecture Diagram — Legendary Funicular

## What we're building

A single-file interactive HTML architecture diagram (`ARCHITECTURE.html`) that visualizes the entire Legendary Funicular / Mycelium DDP ecosystem. Every component card links directly to its real implementation file in this repo. Clicking a component opens a side panel showing the actual source code, not a static description.

The diagram IS the documentation. It reads the actual codebase.

## Core goal

The Mycelium framework exists to reduce cost and increase optimization through parallel agent execution. The architecture diagram must communicate this — show the cost story, show the parallelism, show the flow from a single command to a cultivated organism. Make it viscerally clear why this beats sequential execution.

## Organisms and biomes

### layout-agent
Build the visual shell: layered dark-mode diagram with canvas particle background, layer headers, flow connectors with animated particles between layers, responsive grid. Match the aesthetic of `templates/scale.html` (Space Mono + Syne fonts, dark palette). No external JS dependencies.

### component-agent
Read every source file listed below and extract: file path (relative), one-line description from the top comment, exported function/class names. Write `arch-data.json` with the component map. Each component entry: `{ id, file, title, desc, exports[], color, layer }`.

Files to read:
- cli/src/commands/brief.ts (if exists, else stub)
- cli/src/commands/ddp.ts (if exists, else stub)  
- cli/src/commands/cultivate.ts
- cli/src/commands/sporenet.ts
- cli/src/commands/harvest.ts
- cli/src/commands/plant.ts
- cli/src/commands/integrate.ts
- cli/src/upgrades/telemetry-emitter.ts (stub if missing)
- cli/src/upgrades/cost-tracker.ts (stub if missing)
- cli/src/upgrades/alerting.ts (stub if missing)
- cli/src/upgrades/registry.ts
- cli/src/lib/telemetry/events.ts
- cli/src/lib/telemetry/ddp-stages.ts
- cli/src/lib/telemetry/alert-triggers.ts
- cli/src/lib/fleet/duckdb.ts
- cli/src/lib/fleet/queries.ts

### panel-agent
Build the detail panel component: slides in from right when a component is clicked. Shows: file path (copyable), actual source code in a syntax-highlighted code block (reads the real file via fetch), exported symbols, one-line description. Close on Escape or backdrop click. Smooth CSS transition.

### cost-agent
Build the cost visualization section: a horizontal bar at the top showing "why parallel beats sequential". Animated comparison: sequential cost (leaves × avg_cost) vs parallel cost (max_leaf_cost × overhead). Use real token cost numbers from NUTRIENTS.md §8. Show input/output token costs for claude-sonnet-4-6 vs claude-opus-4-7. Make the math visible.

### wiring-agent
Wire everything together into the final `ARCHITECTURE.html`. Import arch-data.json inline as a JS variable. Connect the layout shell, component cards (each with data-file attribute pointing to real path), panel system, cost section, search/filter, and flow animations. Validate that every component card has a working data-file link.

## Output

Single file: `ARCHITECTURE.html` at repo root.
Supporting data: `arch-data.json` (can be inlined into the HTML).

## Acceptance criteria

1. Opening `ARCHITECTURE.html` in a browser shows the full layered ecosystem
2. Clicking any component card opens the detail panel
3. The detail panel shows the actual source code of that file (fetched or inlined)
4. The cost comparison bar shows real numbers from NUTRIENTS.md §8
5. Search highlights matching components
6. Canvas particle background animates
7. No external JS dependencies (fonts from Google Fonts CDN is fine)
8. File links are real paths relative to the repo root

## What NOT to build

- No React, no Webpack, no build step
- No backend server required — inline the file contents or use relative fetch
- No placeholder descriptions — read the actual files
- No made-up cost numbers — use NUTRIENTS.md §8 exactly
