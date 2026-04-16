// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: cache-headers
//
// Extracts `## CACHE HEADER` blocks from a leaf's biome hypha file (and any
// additional hyphae flagged by routing-map) and injects them at the top of
// the leaf's prompt. Moves the ~50-token scope/primitives/rules summary into
// the model's highest-attention region before the full required-reading list.
//
// Works independently: with no routing-map installed, it still injects the
// leaf's own biome hypha header.
//
// Uses in-memory cache `_preloadBiomes` on the leaf (set by routing-map) to
// determine the full biome list per leaf. Falls back to the leaf's own biome
// if unset.

import fs from "node:fs";
import path from "node:path";
import type { Upgrade, LeafLike } from "../lib/upgrades/types.js";

const HEADER_HEADING = "## CACHE HEADER";

function extractCacheHeader(markdown: string): string | null {
  const lines = markdown.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(HEADER_HEADING)) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function hyphaPath(targetDir: string, biomeId: string): string {
  const filename = `HYPHA-${biomeId
    .replace(/-agent$/, "")
    .toUpperCase()}-AGENT.md`;
  return path.join(targetDir, "hyphae", filename);
}

function biomesForLeaf(leaf: LeafLike): string[] {
  const extra = (leaf as any)._preloadBiomes as string[] | undefined;
  if (Array.isArray(extra) && extra.length > 0) {
    const set = new Set<string>([leaf.biome, ...extra]);
    return [...set];
  }
  return [leaf.biome];
}

const upgrade: Upgrade = {
  manifest: {
    name: "cache-headers",
    description:
      "Inject `## CACHE HEADER` blocks from biome hypha files at the top of each leaf's prompt. ~50-token preload in highest-attention region.",
    category: "convention",
  },
  async transformPrompt(ctx, leaf, prompt) {
    const biomes = biomesForLeaf(leaf);
    const headers: { biome: string; body: string }[] = [];

    for (const biome of biomes) {
      const p = hyphaPath(ctx.targetDir, biome);
      if (!fs.existsSync(p)) continue;
      const md = fs.readFileSync(p, "utf-8");
      const body = extractCacheHeader(md);
      if (body) headers.push({ biome, body });
    }

    if (headers.length === 0) return prompt;

    const preamble: string[] = [
      "=".repeat(60),
      "🔧 CACHE PRELOAD (injected by cache-headers upgrade)",
      "=".repeat(60),
      "",
    ];
    for (const h of headers) {
      preamble.push(`── ${h.biome} ──`);
      preamble.push(h.body);
      preamble.push("");
    }
    preamble.push("=".repeat(60));
    preamble.push("");

    return preamble.join("\n") + prompt;
  },
};

export default upgrade;
