// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Iteration metadata persistence for the heal-loop.
// Per NUTRIENTS.md §8 — writes IterationRecord under audit/<ts>/iterations/<n>/.
//
// Contract:
// - writeIteration: atomic temp/rename to audit/<ts>/iterations/<n>/iteration.json
// - writeHealLoopSummary: emits final heal-loop-summary.json with all records

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * IterationRecord — per NUTRIENTS.md §8 (frozen).
 * Captures metadata for a single iteration of the heal-loop.
 */
export interface IterationRecord {
  /** 0 = baseline, 1..N = autofix */
  iteration: number;
  /** ISO-8601 with ms */
  started_at: string;
  /** ISO-8601 with ms */
  ended_at: string;
  /** Duration in milliseconds */
  wall_ms: number;
  /** Findings carried over from prior iteration */
  findings_in: number;
  /** Findings present after this iteration */
  findings_out: number;
  /** Critical findings carried over */
  criticals_in: number;
  /** Critical findings after this iteration */
  criticals_out: number;
  /** Biomes from only_biomes in prior brief-fix.md */
  biomes_replanted: string[];
  /** Exact command line invoked */
  replant_command: string;
  /** Exit code from the replant cultivation */
  replant_exit_code: number;
  /** Cost in USD for this iteration (tracked via lib/budget.ts) */
  cost_usd: number;
  /** Total cost across all iterations so far */
  cumulative_cost_usd: number;
  /** Remaining budget in USD */
  budget_remaining_usd: number;
}

/**
 * HealLoopSummary — written to audit/<ts>/heal-loop-summary.json on termination.
 */
export interface HealLoopSummary {
  /** All iterations in order */
  iterations: IterationRecord[];
  /** Why the loop stopped */
  termination_reason:
    | "zero_criticals"
    | "max_iterations"
    | "budget_exhausted"
    | "no_progress";
  /** Did we achieve zero criticals? */
  success: boolean;
  /** Total wall time in ms */
  total_wall_ms: number;
  /** Total cost in USD */
  total_cost_usd: number;
  /** Final critical count */
  final_criticals: number;
  /** Final findings count */
  final_findings: number;
}

/**
 * Ensures the iterations directory exists for a given iteration number.
 */
function ensureIterationDir(auditRunDir: string, iteration: number): string {
  const iterDir = path.join(auditRunDir, "iterations", String(iteration));
  fs.mkdirSync(iterDir, { recursive: true });
  return iterDir;
}

/**
 * Generates a random suffix for temp file naming to avoid collisions.
 */
function tempSuffix(): string {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * Atomic write using temp file + rename pattern.
 * Mirrors the serialization fix from 2026-05-10 (per NUTRIENTS §3 reference).
 */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.${tempSuffix()}.tmp`;
  const json = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(tmpPath, json, "utf8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Writes an IterationRecord to audit/<ts>/iterations/<n>/iteration.json.
 * Atomic temp/rename pattern for safety.
 *
 * @param auditRunDir - The audit run directory (audit/<ISO-timestamp>)
 * @param iteration - The iteration number (0 = baseline)
 * @param record - The IterationRecord to persist
 */
export async function writeIteration(
  auditRunDir: string,
  iteration: number,
  record: IterationRecord
): Promise<void> {
  const iterDir = ensureIterationDir(auditRunDir, iteration);
  const filePath = path.join(iterDir, "iteration.json");
  atomicWriteJson(filePath, record);
}

/**
 * Reads an IterationRecord from audit/<ts>/iterations/<n>/iteration.json.
 * Returns null if the file does not exist.
 *
 * @param auditRunDir - The audit run directory
 * @param iteration - The iteration number
 */
export function readIteration(
  auditRunDir: string,
  iteration: number
): IterationRecord | null {
  const filePath = path.join(
    auditRunDir,
    "iterations",
    String(iteration),
    "iteration.json"
  );
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as IterationRecord;
}

/**
 * Reads all IterationRecords for an audit run.
 * Returns an ordered array (iteration 0, 1, 2, ...).
 *
 * @param auditRunDir - The audit run directory
 */
export function readAllIterations(auditRunDir: string): IterationRecord[] {
  const iterationsDir = path.join(auditRunDir, "iterations");
  if (!fs.existsSync(iterationsDir)) {
    return [];
  }

  const entries = fs.readdirSync(iterationsDir, { withFileTypes: true });
  const iterations: IterationRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const iterNum = parseInt(entry.name, 10);
    if (Number.isNaN(iterNum)) continue;

    const record = readIteration(auditRunDir, iterNum);
    if (record) {
      iterations.push(record);
    }
  }

  // Sort by iteration number
  iterations.sort((a, b) => a.iteration - b.iteration);
  return iterations;
}

/**
 * Writes the final heal-loop-summary.json.
 * Called when the heal-loop terminates (any condition).
 *
 * @param auditRunDir - The audit run directory
 * @param summary - The HealLoopSummary to persist
 */
export async function writeHealLoopSummary(
  auditRunDir: string,
  summary: HealLoopSummary
): Promise<void> {
  const filePath = path.join(auditRunDir, "heal-loop-summary.json");
  atomicWriteJson(filePath, summary);
}

/**
 * Reads the heal-loop-summary.json if it exists.
 *
 * @param auditRunDir - The audit run directory
 */
export function readHealLoopSummary(
  auditRunDir: string
): HealLoopSummary | null {
  const filePath = path.join(auditRunDir, "heal-loop-summary.json");
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as HealLoopSummary;
}

/**
 * Creates a blank IterationRecord with default values.
 * Useful for initializing before populating actual values.
 *
 * @param iteration - The iteration number
 */
export function createBlankIterationRecord(iteration: number): IterationRecord {
  return {
    iteration,
    started_at: new Date().toISOString(),
    ended_at: "",
    wall_ms: 0,
    findings_in: 0,
    findings_out: 0,
    criticals_in: 0,
    criticals_out: 0,
    biomes_replanted: [],
    replant_command: "",
    replant_exit_code: 0,
    cost_usd: 0,
    cumulative_cost_usd: 0,
    budget_remaining_usd: 0,
  };
}

/**
 * Finalizes an IterationRecord by setting ended_at and calculating wall_ms.
 *
 * @param record - The record to finalize (mutated in place)
 */
export function finalizeIterationRecord(record: IterationRecord): void {
  record.ended_at = new Date().toISOString();
  const start = new Date(record.started_at).getTime();
  const end = new Date(record.ended_at).getTime();
  record.wall_ms = end - start;
}

/**
 * Builds a HealLoopSummary from an array of IterationRecords.
 *
 * @param iterations - All iteration records
 * @param terminationReason - Why the loop stopped
 */
export function buildHealLoopSummary(
  iterations: IterationRecord[],
  terminationReason: HealLoopSummary["termination_reason"]
): HealLoopSummary {
  const lastIteration = iterations[iterations.length - 1];
  const totalWallMs = iterations.reduce((sum, r) => sum + r.wall_ms, 0);
  const totalCostUsd = lastIteration?.cumulative_cost_usd ?? 0;

  return {
    iterations,
    termination_reason: terminationReason,
    success: terminationReason === "zero_criticals",
    total_wall_ms: totalWallMs,
    total_cost_usd: totalCostUsd,
    final_criticals: lastIteration?.criticals_out ?? 0,
    final_findings: lastIteration?.findings_out ?? 0,
  };
}

/**
 * Determines if the heal-loop should terminate based on the current iteration.
 * Returns the termination reason if loop should stop, null otherwise.
 *
 * @param record - The current iteration record (after running)
 * @param maxIterations - Maximum allowed iterations
 * @param maxBudgetUsd - Maximum allowed budget
 * @param prevRecord - Unused since the NUTRIENTS §8 cond-4 fix (no-progress is
 *   evaluated within the record); retained so the exported signature is stable.
 */
export function evaluateTermination(
  record: IterationRecord,
  maxIterations: number,
  maxBudgetUsd: number,
  prevRecord: IterationRecord | null
): HealLoopSummary["termination_reason"] | null {
  // Condition 1: zero criticals (success)
  if (record.criticals_out === 0) {
    return "zero_criticals";
  }

  // Condition 2: max iterations reached
  if (record.iteration >= maxIterations) {
    return "max_iterations";
  }

  // Condition 3: budget exhausted
  if (record.cumulative_cost_usd >= maxBudgetUsd) {
    return "budget_exhausted";
  }

  // Condition 4: no progress (findings_out >= findings_in with non-zero criticals)
  // Per NUTRIENTS §8 cond 4 this compares within the record itself —
  // findings_in already carries the prior iteration's (or baseline's) count,
  // so no prevRecord is needed. The old prevRecord-gated comparison meant the
  // condition could never fire on iteration 1 (baseline is not in the
  // iterations array, so prevRecord was null) and compared the wrong field.
  if (record.criticals_out > 0 && record.findings_out >= record.findings_in) {
    return "no_progress";
  }

  return null;
}
