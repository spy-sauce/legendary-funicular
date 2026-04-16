// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: routing-map
//
// JIT cache routing. Reads `organism.routing` from mycelium.yaml — a map of
// biome id → list of adjacent biome ids whose cache headers should preload
// alongside the leaf's own. Attaches the expanded preload set to each leaf
// via a hidden `_preloadBiomes` field, which `cache-headers` then reads
// during prompt transform.
//
// Composition: routing-map is strictly additive. If `cache-headers` is not
// installed, this upgrade still attaches the preload set but nothing consumes
// it. If installed without routing-map, cache-headers falls back to the
// leaf's own biome only.
//
// Config shape:
//
//   organism:
//     routing:
//       auth-agent:   [identity-agent, data-agent]
//       api-agent:    [auth-agent, data-agent]
//
// Wildcard form (applies to any leaf whose biome is not otherwise listed):
//
//     routing:
//       "*": [data-agent]

import chalk from "chalk";
import type { Upgrade, LeafLike } from "../lib/upgrades/types.js";

const upgrade: Upgrade = {
  manifest: {
    name: "routing-map",
    description:
      "JIT cache routing. `organism.routing: biome → [adjacent biomes]` expands each leaf's preload set for cache-headers to inject.",
    category: "convention",
  },
  async beforePlan(ctx) {
    const routing = (ctx.organism?.routing ?? {}) as Record<string, string[]>;
    const hasCacheHeaders = (ctx.organism?.upgrades ?? []).includes(
      "cache-headers"
    );
    const warnings: string[] = [];

    if (Object.keys(routing).length === 0) {
      warnings.push(
        "routing-map installed but `organism.routing` is empty — nothing to route."
      );
    }

    if (!hasCacheHeaders) {
      warnings.push(
        "routing-map produces preload sets consumed by `cache-headers`, which is not installed. Install cache-headers for the routing to take effect."
      );
    }

    const wildcard = routing["*"] ?? [];
    let attached = 0;

    for (const leaf of ctx.leaves) {
      const direct = routing[leaf.biome];
      const adjacents = Array.isArray(direct) ? direct : wildcard;
      if (!adjacents || adjacents.length === 0) continue;
      (leaf as any)._preloadBiomes = [...new Set(adjacents)];
      attached++;
    }

    if (attached > 0) {
      console.log(
        chalk.gray("  ") +
          chalk.cyan(`routing-map: `) +
          chalk.gray(`attached preload sets to ${attached}/${ctx.leaves.length} leaf/leaves`)
      );
    }

    if (warnings.length > 0) {
      return { warnings };
    }
  },
};

export default upgrade;
