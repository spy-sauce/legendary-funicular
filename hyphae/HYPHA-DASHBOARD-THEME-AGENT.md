# HYPHA — dashboard-theme

## CACHE HEADER
- **SCOPE:** Per-cultivation `theme.yaml` schema + loader + default theme — the molding surface every other dashboard biome reads.
- **PRIMITIVES:** `DashboardTheme` interface · `loadTheme(cwd)` · deep-merge over default · hex + modulator validation · `ThemeValidationError`.
- **RULES:** loader is synchronous (called per-render-request) · missing `theme.yaml` is NOT an error — fall back to default silently · hex strings must match `/^#[0-9A-Fa-f]{6}$/` · modulator numbers must lie in `[0, 2]` · never mutate the default theme on disk.
- **COUPLING:** every dashboard biome imports `DashboardTheme` from here. `dashboard-cli` calls `loadTheme` per request; `dashboard-canvas` + `dashboard-console` consume the resolved theme via `window.__DASHBOARD_THEME__`. Cache-network biomes do not depend on this.
- **LOAD WHEN:** any leaf defining or consuming `DashboardTheme`, touching `theme.yaml`, or asking what color a biome renders as.

## Scope
Implement `cli/src/lib/dashboard/theme.ts` and `templates/theme.default.yaml` — the canonical theme type, the loader with deep-merge + validation, and the shipped default that matches NUTRIENTS §1 exactly. First in dashboard merge order. No other dashboard biome can land before this freezes the theme shape.

## Deliverables by leaf

### `dashboard.theme.types`
- File: `cli/src/lib/dashboard/theme.ts`
- Exports: `DashboardTheme` interface exactly per NUTRIENTS §1 — `brand`, `palette` (closed key union `ink|ink_2|ice|ice_2|cryo|rule`), `lifecycle` (closed key union `germ|grow|flow|fruit|dorm`), `severity` (closed key union `warn|alert|crit`), `identity` (open `Record<string,string>` — biome_id → hex), `modulator` (five named numeric fields).
- Also export `ThemeValidationError extends Error` with a `field` string property carrying the offending dotted path (e.g., `"palette.cryo"`, `"modulator.active_pulse_hz"`).
- Also export `DEFAULT_THEME_PATH: string` — resolved absolute path to `templates/theme.default.yaml` via `path.resolve(__dirname, "../../../../templates/theme.default.yaml")` (verify against built `cli/dist/` layout — adjust segment count if the built file lands at a different depth).
- Pure types + a single Error subclass. No I/O.

### `dashboard.theme.loader`
- File: `cli/src/lib/dashboard/theme.ts` (same file — appended below the type exports)
- `loadTheme(cwd: string): DashboardTheme` — synchronous. Steps:
  1. `yaml.parse(fs.readFileSync(DEFAULT_THEME_PATH, "utf8"))` to seed the base.
  2. If `<cwd>/theme.yaml` exists, `yaml.parse` it and deep-merge over the base — overlay values win, overlay missing keys keep base, `identity` map merges per-key (overlay biome_id overrides default; default biome_ids absent from overlay survive).
  3. Validate the merged result: every key in `palette` / `lifecycle` / `severity` present; every hex value matches `/^#[0-9A-Fa-f]{6}$/`; every value in `identity` matches the same hex regex; every `modulator.*` field is a finite number in `[0, 2]`; `brand.title`, `brand.tagline`, `brand.logo_char` are non-empty strings.
  4. On failure throw `ThemeValidationError` with `field` set to the first offending dotted path.
- Missing `<cwd>/theme.yaml` is NOT an error — return the parsed-and-validated default. Missing default file IS an error (framework bug — throw).
- Uses existing `yaml` npm package (already a transitive dep — verify with `grep '"yaml"' cli/package.json`; if absent at top-level, add to `dependencies` and note in FRUIT_READY).
- Deep-merge helper inlined — do NOT add `lodash.merge` or similar. ~20 lines of recursive plain-object merge is sufficient (arrays replace, plain objects recurse, scalars overwrite).

### `dashboard.theme.default`
- File: `templates/theme.default.yaml`
- Contents are the example YAML block in NUTRIENTS §1 verbatim — same `brand`, `palette`, `lifecycle`, `severity`, `identity` (all 10 biome_ids: `dashboard-canvas`, `dashboard-console`, `dashboard-theme`, `dashboard-data`, `dashboard-cli`, `dashboard-docs`, `cache-network-store`, `cache-network-integration`, `cache-network-micros`, `cache-network-docs`), `modulator` keys and values.
- Must parse via `yaml.parse()` and validate clean through `loadTheme(<tmpdir>)` (where `<tmpdir>` has no `theme.yaml`, exercising the default-only path).
- Comments preserved from the NUTRIENTS example (e.g., `# biome_id → stable hue. lifecycle state modulates brightness, not hue.` and `# slow-pulse discipline; max 1.5`).

## Contract dependencies
- NUTRIENTS.md §1 (theme schema) — frozen at contract-freeze.

## Acceptance criteria
- `npx tsc --noEmit` clean from `cli/` root.
- `loadTheme(cwd)` returns a valid `DashboardTheme` when `<cwd>/theme.yaml` is present and well-formed.
- `loadTheme(cwd)` returns the default theme without throwing when `<cwd>/theme.yaml` is missing.
- `loadTheme(cwd)` throws `ThemeValidationError` when any palette / lifecycle / severity / identity value is not a 6-digit hex (e.g., `"red"`, `"#fff"`, `"#GGGGGG"`).
- `loadTheme(cwd)` throws `ThemeValidationError` when any `modulator.*` value falls outside `[0, 2]` (e.g., `-0.1`, `2.5`, `NaN`).
- `templates/theme.default.yaml` parses via `yaml.parse()` and loads via `loadTheme` against an empty cwd without errors.
- Deep-merge preserves default `identity` biome_ids when overlay `identity` only redefines a subset.

## Out of scope
- Rendering the theme into HTML — `dashboard-cli` (HTTP wiring) + `dashboard-canvas` / `dashboard-console` (consumers of `window.__DASHBOARD_THEME__`).
- Reading sporenet `state.json` or building `DashboardState` — `dashboard-data`.
- Operator-facing theming documentation (`docs/dashboard-theming.md`) — `dashboard-docs`.
- Writing `theme.yaml` into a cultivation cwd from `mycelium dashboard init` — `dashboard-cli` (it copies `DEFAULT_THEME_PATH`).

## Merge instructions
First in dashboard merge order. `dashboard-cli`, `dashboard-canvas`, and `dashboard-console` all depend on the `DashboardTheme` type exported from this biome. No changes to existing framework code outside `cli/src/lib/dashboard/` + `templates/`.
