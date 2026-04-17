# NUTRIENTS.md — Frozen Contracts

This document contains all shared contracts for the arch-brief organism.
Contracts are frozen at organism inception. Agents consume these interfaces,
not upstream code.

---

## §1 DATA_CONTRACTS

### ComponentEntry

```typescript
interface ComponentEntry {
  /** Unique identifier, kebab-case */
  id: string;

  /** Relative file path from repo root */
  file: string;

  /** Human-readable title derived from filename */
  title: string;

  /** One-line description extracted from top comment */
  desc: string;

  /** List of exported function/class names */
  exports: string[];

  /** Color for the component card (hex or CSS variable) */
  color: string;

  /** Layer this component belongs to */
  layer: 'cli-commands' | 'upgrades' | 'telemetry' | 'fleet';
}
```

### ArchData

```typescript
interface ArchData {
  /** Timestamp when data was extracted */
  generatedAt: string;

  /** Array of all component entries */
  components: ComponentEntry[];

  /** Layer metadata for rendering */
  layers: LayerMeta[];
}
```

### LayerMeta

```typescript
interface LayerMeta {
  id: string;
  label: string;
  description: string;
  color: string;
  order: number;
}
```

### CostComparison

```typescript
interface CostComparison {
  sequential: {
    formula: string;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  parallel: {
    formula: string;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  savings: {
    percentage: number;
    absolute: number;
  };
}
```

---

## §2 DESIGN_TOKENS

### Colors

```css
:root {
  /* Background layers */
  --bg-base: #0a0a0f;
  --bg-surface: #12121a;
  --bg-elevated: #1a1a24;
  --bg-overlay: rgba(10, 10, 15, 0.95);

  /* Text */
  --text-primary: #e8e8ed;
  --text-secondary: #9090a0;
  --text-muted: #606070;

  /* Accent colors by layer */
  --accent-cli: #7c3aed;        /* Purple - CLI commands */
  --accent-upgrades: #2563eb;   /* Blue - Upgrades */
  --accent-telemetry: #059669;  /* Green - Telemetry */
  --accent-fleet: #d97706;      /* Amber - Fleet */

  /* Interaction */
  --border-default: #2a2a3a;
  --border-hover: #4a4a5a;
  --glow-active: rgba(124, 58, 237, 0.3);

  /* Cost visualization */
  --cost-sequential: #ef4444;   /* Red */
  --cost-parallel: #22c55e;     /* Green */
  --cost-savings: #fbbf24;      /* Yellow */
}
```

### Typography

```css
:root {
  /* Font families */
  --font-mono: 'Space Mono', monospace;
  --font-display: 'Syne', sans-serif;

  /* Font sizes */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;

  /* Line heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

### Spacing

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
}
```

### Animation

```css
:root {
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 400ms ease;
  --transition-panel: 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## §3 API_CONTRACTS

This organism has no backend API. All data is static/inlined.

| Method | Path | Response |
|--------|------|----------|
| N/A | `arch-data.json` | `ArchData` (static file or inlined) |
| N/A | `{component.file}` | Raw source code (fetched via relative path) |

---

## §4 LAYER_DEFINITIONS

| Layer ID | Label | Description | Order |
|----------|-------|-------------|-------|
| `cli-commands` | CLI Commands | Entry points: brief, ddp, cultivate, sporenet, harvest, plant, integrate | 1 |
| `upgrades` | Upgrades | Enhancement modules: telemetry-emitter, cost-tracker, alerting, registry | 2 |
| `telemetry` | Telemetry | Observability: events, ddp-stages, alert-triggers | 3 |
| `fleet` | Fleet | Data layer: duckdb, queries | 4 |

---

## §5 FILE_MANIFEST

Source files to extract for `arch-data.json`:

```
cli/src/commands/brief.ts
cli/src/commands/ddp.ts
cli/src/commands/cultivate.ts
cli/src/commands/sporenet.ts
cli/src/commands/harvest.ts
cli/src/commands/plant.ts
cli/src/commands/integrate.ts
cli/src/upgrades/telemetry-emitter.ts
cli/src/upgrades/cost-tracker.ts
cli/src/upgrades/alerting.ts
cli/src/upgrades/registry.ts
cli/src/lib/telemetry/events.ts
cli/src/lib/telemetry/ddp-stages.ts
cli/src/lib/telemetry/alert-triggers.ts
cli/src/lib/fleet/duckdb.ts
cli/src/lib/fleet/queries.ts
```

If a file does not exist, create a stub entry with `desc: "Stub — file not found"`.

---

## §6 PANEL_SPEC

The detail panel must:

1. Slide in from right edge (300ms transition)
2. Width: 50vw on desktop, 100vw on mobile (< 768px)
3. Show file path with copy button
4. Display source code with syntax highlighting (inline CSS, no external lib)
5. List exported symbols
6. Close on: Escape key, backdrop click, close button

---

## §7 PARTICLE_SPEC

Canvas particle background:

- Particle count: ~100 (scale with viewport)
- Particle size: 1-3px
- Color: `var(--text-muted)` at 30% opacity
- Movement: Slow drift (0.2-0.5px/frame)
- Connection lines: Draw between particles within 100px, opacity based on distance
- Frame rate: requestAnimationFrame, throttle to 30fps on low-power devices

---

## §8 COST_MODEL

Token costs (as of 2024-01, from Anthropic pricing):

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-opus-4-7 | $15.00 | $75.00 |

### Sequential Execution Cost Formula

```
sequential_cost = Σ(leaf_input_tokens × input_rate + leaf_output_tokens × output_rate)
                = num_leaves × avg_cost_per_leaf
```

### Parallel Execution Cost Formula

```
parallel_cost = max(leaf_costs) × parallelism_overhead
              ≈ max_leaf_cost × 1.1  (10% coordination overhead)
```

### Example Calculation (5 agents, Sonnet)

Assumptions:
- Average input tokens per agent: 50,000
- Average output tokens per agent: 10,000
- 5 leaf agents

**Sequential:**
```
5 × ((50,000 × $3.00/1M) + (10,000 × $15.00/1M))
= 5 × ($0.15 + $0.15)
= 5 × $0.30
= $1.50 total
Time: 5 × avg_time = 5T
```

**Parallel:**
```
max(all_leaf_costs) × 1.1
= $0.30 × 1.1
= $0.33 total (same token cost, but TIME is 1T not 5T)
```

**The win is time, not raw token cost.** Parallel execution completes in 1T instead of 5T while spending the same tokens. The cost visualization should emphasize **time-to-completion** as the primary benefit.

### Visualization Data

```javascript
const COST_DATA = {
  model: 'claude-sonnet-4-6',
  inputRate: 3.00,   // per 1M tokens
  outputRate: 15.00, // per 1M tokens

  sequential: {
    agents: 5,
    avgInputTokens: 50000,
    avgOutputTokens: 10000,
    timeUnits: 5,
  },

  parallel: {
    agents: 5,
    avgInputTokens: 50000,
    avgOutputTokens: 10000,
    timeUnits: 1,
    overhead: 1.1,
  }
};
```

---

## §9 SEARCH_SPEC

Search/filter functionality:

- Input field: fixed position, top-right of diagram area
- Filter by: component title, description, exports, layer
- Highlight matching components (add `.highlighted` class)
- Dim non-matching components (0.3 opacity)
- Clear on Escape or clear button
- Debounce: 150ms

---

## §10 ACCEPTANCE_CHECKLIST

- [ ] `ARCHITECTURE.html` opens in browser showing full layered ecosystem
- [ ] Clicking any component card opens detail panel
- [ ] Detail panel shows actual source code (fetched or inlined)
- [ ] Cost comparison bar shows real numbers from §8
- [ ] Search highlights matching components
- [ ] Canvas particle background animates
- [ ] No external JS dependencies (Google Fonts OK)
- [ ] File links are real paths relative to repo root
