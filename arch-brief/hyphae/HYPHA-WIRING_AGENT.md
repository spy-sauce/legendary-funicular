# HYPHA-WIRING_AGENT

## Goal

Wire all components together into the final `ARCHITECTURE.html` file — integrate the layout shell, component cards, panel system, cost visualization, and search/filter. Validate all file links and produce a working single-file output.

## Scope

### In Scope
- Assembling outputs from all upstream agents into single HTML file
- Inlining `arch-data.json` as JavaScript variable
- Creating component cards from arch-data
- Connecting cards to panel system (data-file attributes)
- Integrating search/filter functionality
- Validating all component file paths
- Final HTML output at repo root

### Out of Scope
- Building individual components from scratch (consume upstream outputs)
- Modifying source files
- Creating new visual designs

## Inputs

### Contracts
- `NUTRIENTS.md §1` — Data interfaces
- `NUTRIENTS.md §9` — Search specification
- `NUTRIENTS.md §10` — Acceptance checklist

### Upstream Agents
- `component-agent` → `arch-data.json`
- `layout-agent` → layout shell, styles, particle script
- `panel-agent` → panel component, styles, script
- `cost-agent` → cost visualization, styles, script

## Outputs

### Deliverables
- `ARCHITECTURE.html` — Final single-file output at repo root

### Contract Fulfillment
- All items in §10 acceptance checklist pass
- Search behavior matches §9 specification

## Acceptance Criteria

- [ ] `ARCHITECTURE.html` exists at repo root
- [ ] Opens in browser showing full layered ecosystem
- [ ] All component cards render with correct data
- [ ] Each card has `data-file` attribute with valid relative path
- [ ] Clicking any card opens the detail panel
- [ ] Panel shows actual source code for that file
- [ ] Cost comparison section visible at top
- [ ] Search input filters components by title/desc/exports/layer
- [ ] Search highlights matching components
- [ ] Non-matching components dim to 0.3 opacity
- [ ] Search clears on Escape
- [ ] Canvas particle background animates
- [ ] No external JS dependencies (Google Fonts OK)
- [ ] All styles and scripts inlined in single file
- [ ] `arch-data.json` inlined as JS variable (no external fetch needed)

## Notes

- Merge order: component-agent, layout-agent, panel-agent, cost-agent, then wiring-agent
- Source files can be inlined or fetched — inlining preferred for offline use
- If inlining all sources, add them to a `SOURCES` JS object keyed by file path
- Search debounce: 150ms
- Test in Chrome, Firefox, Safari
- Validate HTML (basic — no need for W3C validation)
- File size target: < 500KB with inlined sources
