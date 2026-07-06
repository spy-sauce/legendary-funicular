// Mycelium Framework — VibeSpace LLC — The network provides.
//
// eval/report.ts — summaries, baselines, tables for `mycelium eval`
// (backlog 0.2). Reads run summaries from .mycelium/evals/<task-id>/<ts>/,
// accepts baselines into .mycelium/evals/baselines/<task-id>.json (atomic
// tmp+rename), and renders the human-facing summary table + one-line delta
// for PR pasting. Malformed/missing files → null, never throws — except
// acceptBaseline, which throws when there is no summary to accept.

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import {
  EVAL_OUTPUT_ROOT,
  EVAL_BASELINES_DIR,
  type TaskRunSummary,
  type EvalBaseline,
  type BaselineDelta,
  type TrialResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Directory holding all run dirs for a task: <repoRoot>/.mycelium/evals/<taskId>. */
export function summaryDirFor(repoRoot: string, taskId: string): string {
  return path.join(repoRoot, EVAL_OUTPUT_ROOT, taskId);
}

// ---------------------------------------------------------------------------
// Reading — defensive: bad JSON / missing files / wrong shapes → null.
// ---------------------------------------------------------------------------

function readJson(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function isValidSummary(obj: any): obj is TaskRunSummary {
  return (
    obj !== null &&
    typeof obj === "object" &&
    typeof obj.task_id === "string" &&
    typeof obj.timestamp === "string" &&
    Array.isArray(obj.trials)
  );
}

/**
 * Newest run summary for a task, or null. Run dirs are named by ISO-8601
 * timestamp (colons → dashes), so a lexical sort IS a chronological sort.
 * Dirs without a valid summary.json (crashed run, partial write) are skipped.
 */
export function readLatestSummary(
  repoRoot: string,
  taskId: string
): TaskRunSummary | null {
  const dir = summaryDirFor(repoRoot, taskId);
  let names: string[];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
  names.sort().reverse(); // newest first
  for (const name of names) {
    const parsed = readJson(path.join(dir, name, "summary.json"));
    if (isValidSummary(parsed)) return parsed;
  }
  return null;
}

/** Accepted baseline for a task, or null when none/malformed. */
export function readBaseline(
  repoRoot: string,
  taskId: string
): EvalBaseline | null {
  const parsed = readJson(
    path.join(repoRoot, EVAL_BASELINES_DIR, `${taskId}.json`)
  );
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof parsed.task_id !== "string" ||
    typeof parsed.accepted_at !== "string" ||
    !isValidSummary(parsed.summary)
  ) {
    return null;
  }
  return parsed as EvalBaseline;
}

/**
 * Promote the latest summary to the task's baseline. Explicit-only per spec —
 * a red run never silently moves the baseline. Throws when no valid summary
 * exists. Write is atomic (sibling .tmp then rename, cultivate.ts pattern).
 */
export function acceptBaseline(repoRoot: string, taskId: string): EvalBaseline {
  const summary = readLatestSummary(repoRoot, taskId);
  if (!summary) {
    throw new Error(
      `No run summary found for task "${taskId}" under ${path.join(
        EVAL_OUTPUT_ROOT,
        taskId
      )} — run the eval first, then accept.`
    );
  }
  const baseline: EvalBaseline = {
    task_id: taskId,
    ...(summary.pinned_commit ? { pinned_commit: summary.pinned_commit } : {}),
    accepted_at: new Date().toISOString(),
    summary,
  };
  const baselinesDir = path.join(repoRoot, EVAL_BASELINES_DIR);
  fs.mkdirSync(baselinesDir, { recursive: true });
  const target = path.join(baselinesDir, `${taskId}.json`);
  const tmpPath = target + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(baseline, null, 2));
  fs.renameSync(tmpPath, target);
  return baseline;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function signed(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

function gatesGlyph(gatesMet: boolean | null): string {
  if (gatesMet === null) return chalk.gray("—");
  return gatesMet ? chalk.green("✓") : chalk.red("✗");
}

function trialLine(trial: TrialResult): string {
  const verdict = trial.pass ? chalk.green("✓ pass") : chalk.red("✗ FAIL");
  const parts = [
    verdict,
    `$${trial.cost_usd.toFixed(4)}`,
    `${(trial.wall_ms / 1000).toFixed(1)}s`,
  ];
  if (!trial.pass) {
    const failing = trial.judges
      .filter((j) => !j.pass && !j.skipped)
      .map((j) => j.type);
    if (failing.length) parts.push(chalk.red(`judges: ${failing.join(", ")}`));
    if (trial.budget_exceeded) parts.push(chalk.red("budget exceeded"));
    if (trial.error) parts.push(chalk.red(`error: ${trial.error}`));
  }
  return parts.join(" · ");
}

/**
 * Full summary table for a task run. When a delta is provided, appends
 * baseline comparison rows — red on regression, green when clean.
 */
export function renderSummaryTable(
  summary: TaskRunSummary,
  delta: BaselineDelta | null
): string {
  const table = new Table({
    head: [chalk.magenta("Metric"), chalk.magenta("Value")],
    style: { head: [], border: ["gray"] },
  });

  table.push(
    ["task", chalk.cyan(summary.task_id)],
    ["lane", summary.lane],
    ["runs", String(summary.runs)],
    ["pass@1", String(summary.pass_at_1)],
    ["pass@k", String(summary.pass_at_k)],
    ["pass^k", String(summary.pass_caret_k)],
    ["pass_rate", summary.pass_rate.toFixed(2)],
    ["total cost (USD)", `$${summary.total_cost_usd.toFixed(4)}`],
    ["total wall (s)", (summary.total_wall_ms / 1000).toFixed(1)],
    ["gates_met", gatesGlyph(summary.gates_met)]
  );

  for (const trial of summary.trials) {
    table.push([`trial ${trial.trial}`, trialLine(trial)]);
  }

  if (delta) {
    const tint = delta.regression ? chalk.red : chalk.green;
    table.push(
      [
        "baseline",
        delta.baseline
          ? `accepted ${delta.baseline.accepted_at}`
          : chalk.gray("none"),
      ],
      [
        "Δ pass@k",
        delta.pass_at_k_delta === null
          ? chalk.gray("—")
          : tint(signed(delta.pass_at_k_delta)),
      ],
      [
        "Δ pass^k",
        delta.pass_caret_k_delta === null
          ? chalk.gray("—")
          : tint(signed(delta.pass_caret_k_delta)),
      ],
      [
        "Δ cost",
        delta.cost_delta_pct === null
          ? chalk.gray("—")
          : tint(`${signed(delta.cost_delta_pct, 1)}%`),
      ],
      [
        "verdict",
        delta.regression ? chalk.red("REGRESSION") : chalk.green("clean"),
      ]
    );
  }

  return table.toString();
}

/**
 * One-line delta for PR pasting:
 *   `pass@k +0.00 / pass^k -1.00 / cost +23.4% — REGRESSION`
 * When no baseline exists, says so instead of rendering empty deltas.
 */
export function renderDeltaLine(delta: BaselineDelta): string {
  if (!delta.baseline) {
    return chalk.gray(
      `${delta.task_id}: no baseline — accept one to enable regression deltas`
    );
  }
  const passAtK =
    delta.pass_at_k_delta === null
      ? "pass@k —"
      : `pass@k ${signed(delta.pass_at_k_delta)}`;
  const passCaretK =
    delta.pass_caret_k_delta === null
      ? "pass^k —"
      : `pass^k ${signed(delta.pass_caret_k_delta)}`;
  const cost =
    delta.cost_delta_pct === null
      ? "cost —"
      : `cost ${signed(delta.cost_delta_pct, 1)}%`;
  const verdict = delta.regression
    ? chalk.red("REGRESSION")
    : chalk.green("clean");
  return `${passAtK} / ${passCaretK} / ${cost} — ${verdict}`;
}
