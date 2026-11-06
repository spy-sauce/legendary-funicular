// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Heal-loop — autofix re-plant cycle with iteration metadata and budget cap.
//
// Scope:    audit.heal.loop
// Contract: NUTRIENTS.md §8 (heal-loop iteration contract)
//
// This module drives the autofix loop:
//   1. Read findings from prior iteration (or baseline)
//   2. Aggregate → AggregatedFindings
//   3. If criticalBiomes.length === 0 → success, emit summary, exit
//   4. composeBriefFix → write brief-fix.md
//   5. For each biome in (criticalBiomes ∪ majorBiomes): spawn cultivate --only-biome
//   6. Re-run testers via injected runTestersFn (avoids circular dep)
//   7. Write new findings.jsonl + summary.json
//   8. Evaluate termination conditions
//
// The loop terminates on any of (per NUTRIENTS §8):
//   - zero_criticals (success)
//   - max_iterations (capped)
//   - budget_exhausted (cumulative_cost_usd >= maxBudgetUsd)
//   - no_progress (findings_out >= findings_in with non-zero criticals)

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

import type { Finding } from "./findings.js";
import { readFindings, findingsPath } from "./findings-writer.js";
import { aggregate, type AggregatedFindings } from "./aggregator.js";
import { composeBriefFix } from "./aggregator-brief.js";
import { resetBiomeLeaves } from "./sporenet-integration.js";
import { invalidateCacheStoreIter } from "../../commands/cultivate.js";
import {
  type IterationRecord,
  type HealLoopSummary,
  writeIteration,
  writeHealLoopSummary,
  createBlankIterationRecord,
  finalizeIterationRecord,
  buildHealLoopSummary,
  evaluateTermination,
} from "./heal-iteration.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Options for runHealLoop.
 */
export interface HealLoopOptions {
  /** The audit run directory (audit/<ISO-timestamp>) */
  auditRunDir: string;

  /** Root of the cultivation being audited */
  cultivationDir: string;

  /** Maximum iterations (default: 3 per NUTRIENTS §8) */
  maxIterations: number;

  /** Maximum budget in USD (default: from lib/budget.ts) */
  maxBudgetUsd: number;

  /** If set, create a sub-organism branch for autofix (per HYPHA spec) */
  autofixBranch?: string;

  /** Concurrency for cultivate invocations (default: 1 — sequential) */
  concurrency: number;

  /** Path to the original brief.md in the cultivation */
  originalBriefPath: string;
}

/**
 * Injected function to run testers.
 *
 * The heal-loop does NOT import audit-testers directly to avoid circular deps.
 * The caller (audit-cli) injects this closure.
 *
 * @param auditRunDir - Current audit run directory
 * @param cultivationDir - Cultivation root
 * @param iteration - Current iteration number
 * @returns Array of findings from this tester run
 */
export type RunTestersFn = (
  auditRunDir: string,
  cultivationDir: string,
  iteration: number
) => Promise<Finding[]>;

/**
 * Result of running the heal-loop.
 */
export interface HealLoopResult {
  /** All iteration records in order */
  iterations: IterationRecord[];

  /** Did we achieve zero criticals? */
  success: boolean;

  /** Why the loop stopped */
  terminationReason: HealLoopSummary["termination_reason"];

  /** Final findings after last iteration */
  finalFindings: Finding[];

  /** Final aggregated state */
  finalAggregated: AggregatedFindings;

  /** Total cost in USD across all iterations */
  totalCostUsd: number;

  /** Total wall time in ms */
  totalWallMs: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Default max iterations per NUTRIENTS §8 / §10.1 lean */
const DEFAULT_MAX_ITERATIONS = 3;

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read the original brief.md from the cultivation.
 */
function readOriginalBrief(briefPath: string): string {
  if (!fs.existsSync(briefPath)) {
    return ""; // Empty brief — composeBriefFix handles this gracefully
  }
  return fs.readFileSync(briefPath, "utf-8");
}

/**
 * Write brief-fix.md for an iteration.
 */
function writeBriefFix(
  auditRunDir: string,
  iteration: number,
  content: string
): string {
  const iterDir = path.join(auditRunDir, "iterations", String(iteration));
  fs.mkdirSync(iterDir, { recursive: true });
  const briefPath = path.join(iterDir, "brief-fix.md");
  fs.writeFileSync(briefPath, content, "utf-8");
  return briefPath;
}

/**
 * Get findings path for an iteration (or baseline).
 *
 * - iteration 0 (baseline) → auditRunDir/findings.jsonl
 * - iteration n → auditRunDir/iterations/<n-1>/findings.jsonl
 */
function getIterationFindingsPath(
  auditRunDir: string,
  iteration: number
): string {
  if (iteration === 0) {
    // Baseline — no prior iteration, return empty (will read baseline)
    return findingsPath(auditRunDir);
  }
  // Read from the PREVIOUS iteration's output
  const prevIter = iteration - 1;
  if (prevIter === 0) {
    // First autofix iteration reads from baseline
    return findingsPath(auditRunDir);
  }
  return path.join(
    auditRunDir,
    "iterations",
    String(prevIter),
    "findings.jsonl"
  );
}

/**
 * Write findings.jsonl for an iteration.
 */
function writeIterationFindings(
  auditRunDir: string,
  iteration: number,
  findings: Finding[]
): string {
  const iterDir = path.join(auditRunDir, "iterations", String(iteration));
  fs.mkdirSync(iterDir, { recursive: true });
  const filePath = path.join(iterDir, "findings.jsonl");
  const content = findings.map((f) => JSON.stringify(f)).join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * Spawn `mycelium cultivate --only-biome <biome>` and wait for exit.
 *
 * @param cultivationDir - Working directory for the cultivate command
 * @param biome - The biome to re-plant
 * @returns Exit code from the process
 */
async function spawnCultivate(
  cultivationDir: string,
  biome: string
): Promise<{ exitCode: number; command: string }> {
  const command = `mycelium cultivate --only-biome ${biome}`;

  return new Promise((resolve) => {
    const proc = spawn("npx", ["mycelium", "cultivate", "--only-biome", biome], {
      cwd: cultivationDir,
      stdio: "inherit",
      shell: true,
    });

    proc.on("error", (err) => {
      console.error(`[heal-loop] spawn error for biome ${biome}:`, err.message);
      resolve({ exitCode: 1, command });
    });

    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 0, command });
    });
  });
}

/**
 * Setup autofix-branch before iteration 1.
 *
 * Per HYPHA spec:
 * - `git checkout -b <autofixBranch>`
 * - Stash uncommitted work first; abort loudly if stash conflicts
 *
 * @param cultivationDir - The cultivation root
 * @param branchName - Name of the autofix branch
 * @returns true if setup succeeded, false if aborted
 */
async function setupAutofixBranch(
  cultivationDir: string,
  branchName: string
): Promise<boolean> {
  return new Promise((resolve) => {
    // First, try to stash any uncommitted work
    const stash = spawn("git", ["stash", "push", "-m", "audit-autofix-stash"], {
      cwd: cultivationDir,
      stdio: "pipe",
    });

    let stashOutput = "";
    stash.stdout?.on("data", (d) => (stashOutput += d.toString()));
    stash.stderr?.on("data", (d) => (stashOutput += d.toString()));

    stash.on("close", (stashCode) => {
      if (stashCode !== 0 && !stashOutput.includes("No local changes")) {
        console.error(
          `[heal-loop] ABORT: git stash failed with code ${stashCode}`
        );
        console.error(`[heal-loop] stash output: ${stashOutput}`);
        resolve(false);
        return;
      }

      // Now create and checkout the branch
      const checkout = spawn("git", ["checkout", "-b", branchName], {
        cwd: cultivationDir,
        stdio: "pipe",
      });

      let checkoutOutput = "";
      checkout.stdout?.on("data", (d) => (checkoutOutput += d.toString()));
      checkout.stderr?.on("data", (d) => (checkoutOutput += d.toString()));

      checkout.on("close", (checkoutCode) => {
        if (checkoutCode !== 0) {
          console.error(
            `[heal-loop] ABORT: git checkout -b ${branchName} failed`
          );
          console.error(`[heal-loop] checkout output: ${checkoutOutput}`);
          resolve(false);
          return;
        }

        console.log(`[heal-loop] Created autofix branch: ${branchName}`);
        resolve(true);
      });
    });
  });
}

/**
 * Count findings by severity.
 */
function countBySeverity(findings: Finding[]): {
  critical: number;
  major: number;
  minor: number;
} {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const f of findings) {
    counts[f.severity]++;
  }
  return counts;
}

// ────────────────────────────────────────────────────────────────────────────
// Main loop
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run the heal-loop — autofix re-plant cycle.
 *
 * The loop aggregates findings, composes brief-fix.md, re-cultivates affected
 * biomes, re-runs testers, and iterates until clean or a termination condition
 * fires.
 *
 * @param opts - Loop configuration
 * @param runTestersFn - Injected function to run testers (avoids circular dep)
 * @returns HealLoopResult with all iterations and final state
 */
export async function runHealLoop(
  opts: HealLoopOptions,
  runTestersFn: RunTestersFn
): Promise<HealLoopResult> {
  const {
    auditRunDir,
    cultivationDir,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    maxBudgetUsd,
    autofixBranch,
    originalBriefPath,
  } = opts;

  const iterations: IterationRecord[] = [];
  let cumulativeCostUsd = 0;
  let currentFindings: Finding[] = [];
  let currentAggregated: AggregatedFindings;
  let terminationReason: HealLoopSummary["termination_reason"] | null = null;

  // Read baseline findings (iteration 0 ran before heal-loop started)
  const baselineFindingsPath = findingsPath(auditRunDir);
  currentFindings = await readFindings(auditRunDir);
  currentAggregated = aggregate(currentFindings);

  // Quick exit if baseline is already clean
  if (currentAggregated.criticalBiomes.length === 0) {
    terminationReason = "zero_criticals";

    const summary = buildHealLoopSummary([], terminationReason);
    await writeHealLoopSummary(auditRunDir, summary);

    return {
      iterations: [],
      success: true,
      terminationReason,
      finalFindings: currentFindings,
      finalAggregated: currentAggregated,
      totalCostUsd: 0,
      totalWallMs: 0,
    };
  }

  // Setup autofix-branch if requested (before iteration 1)
  if (autofixBranch) {
    const branchOk = await setupAutofixBranch(cultivationDir, autofixBranch);
    if (!branchOk) {
      // Abort the loop — branch setup failed
      terminationReason = "no_progress"; // Best fit; could add a new reason
      const summary = buildHealLoopSummary([], terminationReason);
      await writeHealLoopSummary(auditRunDir, summary);

      return {
        iterations: [],
        success: false,
        terminationReason,
        finalFindings: currentFindings,
        finalAggregated: currentAggregated,
        totalCostUsd: 0,
        totalWallMs: 0,
      };
    }
  }

  const originalBrief = readOriginalBrief(originalBriefPath);

  // ── Iteration loop ────────────────────────────────────────────────────────
  for (let iter = 1; iter <= maxIterations; iter++) {
    const record = createBlankIterationRecord(iter);
    const prevRecord = iterations.length > 0 ? iterations[iterations.length - 1] : null;

    // Counts from previous iteration (or baseline)
    const prevSeverity = countBySeverity(currentFindings);
    record.findings_in = currentFindings.length;
    record.criticals_in = prevSeverity.critical;

    // ── Step 1: Compose brief-fix.md ──────────────────────────────────────
    const prevFindingsPath =
      iter === 1
        ? baselineFindingsPath
        : path.join(auditRunDir, "iterations", String(iter - 1), "findings.jsonl");

    const briefFixContent = composeBriefFix(
      originalBrief,
      currentAggregated,
      prevFindingsPath
    );
    writeBriefFix(auditRunDir, iter, briefFixContent);

    // ── Step 2: Re-cultivate affected biomes ──────────────────────────────
    const biomesToReplant = [
      ...currentAggregated.criticalBiomes,
      ...currentAggregated.majorBiomes,
    ].sort();

    record.biomes_replanted = biomesToReplant;

    let lastExitCode = 0;
    let lastCommand = "";

    // Sequential re-plant (per HYPHA: "single-biome cultivate at a time")
    for (const biome of biomesToReplant) {
      // Bug 1 fix (2026-05-11): Reset the biome's leaves from `done` → `pending`
      // before spawnCultivate, otherwise cultivate's F1 skip-already-done path
      // (cultivate.ts:158-170) sees every leaf as `done` and produces zero files.
      // Without this, the heal-loop iterates without ever fixing anything.
      await resetBiomeLeaves(cultivationDir, biome);

      const result = await spawnCultivate(cultivationDir, biome);
      lastExitCode = result.exitCode;
      lastCommand = result.command;

      // Record the last command (could concatenate all, but spec shows single)
      record.replant_command = lastCommand;
      record.replant_exit_code = lastExitCode;
    }

    // ── Step 3: Re-run testers ────────────────────────────────────────────
    const newFindings = await runTestersFn(auditRunDir, cultivationDir, iter);

    // Write findings for this iteration
    writeIterationFindings(auditRunDir, iter, newFindings);

    // ── Step 4: Update state ──────────────────────────────────────────────
    currentFindings = newFindings;
    currentAggregated = aggregate(currentFindings);

    const newSeverity = countBySeverity(currentFindings);
    record.findings_out = currentFindings.length;
    record.criticals_out = newSeverity.critical;

    // Cost tracking — placeholder (audit.heal.budget sibling provides actual impl)
    // For now, we track 0 cost; the budget sibling will integrate with
    // lib/budget.ts and cost-recorded events.
    const iterationCost = 0; // TODO: audit.heal.budget will populate this
    cumulativeCostUsd += iterationCost;
    record.cost_usd = iterationCost;
    record.cumulative_cost_usd = cumulativeCostUsd;
    record.budget_remaining_usd = maxBudgetUsd - cumulativeCostUsd;

    // Finalize timing
    finalizeIterationRecord(record);

    // Persist iteration record
    await writeIteration(auditRunDir, iter, record);
    iterations.push(record);

    // ── Step 5: Evaluate termination ──────────────────────────────────────
    terminationReason = evaluateTermination(
      record,
      maxIterations,
      maxBudgetUsd,
      prevRecord
    );

    if (terminationReason !== null) {
      break;
    }

    // ── Iter-advance: invalidate cache entries from this iteration ────────
    // Per NUTRIENTS §4: "when heal-loop advances iter, call invalidateIter(prevIter)"
    // Called here, at the end of iter N, before the loop advances to iter N+1.
    invalidateCacheStoreIter(iter);
  }

  // Default termination reason if loop exhausted iterations without explicit term
  if (terminationReason === null) {
    terminationReason = "max_iterations";
  }

  // ── Write final summary ─────────────────────────────────────────────────
  const summary = buildHealLoopSummary(iterations, terminationReason);
  await writeHealLoopSummary(auditRunDir, summary);

  return {
    iterations,
    success: terminationReason === "zero_criticals",
    terminationReason,
    finalFindings: currentFindings,
    finalAggregated: currentAggregated,
    totalCostUsd: summary.total_cost_usd,
    totalWallMs: summary.total_wall_ms,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ────────────────────────────────────────────────────────────────────────────

export type { IterationRecord, HealLoopSummary };
export { DEFAULT_MAX_ITERATIONS };
