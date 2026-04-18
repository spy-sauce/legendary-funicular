// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: cost-tracker
//
// Intercepts SDK result messages after each leaf completes, reconciles token
// usage into a USD estimate, and emits a cost_recorded event through the
// telemetry-emitter's shared sink. Silently no-ops if telemetry-emitter is
// not installed.
//
// Contract dependencies:
//   NUTRIENTS.md §1  — event schema (cost_recorded payload)
//   NUTRIENTS.md §8  — cost table (USD per Mtok)

import type { Upgrade, UpgradeCtx, LeafLike, LeafResultLike } from "../lib/upgrades/types.js";
import { reconcileUsage, type SDKUsage } from "../lib/telemetry/cost-reconcile.js";

// ── Upgrade manifest ──────────────────────────────────────────────────────────

const costTracker: Upgrade = {
  manifest: {
    name: "cost-tracker",
    category: "runtime",
    description: "Per-leaf token-cost attribution via telemetry-emitter sink",
  },

  // ── afterLeaf: extract SDK usage, emit cost_recorded ─────────────────────
  async afterLeaf(ctx: UpgradeCtx, leaf: LeafLike, result: LeafResultLike): Promise<void> {
    // Soft dependency: do nothing if telemetry-emitter isn't installed
    const tel = (ctx as any).telemetry;
    if (!tel?.emit) return;

    // Extract usage from the SDK result. The Claude SDK attaches usage
    // metadata to the final result message in different shapes depending on
    // version — we check several possible locations.
    const usage = extractUsage(result);
    if (!usage) return;

    // Determine model from result or fall back to framework default
    const model = extractModel(result) ?? "claude-sonnet-4-6";

    const reconciled = reconcileUsage(usage, model);

    // Only emit if there's actual token data (avoids noise from dry-runs)
    const hasTokens = reconciled.input_tokens > 0 || reconciled.output_tokens > 0;
    if (!hasTokens) return;

    const biome = leaf.biome ?? "unknown";

    tel.emit("cost_recorded", {
      leaf_id: leaf.id,
      biome,
      model,
      input_tokens: reconciled.input_tokens,
      output_tokens: reconciled.output_tokens,
      cache_read_tokens: reconciled.cache_read_tokens,
      cache_write_tokens: reconciled.cache_write_tokens,
      usd_estimate: reconciled.usd_estimate,
    });
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────

function extractUsage(result: LeafResultLike): SDKUsage | null {
  const r = result as any;

  // Try result.usage (Claude Agent SDK v0.x final result)
  if (r?.usage && typeof r.usage === "object") return r.usage as SDKUsage;

  // Try result.message?.usage (message-level usage)
  if (r?.message?.usage) return r.message.usage as SDKUsage;

  // Try result.sdkResult?.usage
  if (r?.sdkResult?.usage) return r.sdkResult.usage as SDKUsage;

  // Try result.rawResult?.usage
  if (r?.rawResult?.usage) return r.rawResult.usage as SDKUsage;

  // No usage found — not an error, just no telemetry to emit
  return null;
}

function extractModel(result: LeafResultLike): string | null {
  const r = result as any;
  return (
    r?.model ??
    r?.message?.model ??
    r?.sdkResult?.model ??
    null
  );
}

export default costTracker;
