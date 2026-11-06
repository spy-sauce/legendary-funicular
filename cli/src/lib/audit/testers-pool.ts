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
import * as fs from "node:fs";
import * as path from "node:path";
import { makeCacheStore } from "../cache-network/store.js";
import { rollupMetrics } from "../micro-agents/metrics.js";
import type { MicroCallRecord } from "../micro-agents/types.js";

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
  microsEnabled?: boolean;     // default true; --no-micros sets false
  contractHash?: string;
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
  const micrsEnabled = ctx.microsEnabled !== false;

  // One shared cache store for the whole pool → cross-tester dedup.
  const microStore = micrsEnabled
    ? makeCacheStore({ capacity: 512 })
    : undefined;

  const results = await runWithConcurrency(testers, concurrency, async (testerDef) => {
    const result = await runTester(testerDef, {
      auditRunDir: ctx.auditRunDir,
      cultivationDir: ctx.cultivationDir,
      iteration: ctx.iteration,
      microsEnabled: micrsEnabled,
      contractHash: ctx.contractHash,
      microStore,
    });

    if (result.finding !== null) {
      await appendFinding(ctx.auditRunDir, result.finding);
    }
    return result;
  });

  // ── Roll up micro metrics → audit/<ts>/micro-metrics.json (Spec §5) ──
  const allRecords: MicroCallRecord[] = [];
  const allFoldedTargets: string[] = [];
  let redundantReReads = 0;
  let summaryInputTokens = 0;
  let rawTargetBytes = 0;
  for (const r of results) {
    if (r.micro_records) {
      allRecords.push(...r.micro_records);
      // summary tokens consumed by the tester ≈ Σ worker output tokens that were folded.
      summaryInputTokens += r.micro_records.reduce((s, x) => s + x.output_tokens, 0);
      rawTargetBytes += r.micro_records.reduce((s, x) => s + x.raw_target_bytes, 0);
    }
    if (r.micro_folded_targets) allFoldedTargets.push(...r.micro_folded_targets);
    redundantReReads += r.micro_redundant_re_reads ?? 0;
  }

  const metrics = rollupMetrics({
    records: allRecords,
    micrsEnabled,
    foldedTargets: allFoldedTargets,
    redundantReReads,
    summaryInputTokens,
    rawTargetBytes,
  });

  try {
    const outPath = path.join(ctx.auditRunDir, "micro-metrics.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(metrics, null, 2), "utf-8");
  } catch (err) {
    console.error("[micro-agents] warning: failed to write micro-metrics.json:", err instanceof Error ? err.message : err);
  }

  return results;
}
