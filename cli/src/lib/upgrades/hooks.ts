// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Hook dispatch for installed upgrades. cultivate.ts calls these at the
// relevant lifecycle points; each function fans out across every active
// upgrade in the order they were declared in mycelium.yaml.

import chalk from "chalk";
import type {
  Upgrade,
  UpgradeCtx,
  LeafLike,
  LeafResultLike,
  SpawnDecision,
} from "./types.js";

export interface PlanOutcome {
  abort: boolean;
  reasons: string[];
  warnings: string[];
}

export async function runBeforePlan(
  upgrades: Upgrade[],
  ctx: UpgradeCtx
): Promise<PlanOutcome> {
  const outcome: PlanOutcome = { abort: false, reasons: [], warnings: [] };
  for (const u of upgrades) {
    if (!u.beforePlan) continue;
    const d = (await u.beforePlan(ctx)) ?? {};
    if (d.abort) {
      outcome.abort = true;
      if (d.reason) outcome.reasons.push(`[${u.manifest.name}] ${d.reason}`);
    }
    for (const w of d.warnings ?? []) {
      outcome.warnings.push(`[${u.manifest.name}] ${w}`);
    }
  }
  return outcome;
}

export async function runBeforeSpawn(
  upgrades: Upgrade[],
  ctx: UpgradeCtx,
  leaf: LeafLike
): Promise<SpawnDecision> {
  for (const u of upgrades) {
    if (!u.beforeSpawn) continue;
    const d = (await u.beforeSpawn(ctx, leaf)) ?? {};
    if (d.skip) return d;
  }
  return {};
}

export async function runTransformPrompt(
  upgrades: Upgrade[],
  ctx: UpgradeCtx,
  leaf: LeafLike,
  prompt: string
): Promise<string> {
  let out = prompt;
  for (const u of upgrades) {
    if (!u.transformPrompt) continue;
    try {
      out = await u.transformPrompt(ctx, leaf, out);
    } catch (err: any) {
      console.log(
        chalk.yellow(
          `    ⚠ upgrade[${u.manifest.name}] transformPrompt error: ${err?.message ?? err}`
        )
      );
    }
  }
  return out;
}

export async function runAfterLeaf(
  upgrades: Upgrade[],
  ctx: UpgradeCtx,
  leaf: LeafLike,
  result: LeafResultLike
): Promise<void> {
  for (const u of upgrades) {
    if (!u.afterLeaf) continue;
    try {
      await u.afterLeaf(ctx, leaf, result);
    } catch (err: any) {
      console.log(
        chalk.yellow(
          `    ⚠ upgrade[${u.manifest.name}] afterLeaf error: ${err?.message ?? err}`
        )
      );
    }
  }
}

export async function runOnCrash(
  upgrades: Upgrade[],
  ctx: UpgradeCtx,
  err: unknown
): Promise<void> {
  for (const u of upgrades) {
    if (!u.onCrash) continue;
    try {
      await u.onCrash(ctx, err);
    } catch {
      // best-effort only — we're already crashing
    }
  }
}
