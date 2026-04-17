# HYPHA-COMPONENT_AGENT

## Goal

Read every source file listed in the file manifest, extract metadata (file path, description, exports), and produce `arch-data.json` with the complete component map conforming to the `ArchData` interface.

## Scope

### In Scope
- Reading TypeScript source files from `cli/src/`
- Extracting top-line comment descriptions
- Parsing exported function/class names
- Assigning components to layers based on file path
- Generating `arch-data.json` with all component entries
- Creating stub entries for missing files

### Out of Scope
- Visual rendering of components
- Source code display/formatting
- Any UI/HTML work
- Modifying source files

## Inputs

### Contracts
- `NUTRIENTS.md §1` — `ComponentEntry`, `ArchData`, `LayerMeta` interfaces
- `NUTRIENTS.md §4` — Layer definitions (cli-commands, upgrades, telemetry, fleet)
- `NUTRIENTS.md §5` — File manifest (list of 16 source files)

### Upstream Agents
- None (this agent has no dependencies)

## Outputs

### Deliverables
- `arch-data.json` — Complete component map conforming to `ArchData` interface

### Contract Fulfillment
- Each entry must include: `id`, `file`, `title`, `desc`, `exports[]`, `color`, `layer`
- `generatedAt` timestamp in ISO format
- `layers` array with metadata for all four layers

## Acceptance Criteria

- [ ] All 16 files from the manifest are processed
- [ ] Missing files produce stub entries with `desc: "Stub — file not found"`
- [ ] Each component has a unique kebab-case `id`
- [ ] `exports[]` contains actual exported symbols (or empty array for stubs)
- [ ] `layer` assignment matches file path (commands → cli-commands, upgrades → upgrades, etc.)
- [ ] `color` matches layer accent color from NUTRIENTS.md §2
- [ ] JSON is valid and parseable
- [ ] `generatedAt` is a valid ISO timestamp

## Notes

- Use regex or AST parsing to extract exports (regex is acceptable for this scope)
- Top-line description = first line comment or JSDoc summary
- Title derivation: `cultivate.ts` → `Cultivate`, `ddp-stages.ts` → `DDP Stages`
- Color mapping:
  - cli-commands: `var(--accent-cli)` / `#7c3aed`
  - upgrades: `var(--accent-upgrades)` / `#2563eb`
  - telemetry: `var(--accent-telemetry)` / `#059669`
  - fleet: `var(--accent-fleet)` / `#d97706`
