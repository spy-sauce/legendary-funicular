// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: hypha-validator
//
// Pre-flight validator — verifies every biome id in the organism yaml resolves
// to an existing HYPHA-<BIOME>-AGENT.md file under ./hyphae/. Fails fast on
// typos so leaves don't spawn with broken prompt references.

import fs from "node:fs";
import path from "node:path";
import type { Upgrade } from "../lib/upgrades/types.js";

const upgrade: Upgrade = {
  manifest: {
    name: "hypha-validator",
    description:
      "Pre-flight: every biome id must map to an existing hyphae/HYPHA-<BIOME>-AGENT.md file.",
    category: "validation",
  },
  async beforePlan(ctx) {
    const hyphaeDir = path.join(ctx.targetDir, "hyphae");
    const biomes = new Set(ctx.leaves.map((l) => l.biome));
    const missing: string[] = [];

    for (const biome of biomes) {
      const filename = `HYPHA-${biome
        .replace(/-agent$/, "")
        .toUpperCase()}-AGENT.md`;
      const full = path.join(hyphaeDir, filename);
      if (!fs.existsSync(full)) {
        missing.push(`${biome} → hyphae/${filename}`);
      }
    }

    if (missing.length > 0) {
      return {
        abort: true,
        reason:
          `missing HYPHA file(s) for ${missing.length} biome(s):\n    - ` +
          missing.join("\n    - "),
      };
    }
  },
};

export default upgrade;
