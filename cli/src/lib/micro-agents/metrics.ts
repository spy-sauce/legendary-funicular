// Mycelium Framework — VibeSpace LLC — The network provides.
//
// metrics — pure rollups for micro read-side measurement. Spec §5.
// Input tokens are the headline (near-deterministic); output tokens logged not headlined.

import type { MicroCallRecord, MicroMetrics } from "./types.js";

const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

export interface RollupInput {
  records: MicroCallRecord[];
  micrsEnabled: boolean;
  foldedTargets: string[];
  redundantReReads: number;
  summaryInputTokens: number; // Σ summary tokens the testers consumed
  rawTargetBytes: number;     // Σ raw bytes those summaries replaced
}

/** Roll per-call records + tester-side counts into pool MicroMetrics. */
export function rollupMetrics(input: RollupInput): MicroMetrics {
  const { records, micrsEnabled, foldedTargets, redundantReReads, summaryInputTokens, rawTargetBytes } = input;
  const total = records.length;
  const hits = records.filter((r) => r.cache_status === "hit").length;
  const misses = total - hits;
  const haikuInput = records.reduce((s, r) => s + r.input_tokens, 0);
  return {
    micros_enabled: micrsEnabled,
    total_calls: total,
    cache_hits: hits,
    cache_misses: misses,
    dedup_rate: safeDiv(hits, total),
    haiku_input_tokens: haikuInput,
    folded_targets: foldedTargets.length,
    redundant_re_reads: redundantReReads,
    re_read_rate: safeDiv(redundantReReads, foldedTargets.length),
    summary_input_tokens: summaryInputTokens,
    raw_target_bytes: rawTargetBytes,
    compression_ratio: safeDiv(summaryInputTokens, rawTargetBytes),
  };
}

/**
 * Count folded targets that the tester re-read via a Read tool_use.
 * stdout lines look like: [TOOL_USE] Read: {"file_path":"/abs/path"}.
 * A folded target matches if its basename appears in any Read file_path.
 */
export function scanReReads(stdout: string, foldedTargets: string[]): number {
  if (foldedTargets.length === 0) return 0;
  const readPaths: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/\[TOOL_USE\] Read: (\{.*\})/);
    if (!m) continue;
    try {
      const obj = JSON.parse(m[1]) as { file_path?: string };
      if (obj.file_path) readPaths.push(obj.file_path);
    } catch { /* ignore truncated json (input is sliced to 200 chars in the log) */ }
  }
  let count = 0;
  for (const t of foldedTargets) {
    const base = t.split("/").pop() ?? t;
    if (readPaths.some((p) => p.includes(base))) count++;
  }
  return count;
}
