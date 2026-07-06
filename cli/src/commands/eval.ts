// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium eval` — reliability evals for the engine (backlog 0.2).
// Spec: docs/mycelium-eval-spec.md. Data contract: ../lib/eval/types.ts (frozen).
//
// Subcommands:
//   eval run [--task <id>] [--runs <n>] [--concurrency <n>] [--tasks-dir <dir>] [--keep]
//       — run every task (or one) k times, judge each trial, print pass@k /
//         pass^k, and compare against the accepted baseline. Baselines are
//         NEVER auto-accepted — silent baseline updates are a spec
//         anti-pattern. Promotion is `eval baseline accept <task-id>`.
//   eval report [--task <id>] [--json]
//       — latest stored summary per task + delta vs baseline. No new trials.
//   eval baseline accept <task-id>
//       — promote the latest run to the accepted baseline. Explicit
//         human-in-the-loop step by design.
//
// Exit codes (eval run):
//   0: every task's gates met (or no gates declared), no baseline regression
//   1: any task with gates_met === false, a baseline regression, an infra
//      error on ALL trials of a task, or task validation/load errors
//   130: interrupted (SIGINT/SIGTERM) after closing active eval sessions

import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import { EVAL_TASKS_DIR, EvalTaskError } from "../lib/eval/types.js";
import type { BaselineDelta, EvalTask, TaskRunSummary } from "../lib/eval/types.js";
import { loadAllTasks } from "../lib/eval/tasks.js";
import { runTask, closeAllEvalSessions } from "../lib/eval/runner.js";
import { computeDelta } from "../lib/eval/metrics.js";
import {
  readBaseline,
  acceptBaseline,
  readLatestSummary,
  renderSummaryTable,
  renderDeltaLine,
} from "../lib/eval/report.js";

// ── Shutdown hook — mirror cultivate.ts / audit-run session discipline ─────

let evalSigintInstalled = false;
function installEvalShutdownHook(): void {
  if (evalSigintInstalled) return;
  evalSigintInstalled = true;
  const shutdown = async () => {
    console.log();
    console.log(
      chalk.yellow.bold("  ✋ Interrupt received — closing active eval session(s)...")
    );
    await closeAllEvalSessions();
    console.log(chalk.yellow("  🍂 Sessions closed. Exiting."));
    process.exit(130);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Print every validation problem (EvalTaskError carries all of them), exit 1. */
function exitOnTaskLoadError(err: unknown): never {
  if (err instanceof EvalTaskError) {
    console.error(chalk.red("  ❌ Eval task validation failed:"));
    const problems = err.problems.length ? err.problems : [err.message];
    for (const p of problems) {
      console.error(chalk.red(`     • ${p}`));
    }
  } else {
    console.error(
      chalk.red("  ❌ Failed to load eval tasks:"),
      err instanceof Error ? err.message : err
    );
  }
  process.exit(1);
}

/** Filter to a single task by id when --task is given; exit 1 on unknown id. */
function selectTasks(tasks: EvalTask[], taskId: string | undefined): EvalTask[] {
  if (!taskId) return tasks;
  const matched = tasks.filter((t) => t.id === taskId);
  if (matched.length === 0) {
    console.error(chalk.red(`  ❌ Unknown task id: ${taskId}`));
    console.error(
      chalk.gray(
        `     Available: ${tasks.map((t) => t.id).join(", ") || "(none)"}`
      )
    );
    process.exit(1);
  }
  return matched;
}

/** Every trial hit an infra error (spawn failure, timeout) — nothing completed. */
function allTrialsInfraErrored(summary: TaskRunSummary): boolean {
  return (
    summary.trials.length > 0 &&
    summary.trials.every((t) => t.error !== undefined)
  );
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerEvalCommand(program: Command): void {
  const evalCmd = program
    .command("eval")
    .description(
      "🧪 Reliability evals — pass@k / pass^k baselines for the engine"
    );

  // ──────────────────────────────────────────────────────────────────────────
  // eval run
  // ──────────────────────────────────────────────────────────────────────────

  evalCmd
    .command("run")
    .description(
      "🧪 Run eval tasks k times each, judge trials, compare vs accepted baseline"
    )
    .option("--task <id>", "Run only the task with this id")
    .option(
      "--runs <n>",
      "Override trials per task (k; task yaml default otherwise)",
      (v) => parseInt(v, 10)
    )
    .option(
      "--concurrency <n>",
      "Parallel trials (default: 1 — SDK rate-limit discipline)",
      (v) => parseInt(v, 10)
    )
    .option(
      "--tasks-dir <dir>",
      `Task definitions directory (default: ${EVAL_TASKS_DIR})`
    )
    .option(
      "--keep",
      "Keep per-trial dirs on disk (default: on — .mycelium/evals/ is the audit trail)",
      true
    )
    .action(async (opts) => {
      const repoRoot = process.cwd();
      const tasksDir = path.resolve(repoRoot, opts.tasksDir ?? EVAL_TASKS_DIR);

      console.log();
      console.log(
        chalk.magentaBright.bold("  🧪 Eval Run ") +
          chalk.gray("— pass@k / pass^k reliability baselines")
      );
      console.log(chalk.gray("  Tasks: ") + chalk.yellow(tasksDir));
      console.log();

      let tasks: EvalTask[];
      try {
        tasks = await loadAllTasks(tasksDir);
      } catch (err) {
        exitOnTaskLoadError(err);
      }
      if (tasks.length === 0) {
        console.error(chalk.yellow(`  ⚠ No eval tasks found in ${tasksDir}`));
        process.exit(1);
      }

      const selected = selectTasks(tasks, opts.task);
      installEvalShutdownHook();

      let exitCode = 0;
      for (const task of selected) {
        const k = opts.runs ?? task.runs;
        console.log(
          chalk.cyanBright.bold(`  ── ${task.id} `) +
            chalk.gray(`lane ${task.lane} · k=${k}`)
        );

        try {
          const summary = await runTask(task, {
            repoRoot,
            runsOverride: opts.runs,
            concurrency: opts.concurrency,
            keepTrialDirs: opts.keep ?? true,
          });

          const baseline = await readBaseline(repoRoot, task.id);
          const delta = computeDelta(summary, baseline);

          console.log(renderSummaryTable(summary, delta));
          if (delta.baseline) {
            console.log(renderDeltaLine(delta));
          } else {
            // Baselines are NEVER auto-accepted (silent baseline updates are
            // a spec anti-pattern) — surface the explicit promotion path.
            console.log(
              chalk.gray(
                `  (no baseline — accept one with: mycelium eval baseline accept ${task.id})`
              )
            );
          }
          console.log();

          if (
            summary.gates_met === false ||
            delta.regression === true ||
            allTrialsInfraErrored(summary)
          ) {
            exitCode = 1;
          }
        } catch (err) {
          // Per-task infra failure — report loudly, keep evaluating the rest.
          console.error(chalk.red(`  ❌ ${task.id} eval failed:`), err);
          console.log();
          exitCode = 1;
        }
      }

      process.exit(exitCode);
    });

  // ──────────────────────────────────────────────────────────────────────────
  // eval report
  // ──────────────────────────────────────────────────────────────────────────

  evalCmd
    .command("report")
    .description(
      "📊 Latest stored summary per task + delta vs accepted baseline (no new trials)"
    )
    .option("--task <id>", "Report only the task with this id")
    .option("--json", "Print raw JSON instead of the rendered tables", false)
    .action(async (opts) => {
      const repoRoot = process.cwd();

      let tasks: EvalTask[];
      try {
        tasks = await loadAllTasks(path.resolve(repoRoot, EVAL_TASKS_DIR));
      } catch (err) {
        exitOnTaskLoadError(err);
      }
      const selected = selectTasks(tasks, opts.task);

      const records: Array<{
        task_id: string;
        summary: TaskRunSummary | null;
        delta: BaselineDelta | null;
      }> = [];
      for (const task of selected) {
        const summary = await readLatestSummary(repoRoot, task.id);
        if (!summary) {
          records.push({ task_id: task.id, summary: null, delta: null });
          continue;
        }
        const baseline = await readBaseline(repoRoot, task.id);
        records.push({
          task_id: task.id,
          summary,
          delta: computeDelta(summary, baseline),
        });
      }

      if (opts.json) {
        // NOTE: the index.ts preAction hook prints the boxen banner to stdout
        // before this JSON, so piped output is NOT pure JSON. For machine
        // consumption, read the summary.json files under .mycelium/evals/
        // directly instead of piping this command.
        console.log(JSON.stringify(records, null, 2));
        process.exit(0);
      }

      console.log();
      console.log(
        chalk.magentaBright.bold("  📊 Eval Report ") +
          chalk.gray("— latest run vs accepted baseline")
      );
      console.log();

      for (const rec of records) {
        if (!rec.summary || !rec.delta) {
          console.log(
            chalk.gray(
              `  ── ${rec.task_id} — no runs yet (run: mycelium eval run --task ${rec.task_id})`
            )
          );
          console.log();
          continue;
        }
        console.log(renderSummaryTable(rec.summary, rec.delta));
        if (rec.delta.baseline) {
          console.log(renderDeltaLine(rec.delta));
        } else {
          console.log(
            chalk.gray(
              `  (no baseline — accept one with: mycelium eval baseline accept ${rec.task_id})`
            )
          );
        }
        console.log();
      }

      process.exit(0);
    });

  // ──────────────────────────────────────────────────────────────────────────
  // eval baseline accept <task-id>
  // ──────────────────────────────────────────────────────────────────────────
  //
  // The ONLY way a baseline changes. Explicit human-in-the-loop step by
  // design — `eval run` compares but never promotes.

  const baselineCmd = evalCmd
    .command("baseline")
    .description("📌 Manage accepted eval baselines");

  baselineCmd
    .command("accept <task-id>")
    .description(
      "📌 Promote the latest run of <task-id> to the accepted baseline — explicit human-in-the-loop step"
    )
    .action(async (taskId: string) => {
      const repoRoot = process.cwd();

      console.log();
      console.log(
        chalk.magentaBright.bold("  📌 Baseline Accept ") +
          chalk.white.bold(taskId)
      );
      console.log();

      try {
        const baseline = await acceptBaseline(repoRoot, taskId);
        const s = baseline.summary;
        console.log(
          chalk.greenBright("  ✔ Baseline accepted ") +
            chalk.gray(`at ${baseline.accepted_at} — `) +
            chalk.white(
              `pass@k ${s.pass_at_k} · pass^k ${s.pass_caret_k} · ` +
                `pass_rate ${s.pass_rate.toFixed(2)} · ` +
                `$${s.total_cost_usd.toFixed(2)} · ${s.runs} trial(s)`
            )
        );
        console.log();
        process.exit(0);
      } catch (err) {
        console.error(
          chalk.red("  ❌ Baseline accept failed:"),
          err instanceof Error ? err.message : err
        );
        process.exit(1);
      }
    });
}
