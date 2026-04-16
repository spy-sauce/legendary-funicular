// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: depth-3-enforcement
//
// Fails cultivation if any biome is flat (has no sub_agents). Enforces the
// depth-3 decomposition rule that distinguishes cellular execution from
// monolithic agents. Warns on shallow biomes (fewer than two specialists).

import type { Upgrade } from "../lib/upgrades/types.js";

const upgrade: Upgrade = {
  manifest: {
    name: "depth-3-enforcement",
    description:
      "Fail cultivation if any biome lacks sub_agents. Depth-3 is not a suggestion — flat agents collapse the cellular model.",
    category: "validation",
  },
  async beforePlan(ctx) {
    const flat: string[] = [];
    const shallow: string[] = [];

    for (const biome of ctx.agents) {
      const subs: any[] = biome.sub_agents ?? [];
      if (subs.length === 0) {
        flat.push(biome.id);
        continue;
      }
      if (subs.length < 2) {
        shallow.push(biome.id);
      }
    }

    if (flat.length > 0) {
      return {
        abort: true,
        reason:
          `flat biome(s) detected — depth-3 enforcement requires sub_agents decomposition:\n    - ` +
          flat.join("\n    - "),
      };
    }
    if (shallow.length > 0) {
      return {
        warnings: shallow.map(
          (id) =>
            `biome "${id}" has <2 specialists — consider deepening for cellular execution.`
        ),
      };
    }
  },
};

export default upgrade;
