# Mycelium Upgrades

**Opt-in, generic, installable capabilities for your organism.**

Upgrades are modular enhancements to the cultivation lifecycle — Cyberpunk-style chrome you slot into an organism by name. An organism declares which upgrades are active in its `mycelium.yaml`:

```yaml
organism:
  name: bloom
  cellular: true
  gating: contract-freeze
  upgrades:
    - hypha-validator        # pre-flight validation
    - depth-3-enforcement    # fail flat biomes at plan time
    - crash-recovery         # skip already-fruited leaves on re-run
```

Omit `upgrades:` and the framework behaves exactly as it did before — no upgrades activate. This is fully backwards-compatible.

## CLI

```bash
mycelium upgrades list                # show bundled + installed
mycelium upgrades info <name>         # details, hooks, conflicts
mycelium upgrades install <name>      # add to mycelium.yaml
mycelium upgrades remove <name>       # take it out
```

## Bundled upgrades

| Name | Category | What it does |
|------|----------|-------------|
| `hypha-validator` | validation | Pre-flight: every biome id must map to an existing `hyphae/HYPHA-<BIOME>-AGENT.md` |
| `depth-3-enforcement` | validation | Fail cultivation if any biome has no `sub_agents` (flat biome) |
| `crash-recovery` | runtime | Persist fruited-leaf state; skip already-fruited leaves on re-run |
| `cache-headers` | convention | Extract `## CACHE HEADER` blocks from hypha files and inject at top of leaf prompts |
| `routing-map` | convention | JIT cache routing via `organism.routing: biome → [adjacent biomes]`; composes with `cache-headers` |

More coming — substrate plugins (`substrate-api`, `substrate-max`), convention packs (`commit-convention`, `canonical-depth3`).

## Authoring a custom upgrade

Upgrades are TypeScript modules that default-export an `Upgrade` object. The shape:

```ts
import type { Upgrade } from "@vibespace/mycelium-cli/lib/upgrades/types.js";

const upgrade: Upgrade = {
  manifest: {
    name: "my-upgrade",
    description: "short description",
    category: "validation",   // runtime | validation | convention | template
    conflicts: [],            // other upgrades that can't coexist
  },
  async beforePlan(ctx) {
    // Fires after leaves are flattened. Return { abort: true, reason } to cancel.
    // Return { warnings: [...] } for non-fatal advisories.
  },
  async beforeSpawn(ctx, leaf) {
    // Fires before each leaf's SDK session. Return { skip: true, skipReason } to bypass.
  },
  async transformPrompt(ctx, leaf, prompt) {
    // Modifies the prompt sent to the SDK session. Chained across upgrades in install order.
    return prompt;
  },
  async afterLeaf(ctx, leaf, result) {
    // Fires after fruit or fail. Good place to record state.
  },
  async onCrash(ctx, err) {
    // Fires if cultivate catches an outer error. Best-effort — don't throw.
  },
};

export default upgrade;
```

All four hooks are optional. Bundled upgrades live in `cli/src/upgrades/` and are loaded via `cli/src/upgrades/registry.ts`.

## Design principles

- **Generic** — upgrades never know about a specific organism (Bloom, Bardot, etc.)
- **Opt-in** — nothing activates unless listed in `organism.upgrades`
- **Decoupled** — framework core doesn't depend on any specific upgrade
- **Small scope** — each upgrade does one thing; compose by installing multiple
- **Safe defaults** — failure in a non-critical hook (afterLeaf, onCrash) logs and continues; the organism ships

See `DEVELOPER_GUIDE.md` for the full hook lifecycle reference.
