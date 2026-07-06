# NUTRIENTS — eval-lane-a-mini

> Mycelium Framework — VibeSpace LLC — The network provides.
> Eval fixture — frozen stub. Do not extend.

## 1. File list — FROZEN

| Biome | Artifact | Purpose |
|---|---|---|
| code-agent | `src/greet.js` | Exports `greet(name)` |
| code-agent | `src/index.js` | Re-exports `greet` and, when run directly, prints `greet("world")` |
| docs-agent | `README.md` | What the library is, one usage example |
| docs-agent | `USAGE.md` | The `greet(name)` call, arguments, return value |

No other artifacts are part of this cultivation.

## 2. greet contract — FROZEN

```js
greet(name) // → "Hello, <name> — the network provides."
```

- `name` is interpolated verbatim.
- The return string is exact — punctuation, em dash, and trailing period
  included. Example: `greet("Sean")` → `"Hello, Sean — the network provides."`
- Plain CommonJS or ESM JavaScript. No dependencies, no TypeScript.

Docs must quote this exact return-string shape; code must implement it.
