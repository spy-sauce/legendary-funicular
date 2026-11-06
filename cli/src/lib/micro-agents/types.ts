// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Micro-agents read-side v1 — shared types.
// Spec: docs/superpowers/specs/2026-05-29-micro-agents-readside-v1-design.md §3,§5

/**
 * One read-side sub-job a tester fans out into. v1 emits kind:"summarize" only;
 * "read"/"grep" are reserved for v2 (the union allows them without a contract change).
 */
export interface MicroSubJob {
  id: string;        // stable slug, e.g. "summarize-nutrients-md"
  kind: "read" | "grep" | "summarize";
  target: string;    // a path / glob / section ref taken from the tester's INPUTS
  question: string;  // fixed template, e.g. "Summarize the contract/behavior in <target>."
}

/** One micro call's accounting record. */
export interface MicroCallRecord {
  tester_id: string;
  sub_job_id: string;
  cache_status: "hit" | "miss";
  model: "haiku";
  input_tokens: number;    // 0 on hit
  output_tokens: number;   // 0 on hit; summary size on miss (logged, not headlined)
  raw_target_bytes: number; // byte size of the source the summary replaces (0 if unreadable)
}

/** Pool-level rolled-up metrics, written to audit/<ts>/micro-metrics.json. */
export interface MicroMetrics {
  micros_enabled: boolean;
  total_calls: number;
  cache_hits: number;
  cache_misses: number;
  dedup_rate: number;             // cache_hits / total_calls (0 if total_calls===0)
  haiku_input_tokens: number;     // Σ worker input tokens (misses only)
  folded_targets: number;         // distinct targets folded across the pool
  redundant_re_reads: number;     // tester re-read a folded target's raw source
  re_read_rate: number;           // redundant_re_reads / folded_targets (0 if none folded)
  summary_input_tokens: number;   // Σ summary tokens consumed by testers
  raw_target_bytes: number;       // Σ raw bytes the summaries replaced
  compression_ratio: number;      // summary_input_tokens / raw_target_bytes (0 if no bytes)
}

/** Return shape of runMicroFanout. */
export interface MicroFanoutResult {
  foldedContext: string;     // "## Gathered Context" block, or "" when no sub-jobs / all failed
  records: MicroCallRecord[];
  foldedTargets: string[];   // targets successfully summarized (for re-read scan)
}
