// Tester pool — runs testers in parallel using the shared concurrency utility.
//
// Imports runWithConcurrency from cli/src/lib/concurrency.ts (extracted from
// cultivate.ts pre-cultivation; cultivate.ts imports from there too).
// Per NUTRIENTS §10: Do NOT modify cultivate.ts.
//
// See NUTRIENTS §4 for the runTestersInPool contract.

import { runWithConcurrency } from "../concurrency.js";
import type { TesterDef, TesterResult } from "./testers.js";
import { runTester } from "./testers-runner.js";
import { appendFinding } from "./findings-writer.js";

/**
 * Default concurrency matches cultivate's default (30).
 * Per NUTRIENTS §4: "Default concurrency: ctx.concurrency || 30"
 */
const DEFAULT_CONCURRENCY = 30;

/**
 * Context passed to the pool runner.
 */
export interface PoolContext {
  auditRunDir: string;
  cultivationDir: string;
  iteration: number;
  concurrency?: number;
}

/**
 * Runs all testers in a concurrency-limited pool.
 *
 * Per HYPHA spec:
 * - Uses runWithConcurrency from ../concurrency.js
 * - Default concurrency: ctx.concurrency || 30
 * - Each tester's Finding | null is forwarded to appendFinding immediately
 *   on completion — partial findings.jsonl is readable mid-run.
 *
 * @param testers - Array of TesterDef to run
 * @param ctx - Pool context with paths, iteration, and concurrency limit
 * @returns Promise resolving to array of TesterResult in original order
 */
export async function runTestersInPool(
  testers: TesterDef[],
  ctx: PoolContext
): Promise<TesterResult[]> {
  const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;

  const results = await runWithConcurrency(testers, concurrency, async (testerDef) => {
    const result = await runTester(testerDef, {
      auditRunDir: ctx.auditRunDir,
      cultivationDir: ctx.cultivationDir,
      iteration: ctx.iteration,
    });

    // Forward finding to JSONL immediately on completion.
    // Per HYPHA: "partial findings.jsonl is readable mid-run"
    if (result.finding !== null) {
      await appendFinding(ctx.auditRunDir, result.finding);
    }

    return result;
  });

  return results;
}
