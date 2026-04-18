// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: alerting
//
// Alert upgrade with Slack + GitHub issue sinks. Hooks into the Upgrade
// lifecycle to evaluate trigger policy and fan out to configured sinks
// when crashes or leaf failures occur.
//
// Rules:
// - Never throw from a hook
// - Sinks are env-gated and feature-detected
// - Trigger policy is configurable via organism.alerting
//
// Frozen contract dependencies:
// - NUTRIENTS.md §1 (event schema — alert payload)
// - NUTRIENTS.md §7 (AlertPayload shape)

import type {
  Upgrade,
  UpgradeCtx,
  LeafLike,
  LeafResultLike,
} from "../lib/upgrades/types.js";
import {
  type AlertPayload,
  type AlertPolicy,
  evaluateCrashTrigger,
  evaluateLeafFailureTrigger,
} from "../lib/telemetry/alert-triggers.js";
import { buildAlert, type AlertData } from "../lib/telemetry/events.js";

// ────────────────────────────────────────────────────────────────────────────
// Run context — attached during beforePlan for use in later hooks
// ────────────────────────────────────────────────────────────────────────────

interface AlertingContext {
  organism: string;
  run_id: string;
  policy: AlertPolicy;
  event_log_url?: string;
}

let alertingCtx: AlertingContext | null = null;

// ────────────────────────────────────────────────────────────────────────────
// Sink imports — dynamic to avoid hard dependency on sibling leaves
// ────────────────────────────────────────────────────────────────────────────

type SinkFn = (payload: AlertPayload) => Promise<void>;

/**
 * Dynamically load sink functions. Returns empty array if sinks not available.
 * Sinks are implemented by sibling leaves (alerting.sinks.slack, alerting.sinks.github).
 * If those modules aren't built yet, we gracefully degrade.
 */
async function loadSinks(): Promise<SinkFn[]> {
  const sinks: SinkFn[] = [];

  // Try Slack sink
  try {
    const slackModule = await import("../lib/telemetry/sink-slack.js");
    if (typeof slackModule.postSlack === "function") {
      sinks.push(slackModule.postSlack);
    }
  } catch {
    // Sink not available yet — graceful degradation
  }

  // Try GitHub sink
  try {
    const ghModule = await import("../lib/telemetry/sink-github.js");
    if (typeof ghModule.postGitHubIssue === "function") {
      sinks.push(ghModule.postGitHubIssue);
    }
  } catch {
    // Sink not available yet — graceful degradation
  }

  return sinks;
}

// ────────────────────────────────────────────────────────────────────────────
// Telemetry emission — soft dependency on telemetry-emitter
// ────────────────────────────────────────────────────────────────────────────

type EmitFn = (kind: string, data: unknown) => void;

/**
 * Try to find an emit function on the context.
 * The telemetry-emitter upgrade attaches this when active.
 */
function getEmitFn(ctx: UpgradeCtx): EmitFn | undefined {
  // The telemetry-emitter upgrade attaches emit to ctx.config.__telemetry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const telemetry = (ctx.config as any)?.__telemetry;
  if (telemetry && typeof telemetry.emit === "function") {
    return telemetry.emit;
  }
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Alert dispatch — fire-and-forget to all sinks + telemetry
// ────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch an alert payload to all configured sinks and emit telemetry event.
 * Fire-and-forget — errors are logged but never thrown.
 */
async function dispatchAlert(
  ctx: UpgradeCtx,
  payload: AlertPayload
): Promise<void> {
  // 1. Emit telemetry event (if telemetry-emitter is active)
  try {
    const emit = getEmitFn(ctx);
    if (emit && alertingCtx) {
      const alertData: AlertData = {
        severity: payload.severity,
        source: payload.source,
        title: payload.title,
        detail: payload.detail,
        leaf_id: payload.leaf_id,
      };

      const event = buildAlert(
        {
          run_id: alertingCtx.run_id,
          organism: alertingCtx.organism,
        },
        alertData
      );

      emit("alert", event);
    }
  } catch (err) {
    // Never throw from alert dispatch
    console.error("[alerting] failed to emit telemetry event:", err);
  }

  // 2. Fire-and-forget to external sinks
  try {
    const sinks = await loadSinks();
    for (const sink of sinks) {
      // Fire-and-forget: don't await, just catch errors
      sink(payload).catch((err) => {
        console.error("[alerting] sink error:", err);
      });
    }
  } catch (err) {
    // Never throw from alert dispatch
    console.error("[alerting] failed to load sinks:", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Run ID generation — fallback if telemetry-emitter hasn't set one
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a run ID if one isn't already present.
 * Format: <organism>-<ISO8601-compact>-<4-char-hash>
 */
function generateRunId(organism: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const hash = Math.random().toString(36).substring(2, 6);
  return `${organism}-${ts}-${hash}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Upgrade implementation
// ────────────────────────────────────────────────────────────────────────────

const upgrade: Upgrade = {
  manifest: {
    name: "alerting",
    description:
      "Alert on crashes and leaf failures. Fires to Slack + GitHub issues based on trigger policy.",
    category: "runtime",
  },

  /**
   * beforePlan: Attach organism + run_id for use in later hooks.
   * Read policy from organism.alerting config.
   */
  async beforePlan(ctx) {
    try {
      const organism = ctx.organism?.name ?? "unknown";

      // Check if telemetry-emitter has already set a run_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingRunId = (ctx.config as any)?.__telemetry?.run_id;
      const run_id = existingRunId ?? generateRunId(organism);

      // Read alert policy from organism.alerting
      const policy: AlertPolicy = ctx.organism?.alerting ?? {};

      // Build event log URL if we have the run_id and know the log location
      let event_log_url: string | undefined;
      if (ctx.runLogDir) {
        event_log_url = `file://${ctx.runLogDir}/events.jsonl`;
      }

      alertingCtx = {
        organism,
        run_id,
        policy,
        event_log_url,
      };
    } catch (err) {
      // Never throw from hooks — log and continue
      console.error("[alerting] beforePlan error:", err);
      alertingCtx = {
        organism: "unknown",
        run_id: generateRunId("unknown"),
        policy: {},
      };
    }
  },

  /**
   * afterLeaf: If the leaf failed, evaluate leaf-failure trigger and dispatch alert.
   */
  async afterLeaf(ctx, leaf: LeafLike, result: LeafResultLike) {
    // Only process failures
    if (result.success) {
      return;
    }

    if (!alertingCtx) {
      // beforePlan wasn't called — shouldn't happen, but be defensive
      return;
    }

    try {
      // Build LeafFailedData from result
      const leafFailedData = {
        leaf_id: leaf.id,
        biome: leaf.biome,
        wall_ms: result.ms,
        error: result.error ?? "Unknown error",
      };

      // Evaluate trigger
      const payload = evaluateLeafFailureTrigger(
        alertingCtx.organism,
        alertingCtx.run_id,
        leafFailedData,
        alertingCtx.policy,
        alertingCtx.event_log_url
      );

      if (payload) {
        await dispatchAlert(ctx, payload);
      }
    } catch (err) {
      // Never throw from hooks
      console.error("[alerting] afterLeaf error:", err);
    }
  },

  /**
   * onCrash: Always fire critical alert for crashes.
   */
  async onCrash(ctx, err: unknown) {
    if (!alertingCtx) {
      // Try to set up minimal context
      alertingCtx = {
        organism: ctx.organism?.name ?? "unknown",
        run_id: generateRunId(ctx.organism?.name ?? "unknown"),
        policy: ctx.organism?.alerting ?? {},
      };
    }

    try {
      // Evaluate crash trigger
      const payload = evaluateCrashTrigger(
        alertingCtx.organism,
        alertingCtx.run_id,
        err,
        alertingCtx.policy,
        alertingCtx.event_log_url
      );

      if (payload) {
        await dispatchAlert(ctx, payload);
      }
    } catch (dispatchErr) {
      // Never throw from hooks — this is onCrash, we really can't throw here
      console.error("[alerting] onCrash dispatch error:", dispatchErr);
    }
  },
};

export default upgrade;
