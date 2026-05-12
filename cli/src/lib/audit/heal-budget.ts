// Mycelium Framework — VibeSpace LLC — The network provides.
//
// audit.heal.budget — budget resolution + cumulative cost tracking for heal-loop.
//
// Implements NUTRIENTS.md §9 (cost/budget tie-in):
// - resolveBudget: CLI flag > yaml budget.maxUsd > default
// - trackCost: reads/updates <runDir>/.cost.json ledger
//
// Per-iteration cost is derived from cost-recorded events in the cultivation's
// .mycelium/events/*.jsonl — this module re-uses existing telemetry plumbing
// (does not re-implement).

import * as fs from "fs";
import * as path from "path";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/**
 * Default budget cap for audit-run heal-loop (USD).
 * When neither CLI flag nor yaml specifies a budget, this is the ceiling.
 * Set conservatively — iterative heal-loops can accumulate cost quickly.
 */
const DEFAULT_BUDGET_USD = 50;

/**
 * Environment variable override for default budget.
 * Same posture as lib/budget.ts MYCELIUM_MAX_BUDGET_USD.
 */
const ENV_VAR = "MYCELIUM_AUDIT_MAX_BUDGET_USD";

// ────────────────────────────────────────────────────────────────────────────
// Budget resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the max budget for a heal-loop run.
 *
 * Precedence (highest to lowest):
 *   1. CLI flag (`--max-budget-usd <n>`)
 *   2. yaml config (`budget.maxUsd` in mycelium.yaml)
 *   3. Environment variable (MYCELIUM_AUDIT_MAX_BUDGET_USD)
 *   4. Hardcoded default (DEFAULT_BUDGET_USD)
 *
 * @param cliFlag - Value from `--max-budget-usd` flag (if provided)
 * @param yamlMaxUsd - Value from `mycelium.yaml` `budget.maxUsd` (if present)
 * @returns Resolved budget cap in USD
 */
export function resolveBudget(cliFlag?: number, yamlMaxUsd?: number): number {
  // 1. CLI flag wins
  if (typeof cliFlag === "number" && Number.isFinite(cliFlag) && cliFlag > 0) {
    return cliFlag;
  }

  // 2. yaml budget.maxUsd
  if (
    typeof yamlMaxUsd === "number" &&
    Number.isFinite(yamlMaxUsd) &&
    yamlMaxUsd > 0
  ) {
    return yamlMaxUsd;
  }

  // 3. Environment variable
  const fromEnv = Number(process.env[ENV_VAR]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  // 4. Hardcoded default
  return DEFAULT_BUDGET_USD;
}

/**
 * Format a USD budget value for display.
 *
 * @param usd - Budget in USD
 * @returns Formatted string (e.g., "$50.00")
 */
export function formatBudget(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Cost ledger
// ────────────────────────────────────────────────────────────────────────────

/**
 * Shape of the .cost.json ledger persisted under the audit run directory.
 */
interface CostLedger {
  /** Per-iteration cost entries */
  iterations: Array<{
    iteration: number;
    cost_usd: number;
    recorded_at: string;
  }>;
  /** Running total across all iterations */
  cumulative_usd: number;
  /** Resolved budget cap (for reference) */
  max_budget_usd: number;
}

/**
 * Result of a trackCost call.
 */
export interface CostTrackResult {
  /** Total cost accumulated so far (including this iteration) */
  cumulative: number;
  /** Remaining budget (max - cumulative) */
  remaining: number;
}

/**
 * Read the existing cost ledger from disk, or initialize a new one.
 *
 * @param runDir - Audit run directory (audit/<ts>/)
 * @param maxBudgetUsd - Resolved max budget (for initialization)
 * @returns Parsed or initialized ledger
 */
function readLedger(runDir: string, maxBudgetUsd: number): CostLedger {
  const ledgerPath = path.join(runDir, ".cost.json");
  try {
    const raw = fs.readFileSync(ledgerPath, "utf-8");
    const parsed = JSON.parse(raw) as CostLedger;
    // Validate shape minimally
    if (
      typeof parsed.cumulative_usd === "number" &&
      Array.isArray(parsed.iterations)
    ) {
      return parsed;
    }
  } catch {
    // File doesn't exist or is malformed — initialize
  }

  return {
    iterations: [],
    cumulative_usd: 0,
    max_budget_usd: maxBudgetUsd,
  };
}

/**
 * Write the cost ledger to disk atomically (temp-file + rename).
 *
 * @param runDir - Audit run directory
 * @param ledger - Ledger to persist
 */
function writeLedger(runDir: string, ledger: CostLedger): void {
  const ledgerPath = path.join(runDir, ".cost.json");
  const tempPath = `${ledgerPath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(ledger, null, 2), "utf-8");
    fs.renameSync(tempPath, ledgerPath);
  } catch (err) {
    // Best-effort cleanup
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore
    }
    // Log to stderr but do not throw — mirrors telemetry-emitter pattern
    console.error(`[heal-budget] failed to write cost ledger: ${err}`);
  }
}

/**
 * Track cost for a single iteration.
 *
 * Reads/updates the `<runDir>/.cost.json` ledger. This function is idempotent
 * for a given (runDir, iteration) pair — re-calling with the same iteration
 * updates that iteration's cost rather than double-counting.
 *
 * @param runDir - Audit run directory (audit/<ts>/)
 * @param iteration - Iteration number (0 = baseline, 1..N = autofix)
 * @param iterationCostUsd - Cost for this iteration in USD
 * @param maxBudgetUsd - Resolved max budget (for initialization)
 * @returns Updated cumulative cost and remaining budget
 */
export function trackCost(
  runDir: string,
  iteration: number,
  iterationCostUsd: number,
  maxBudgetUsd: number
): CostTrackResult {
  const ledger = readLedger(runDir, maxBudgetUsd);

  // Check if this iteration already exists (idempotent update)
  const existingIdx = ledger.iterations.findIndex(
    (e) => e.iteration === iteration
  );
  const previousCostForIteration =
    existingIdx >= 0 ? ledger.iterations[existingIdx].cost_usd : 0;

  // Update or insert
  const entry = {
    iteration,
    cost_usd: iterationCostUsd,
    recorded_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    ledger.iterations[existingIdx] = entry;
  } else {
    ledger.iterations.push(entry);
  }

  // Recalculate cumulative (delta from previous value for this iteration)
  ledger.cumulative_usd += iterationCostUsd - previousCostForIteration;
  ledger.max_budget_usd = maxBudgetUsd;

  writeLedger(runDir, ledger);

  return {
    cumulative: ledger.cumulative_usd,
    remaining: Math.max(0, maxBudgetUsd - ledger.cumulative_usd),
  };
}

/**
 * Read the current cumulative cost without updating.
 *
 * @param runDir - Audit run directory
 * @param maxBudgetUsd - Resolved max budget (for remaining calculation)
 * @returns Current cumulative and remaining
 */
export function readCumulativeCost(
  runDir: string,
  maxBudgetUsd: number
): CostTrackResult {
  const ledger = readLedger(runDir, maxBudgetUsd);
  return {
    cumulative: ledger.cumulative_usd,
    remaining: Math.max(0, maxBudgetUsd - ledger.cumulative_usd),
  };
}

/**
 * Check if budget is exhausted.
 *
 * @param runDir - Audit run directory
 * @param maxBudgetUsd - Resolved max budget
 * @returns true if cumulative cost >= max budget
 */
export function isBudgetExhausted(
  runDir: string,
  maxBudgetUsd: number
): boolean {
  const { cumulative } = readCumulativeCost(runDir, maxBudgetUsd);
  return cumulative >= maxBudgetUsd;
}

// ────────────────────────────────────────────────────────────────────────────
// Cost extraction from telemetry events
// ────────────────────────────────────────────────────────────────────────────

/**
 * Shape of a cost_recorded event's data field.
 * Mirrors CostRecordedData from cli/src/lib/telemetry/events.ts.
 */
interface CostRecordedData {
  leaf_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd_estimate: number;
}

/**
 * Shape of a telemetry event (minimal — we only need cost_recorded).
 * Mirrors BaseEvent from cli/src/lib/telemetry/events.ts.
 */
interface TelemetryEvent {
  run_id: string;
  kind: string;
  data: unknown;
}

/**
 * Sum cost from cost_recorded events in a JSONL file for a specific run_id.
 *
 * @param eventsPath - Path to a .jsonl events file
 * @param runId - The run_id to filter by
 * @returns Total usd_estimate for matching events
 */
function sumCostFromFile(eventsPath: string, runId: string): number {
  let total = 0;
  try {
    const content = fs.readFileSync(eventsPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as TelemetryEvent;
        if (event.run_id === runId && event.kind === "cost_recorded") {
          const data = event.data as CostRecordedData;
          if (typeof data.usd_estimate === "number") {
            total += data.usd_estimate;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File doesn't exist or unreadable — return 0
  }
  return total;
}

/**
 * Extract total cost for a run from the cultivation's telemetry events.
 *
 * Scans all .jsonl files under <cultivationDir>/.mycelium/events/ for
 * cost_recorded events matching the given run_id. This re-uses existing
 * telemetry plumbing (does not re-implement cost calculation).
 *
 * @param cultivationDir - Root of the cultivation being audited
 * @param runId - The run_id to filter by
 * @returns Total cost in USD
 */
export function extractCostFromEvents(
  cultivationDir: string,
  runId: string
): number {
  const eventsDir = path.join(cultivationDir, ".mycelium", "events");
  let total = 0;

  try {
    const files = fs.readdirSync(eventsDir);
    for (const file of files) {
      if (file.endsWith(".jsonl")) {
        total += sumCostFromFile(path.join(eventsDir, file), runId);
      }
    }
  } catch {
    // Events dir doesn't exist — return 0
  }

  return total;
}
