// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Alert trigger policy evaluator.
//
// Decides when to fire alerts based on organism.alerting configuration and
// runtime events. Never throws — defensive evaluation with null returns for
// non-firing conditions.
//
// Frozen contract dependency: NUTRIENTS.md §7 (AlertPayload).

import type { BaseEvent, LeafFailedData, RunEndedData } from "./events.js";

/**
 * Alert payload shape — frozen contract per NUTRIENTS.md §7.
 */
export interface AlertPayload {
  severity: "info" | "warn" | "error" | "critical";
  source: "crash" | "leaf-failure" | "health-below-threshold" | "biome-fail-rate";
  organism: string;
  run_id: string;
  title: string;
  detail: string;
  leaf_id?: string;
  biome?: string;
  event_log_url?: string;
}

/**
 * Alert policy from organism.alerting in mycelium.yaml.
 * All fields optional with sensible defaults.
 */
export interface AlertPolicy {
  /** Fire on crash. Default: true */
  on_crash?: boolean;
  /** Fire on individual leaf failure. Default: true */
  on_leaf_failure?: boolean;
  /** Fire if run health < this threshold (0-1). Default: 0.7 */
  health_threshold?: number;
  /** Fire if any biome's failure rate > this threshold (0-1). Default: 0.5 */
  biome_fail_rate?: number;
}

/**
 * Internal: rollup of biome health from event log.
 */
interface BiomeRollup {
  biome: string;
  total: number;
  failed: number;
  fail_rate: number;
}

const DEFAULT_POLICY: Required<AlertPolicy> = {
  on_crash: true,
  on_leaf_failure: true,
  health_threshold: 0.7,
  biome_fail_rate: 0.5,
};

/**
 * Merge user policy with defaults.
 */
function normalizePolicy(policy?: AlertPolicy): Required<AlertPolicy> {
  return {
    on_crash: policy?.on_crash ?? DEFAULT_POLICY.on_crash,
    on_leaf_failure: policy?.on_leaf_failure ?? DEFAULT_POLICY.on_leaf_failure,
    health_threshold: policy?.health_threshold ?? DEFAULT_POLICY.health_threshold,
    biome_fail_rate: policy?.biome_fail_rate ?? DEFAULT_POLICY.biome_fail_rate,
  };
}

/**
 * Evaluate a crash event against policy.
 * Always fires if policy.on_crash is true.
 */
export function evaluateCrashTrigger(
  organism: string,
  run_id: string,
  error: unknown,
  policy?: AlertPolicy,
  event_log_url?: string
): AlertPayload | null {
  const p = normalizePolicy(policy);
  if (!p.on_crash) {
    return null;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  return {
    severity: "critical",
    source: "crash",
    organism,
    run_id,
    title: `🚨 Cultivation crashed: ${organism}`,
    detail: `# Crash Report

**Organism:** ${organism}
**Run ID:** ${run_id}
**Error:** ${errorMessage}

\`\`\`
${errorStack || errorMessage}
\`\`\`

${event_log_url ? `**Event Log:** ${event_log_url}` : ""}

The cultivation process encountered an unhandled error and terminated abnormally.`,
    event_log_url,
  };
}

/**
 * Evaluate a leaf_failed event against policy.
 * Fires if policy.on_leaf_failure is true.
 */
export function evaluateLeafFailureTrigger(
  organism: string,
  run_id: string,
  leafFailedData: LeafFailedData,
  policy?: AlertPolicy,
  event_log_url?: string
): AlertPayload | null {
  const p = normalizePolicy(policy);
  if (!p.on_leaf_failure) {
    return null;
  }

  return {
    severity: "error",
    source: "leaf-failure",
    organism,
    run_id,
    leaf_id: leafFailedData.leaf_id,
    biome: leafFailedData.biome,
    title: `Leaf failed: ${leafFailedData.leaf_id}`,
    detail: `# Leaf Failure

**Organism:** ${organism}
**Run ID:** ${run_id}
**Leaf:** ${leafFailedData.leaf_id}
**Biome:** ${leafFailedData.biome}
**Duration:** ${leafFailedData.wall_ms}ms

## Error

\`\`\`
${leafFailedData.error}
\`\`\`

${event_log_url ? `**Event Log:** ${event_log_url}` : ""}

This leaf failed during cultivation. Check the error details above and the event log for more context.`,
    event_log_url,
  };
}

/**
 * Evaluate end-of-run conditions against policy.
 * May return multiple payloads (health + biome fail rates).
 */
export function evaluateEndOfRunTriggers(
  organism: string,
  run_id: string,
  events: BaseEvent[],
  policy?: AlertPolicy,
  event_log_url?: string
): AlertPayload[] {
  const p = normalizePolicy(policy);
  const payloads: AlertPayload[] = [];

  // Find the run_ended event
  const runEndedEvent = events.find((e) => e.kind === "run_ended");
  if (!runEndedEvent) {
    // No run_ended event means incomplete run — skip end-of-run triggers
    return payloads;
  }

  const runEndedData = runEndedEvent.data as unknown as RunEndedData;

  // 1. Health-below-threshold trigger
  if (runEndedData.health < p.health_threshold) {
    payloads.push({
      severity: "error",
      source: "health-below-threshold",
      organism,
      run_id,
      title: `Health below threshold: ${organism}`,
      detail: `# Health Alert

**Organism:** ${organism}
**Run ID:** ${run_id}
**Health:** ${(runEndedData.health * 100).toFixed(1)}%
**Threshold:** ${(p.health_threshold * 100).toFixed(1)}%
**Success:** ${runEndedData.ok}/${runEndedData.total}
**Failed:** ${runEndedData.failed}

${event_log_url ? `**Event Log:** ${event_log_url}` : ""}

The cultivation run completed with health below the configured threshold. This may indicate systemic issues across multiple leaves.`,
      event_log_url,
    });
  }

  // 2. Biome fail-rate trigger
  const biomeRollups = rollupBiomeHealth(events);
  const failingBiomes = biomeRollups.filter((b) => b.fail_rate > p.biome_fail_rate && b.total > 0);

  if (failingBiomes.length > 0) {
    const biomeList = failingBiomes
      .map(
        (b) =>
          `- **${b.biome}:** ${b.failed}/${b.total} failed (${(b.fail_rate * 100).toFixed(1)}%)`
      )
      .join("\n");

    payloads.push({
      severity: "warn",
      source: "biome-fail-rate",
      organism,
      run_id,
      title: `High biome failure rate: ${organism}`,
      detail: `# Biome Failure Rate Alert

**Organism:** ${organism}
**Run ID:** ${run_id}
**Threshold:** ${(p.biome_fail_rate * 100).toFixed(1)}%

## Failing Biomes

${biomeList}

${event_log_url ? `**Event Log:** ${event_log_url}` : ""}

One or more biomes exceeded the configured failure rate threshold. This suggests biome-specific issues that may require targeted investigation.`,
      event_log_url,
    });
  }

  return payloads;
}

/**
 * Internal: build biome health rollup from event log.
 */
function rollupBiomeHealth(events: BaseEvent[]): BiomeRollup[] {
  const biomeMap = new Map<string, { total: number; failed: number }>();

  for (const event of events) {
    if (event.kind === "leaf_fruited") {
      const data = event.data as { biome: string };
      const stats = biomeMap.get(data.biome) || { total: 0, failed: 0 };
      stats.total += 1;
      biomeMap.set(data.biome, stats);
    } else if (event.kind === "leaf_failed") {
      const data = event.data as { biome: string };
      const stats = biomeMap.get(data.biome) || { total: 0, failed: 0 };
      stats.total += 1;
      stats.failed += 1;
      biomeMap.set(data.biome, stats);
    }
  }

  return Array.from(biomeMap.entries()).map(([biome, stats]) => ({
    biome,
    total: stats.total,
    failed: stats.failed,
    fail_rate: stats.total > 0 ? stats.failed / stats.total : 0,
  }));
}

/**
 * Convenience: evaluate all triggers for a given context.
 * Used by the alerting upgrade to centralize trigger logic.
 */
export function evaluateAllTriggers(
  organism: string,
  run_id: string,
  context: {
    type: "crash" | "leaf_failed" | "run_ended";
    error?: unknown;
    leafFailedData?: LeafFailedData;
    events?: BaseEvent[];
  },
  policy?: AlertPolicy,
  event_log_url?: string
): AlertPayload[] {
  switch (context.type) {
    case "crash":
      const crashPayload = evaluateCrashTrigger(
        organism,
        run_id,
        context.error!,
        policy,
        event_log_url
      );
      return crashPayload ? [crashPayload] : [];

    case "leaf_failed":
      const leafPayload = evaluateLeafFailureTrigger(
        organism,
        run_id,
        context.leafFailedData!,
        policy,
        event_log_url
      );
      return leafPayload ? [leafPayload] : [];

    case "run_ended":
      return evaluateEndOfRunTriggers(
        organism,
        run_id,
        context.events!,
        policy,
        event_log_url
      );

    default:
      return [];
  }
}
