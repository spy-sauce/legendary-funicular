# CLAUDE.md — arch-brief Organism

## What This Is

An interactive single-file HTML architecture diagram (`ARCHITECTURE.html`) that visualizes the Legendary Funicular / Mycelium DDP ecosystem. The diagram IS the documentation — every component card links to real source files, clicking opens a panel showing actual code, and a cost visualization section demonstrates why parallel agent execution beats sequential. Built with no external JS dependencies, dark-mode aesthetic, canvas particle background, and animated flow connectors.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS (single-file output)
- **Data**: JSON (inlined or fetched)
- **Styling**: CSS custom properties, Google Fonts (Space Mono + Syne)
- **Animation**: CSS transitions + Canvas API

## Stream Tag Convention

Commit messages and branch names use the format:

```
MF/{DOMAIN}: description
```

Where `{DOMAIN}` matches the agent id in UPPER_SNAKE_CASE.

Examples:
- `MF/LAYOUT_AGENT: add particle canvas background`
- `MF/COMPONENT_AGENT: extract exports from cultivate.ts`
- `MF/WIRING_AGENT: inline arch-data.json into final HTML`

## Active HYPHA

See `hyphae/HYPHA-{DOMAIN}.md` for each agent's detailed specification.

## Contracts

All shared interfaces, design tokens, and API contracts are frozen in:

```
NUTRIENTS.md
```

Agents consume contracts, not upstream code. Integration happens at merge time.

## Rules

1. **No build step** — output must work by opening `ARCHITECTURE.html` directly in a browser
2. **No external JS** — Google Fonts CDN is allowed, nothing else
3. **Real data only** — read actual source files, use actual cost numbers from NUTRIENTS.md §8
4. **Single-file output** — `ARCHITECTURE.html` at repo root, `arch-data.json` may be inlined
5. **Match aesthetic** — dark palette, Space Mono + Syne fonts, per `templates/scale.html`
6. **Relative paths** — all file links must be real paths relative to repo root
7. **Contract-first** — consume NUTRIENTS.md contracts, not upstream agent code
8. **Branch isolation** — each agent works on `feat/{agent-id}`, merges in declared order
