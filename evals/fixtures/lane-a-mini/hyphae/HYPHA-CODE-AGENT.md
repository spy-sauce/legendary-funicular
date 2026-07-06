# HYPHA — code-agent (eval-lane-a-mini)

> Mycelium Framework — VibeSpace LLC — The network provides.
> Eval fixture biome. Small on purpose.

## Scope

The greet micro-library. Exactly two files:

1. `src/greet.js` — exports `greet(name)` returning the exact frozen string
   from NUTRIENTS.md §2: `"Hello, <name> — the network provides."`
2. `src/index.js` — re-exports `greet` from `./greet.js`; when executed
   directly (`node src/index.js`) it prints `greet("world")`.

## Rules

- Plain JavaScript, zero dependencies. No package.json needed.
- Do not write documentation — `README.md` / `USAGE.md` belong to docs-agent.
- The return string is a frozen contract: punctuation, em dash, and trailing
  period are load-bearing.

## KPI gates

- Both files exist under `src/`.
- `node src/index.js` prints `Hello, world — the network provides.`
