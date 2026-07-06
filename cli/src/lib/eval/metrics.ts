// Mycelium Framework — VibeSpace LLC — The network provides.
//
// eval/metrics.ts — pure pass@k / pass^k / cost arithmetic for `mycelium eval`.
// No I/O, no side effects; every function is total (no NaN escapes, no
// exceptions). Consumed by runner.ts / report.ts. Metric definitions follow
// docs/mycelium-eval-spec.md §Metrics; shapes are frozen in ./types.js.

import type {
  BaselineDelta,
  EvalBaseline,
  EvalTask,
  TaskRunSummary,
  TrialResult,
} from "./types.js";

/** Round to 4 decimal places (USD precision used across summaries). */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Coerce a possibly-absent/non-finite number to a safe finite value. */
function finite(n: number | undefined | null): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * pass@1 — spec: "Fraction of trials where the *first* run passes all judges."
 * Per-task-run this is binary: 1 if trial #1 passed, else 0 (empty set → 0).
 * Headline reliability.
 */
export function passAt1(trials: Pick<TrialResult, "pass">[]): number {
  return trials[0]?.pass ? 1 : 0;
}

/**
 * pass@k — spec: "Fraction of trial-sets where *at least one of k* runs
 * passes." Per-task-run this is binary: 1 if any trial passed, else 0
 * (empty set → 0). Practical reliability under controlled retry.
 */
export function passAtK(trials: Pick<TrialResult, "pass">[]): number {
  return trials.some((t) => t.pass) ? 1 : 0;
}

/**
 * pass^k — spec: "Fraction of trial-sets where *all k* runs pass."
 * Per-task-run this is binary: 1 only when the set is non-empty AND every
 * trial passed, else 0. Stability — the bar for release-critical paths.
 */
export function passCaretK(trials: Pick<TrialResult, "pass">[]): number {
  return trials.length > 0 && trials.every((t) => t.pass) ? 1 : 0;
}

/**
 * pass_rate — fraction of trials passing (0..1), the headline reliability
 * across the whole set. Empty set → 0.
 */
export function passRate(trials: Pick<TrialResult, "pass">[]): number {
  if (trials.length === 0) return 0;
  return trials.filter((t) => t.pass).length / trials.length;
}

/**
 * total_cost_usd — sum of observed per-trial spend, rounded to 4 decimals.
 * Non-finite entries count as 0 (runner records unknown cost as 0 + note).
 */
export function totalCost(trials: Pick<TrialResult, "cost_usd">[]): number {
  return round4(trials.reduce((sum, t) => sum + finite(t.cost_usd), 0));
}

/**
 * gates_met — spec: gates are minimum pass@k / pass^k thresholds a task must
 * clear to be considered shipping. Returns null when the task declares no
 * gates (absent or empty object); otherwise true iff every *declared* gate
 * is satisfied (metric >= threshold).
 */
export function gatesMet(
  task: EvalTask,
  s: { pass_at_k: number; pass_caret_k: number }
): boolean | null {
  const gates = task.gates;
  if (!gates || (gates.pass_at_k === undefined && gates.pass_caret_k === undefined)) {
    return null;
  }
  if (gates.pass_at_k !== undefined && !(s.pass_at_k >= gates.pass_at_k)) {
    return false;
  }
  if (gates.pass_caret_k !== undefined && !(s.pass_caret_k >= gates.pass_caret_k)) {
    return false;
  }
  return true;
}

/**
 * Assemble the full TaskRunSummary for one task run from its trials.
 * `runs` records the k actually executed (trials.length — honest even when
 * RunnerOptions.runsOverride diverges from task.runs). total_wall_ms is the
 * sum of per-trial wall clocks. See docs/mycelium-eval-spec.md §Metrics for
 * pass@1 / pass@k / pass^k definitions.
 */
export function buildSummary(
  task: EvalTask,
  timestamp: string,
  trials: TrialResult[],
  frameworkCommit?: string
): TaskRunSummary {
  const pass_at_k = passAtK(trials);
  const pass_caret_k = passCaretK(trials);
  const summary: TaskRunSummary = {
    task_id: task.id,
    lane: task.lane,
    timestamp,
    runs: trials.length,
    trials,
    pass_at_1: passAt1(trials),
    pass_at_k,
    pass_caret_k,
    pass_rate: passRate(trials),
    total_cost_usd: totalCost(trials),
    total_wall_ms: Math.round(trials.reduce((sum, t) => sum + finite(t.wall_ms), 0)),
    gates_met: gatesMet(task, { pass_at_k, pass_caret_k }),
  };
  if (task.pinned_commit !== undefined) summary.pinned_commit = task.pinned_commit;
  if (frameworkCommit !== undefined) summary.framework_commit = frameworkCommit;
  return summary;
}

/**
 * Compare a run against its accepted baseline. Deltas are current − baseline
 * (null when no baseline exists); cost_delta_pct is
 * (current − baseline) / baseline × 100 and null when the baseline cost is 0
 * (division would be meaningless). regression is true only when a baseline
 * exists AND pass@k decreased, pass^k decreased, or cost drifted beyond +20%
 * — the spec's regression tripwire.
 */
export function computeDelta(
  current: TaskRunSummary,
  baseline: EvalBaseline | null
): BaselineDelta {
  if (!baseline) {
    return {
      task_id: current.task_id,
      baseline: null,
      current,
      pass_at_k_delta: null,
      pass_caret_k_delta: null,
      cost_delta_pct: null,
      regression: false,
    };
  }

  const base = baseline.summary;
  const pass_at_k_delta = finite(current.pass_at_k) - finite(base.pass_at_k);
  const pass_caret_k_delta = finite(current.pass_caret_k) - finite(base.pass_caret_k);
  const baseCost = finite(base.total_cost_usd);
  const cost_delta_pct =
    baseCost === 0
      ? null
      : round4(((finite(current.total_cost_usd) - baseCost) / baseCost) * 100);

  const regression =
    pass_at_k_delta < 0 ||
    pass_caret_k_delta < 0 ||
    (cost_delta_pct !== null && cost_delta_pct > 20);

  return {
    task_id: current.task_id,
    baseline,
    current,
    pass_at_k_delta,
    pass_caret_k_delta,
    cost_delta_pct,
    regression,
  };
}
