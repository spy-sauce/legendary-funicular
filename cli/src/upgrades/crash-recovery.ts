// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: crash-recovery
//
// Idempotent leaf tracking. Persists a record of fruited leaves to
// .mycelium/fruited.json at the organism root. On re-run, leaves already
// recorded are skipped before the SDK session is spawned, preventing
// duplicate work after crashes / rate-limit interruptions.

import fs from "node:fs";
import path from "node:path";
import type {
  Upgrade,
  UpgradeCtx,
} from "../lib/upgrades/types.js";

const STATE_DIR = ".mycelium";
const STATE_FILE = "fruited.json";

interface FruitedState {
  leaves: Record<
    string,
    { fruitedAt: string; branch?: string; commit?: string }
  >;
}

function statePath(ctx: UpgradeCtx): string {
  return path.join(ctx.targetDir, STATE_DIR, STATE_FILE);
}

function loadState(ctx: UpgradeCtx): FruitedState {
  const p = statePath(ctx);
  if (!fs.existsSync(p)) return { leaves: {} };
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { leaves: {} };
  }
}

function saveState(ctx: UpgradeCtx, state: FruitedState): void {
  const dir = path.join(ctx.targetDir, STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(ctx), JSON.stringify(state, null, 2));
}

let memo: FruitedState | null = null;

const upgrade: Upgrade = {
  manifest: {
    name: "crash-recovery",
    description:
      "Skip already-fruited leaves on re-run. Persists state to .mycelium/fruited.json.",
    category: "runtime",
  },
  async beforePlan(ctx) {
    memo = loadState(ctx);
    const already = ctx.leaves.filter((l) => memo!.leaves[l.id]);
    if (already.length > 0) {
      return {
        warnings: [
          `${already.length} leaf/leaves already fruited in a previous run — will skip on spawn. Delete .mycelium/fruited.json to force a full re-run.`,
        ],
      };
    }
  },
  async beforeSpawn(_ctx, leaf) {
    if (!memo) return;
    const rec = memo.leaves[leaf.id];
    if (rec) {
      return {
        skip: true,
        skipReason: `already fruited at ${rec.fruitedAt}`,
      };
    }
  },
  async afterLeaf(ctx, leaf, result) {
    if (!memo) memo = loadState(ctx);
    if (result.success) {
      memo.leaves[leaf.id] = {
        fruitedAt: new Date().toISOString(),
        branch: leaf.branch,
      };
      saveState(ctx, memo);
    }
  },
  async onCrash(ctx) {
    if (memo) saveState(ctx, memo);
  },
};

export default upgrade;
