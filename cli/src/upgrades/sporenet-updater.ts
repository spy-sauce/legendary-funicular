// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: sporenet-updater
//
// Writes live leaf status to sporenet/state.json during cultivate so the
// dash-dashboard.html can poll and reflect real-time progress.
//
// Hooks:
//   beforeSpawn  — mark leaf as "active" when its session starts
//   afterLeaf    — mark leaf as "done" or "failed" when it completes

import fs from "node:fs";
import path from "node:path";
import type {
  Upgrade,
  UpgradeCtx,
  LeafLike,
  LeafResultLike,
} from "../lib/upgrades/types.js";

const STATE_FILE = "sporenet/state.json";

interface SporeLeaf {
  id: string;
  agent: string;
  tag: string;
  scope: string;
  status: "pending" | "active" | "done" | "failed";
  commit?: string;
  started_at?: string;
  completed_at?: string;
}

interface SporeState {
  session_id: string;
  organism: string;
  started_at: string;
  ship_target?: string;
  gating?: string;
  total: number;
  leaves: SporeLeaf[];
}

function readState(targetDir: string): SporeState | null {
  const fp = path.join(targetDir, STATE_FILE);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8")) as SporeState;
  } catch {
    return null;
  }
}

function writeState(targetDir: string, state: SporeState): void {
  const fp = path.join(targetDir, STATE_FILE);
  try {
    fs.writeFileSync(fp, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // best-effort — never throw from an upgrade hook
  }
}

function patchLeaf(
  state: SporeState,
  leafId: string,
  agentId: string,
  updates: Partial<SporeLeaf>
): void {
  const existing = state.leaves.find((l) => l.id === leafId);
  if (existing) {
    Object.assign(existing, updates);
  } else {
    // leaf not in state yet (sporenet init was skipped) — add it
    state.leaves.push({
      id: leafId,
      agent: agentId,
      tag: agentId.toUpperCase(),
      scope: "",
      status: "pending",
      ...updates,
    });
    state.total = state.leaves.length;
  }
}

const sporenetUpdater: Upgrade = {
  manifest: {
    name: "sporenet-updater",
    description:
      "Writes live leaf status to sporenet/state.json so the DDP dashboard reflects real-time cultivate progress.",
    category: "runtime",
  },

  async beforeSpawn(ctx: UpgradeCtx, leaf: LeafLike): Promise<void> {
    const state = readState(ctx.targetDir);
    if (!state) return;
    patchLeaf(state, leaf.id, leaf.biome, {
      status: "active",
      started_at: new Date().toISOString(),
    });
    writeState(ctx.targetDir, state);
  },

  async afterLeaf(
    ctx: UpgradeCtx,
    leaf: LeafLike,
    result: LeafResultLike
  ): Promise<void> {
    const state = readState(ctx.targetDir);
    if (!state) return;
    patchLeaf(state, leaf.id, leaf.biome, {
      status: result.success ? "done" : "failed",
      completed_at: new Date().toISOString(),
    });
    writeState(ctx.targetDir, state);
  },
};

export default sporenetUpdater;
