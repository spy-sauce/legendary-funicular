// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium ledger` — post-cultivate run-reconciliation report. Cross-checks
// what each spawned leaf agent CLAIMED (sporenet/state.json) against
// git / filesystem / telemetry TRUTH, and renders the discrepancies legibly.
//
// Doc: docs/ledger.md. Data contract: ../lib/ledger/types.ts.
// NOT related to `mycelium audit-run` (the QA-testers subsystem) — this is the
// bookkeeping reconciliation of a run's claims vs observable reality.
//
// Exit codes:
//   0  clean, or info-only discrepancies
//   1  any critical discrepancy — OR a precondition failure (no state.json,
//      no event files, unknown --run)
//   2  warn-only discrepancies
//
// Truth stores degrade independently: a missing store is reported and skipped,
// never a crash. The two hard preconditions are state.json + at least one
// event file — without them there is nothing to reconcile.

import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import type { GitLeafTruth, LedgerAvailability } from "../lib/ledger/types.js";
import {
  selectEventLog,
  loadEvents,
  loadState,
  stateJsonPath,
  isGitRepo,
  gitTruthForLeaf,
} from "../lib/ledger/collect.js";
import { reconcile } from "../lib/ledger/reconcile.js";
import { renderLedger } from "../lib/ledger/render.js";

export function registerLedgerCommand(program: Command): void {
  program
    .command("ledger")
    .description(
      "📒 Reconcile a cultivate run — leaf claims vs git/fs/telemetry truth"
    )
    .option("--run <run_id>", "Reconcile this specific run id (default: newest)")
    .option("--organism <name>", "Prefer event logs for this organism")
    .option("--json", "Also write the full report to .mycelium/ledger/<run_id>.json", false)
    .option("--dir <path>", "Base directory to reconcile (default: cwd)")
    .action(async (opts) => {
      const baseDir = path.resolve(opts.dir ?? process.cwd());

      // ── Load the three truth stores (single baseDir drives all of them) ──
      const skipped: string[] = [];

      // Telemetry
      const selection = selectEventLog(baseDir, {
        runId: opts.run,
        organism: opts.organism,
      });
      if (opts.run && !selection) {
        console.error(
          chalk.red(
            `  ❌ No event log for run id "${opts.run}" under ${path.join(
              baseDir,
              ".mycelium",
              "events"
            )}`
          )
        );
        process.exit(1);
      }
      const events = selection ? loadEvents(selection.path) : null;
      const telemetryAvailable = events !== null && events.length > 0;
      if (!selection) {
        skipped.push(
          "telemetry: no event files found (.mycelium/events/) — cost, token, and status-vs-event checks skipped"
        );
      }

      // State
      const state = loadState(baseDir);
      const stateAvailable = state !== null;

      // ── Hard preconditions ──────────────────────────────────────────────
      if (!stateAvailable) {
        console.error(
          chalk.red(
            `  ❌ No readable sporenet/state.json at ${stateJsonPath(baseDir)}`
          )
        );
        console.error(
          chalk.gray(
            "     The ledger reconciles a run's state.json against truth; without it there is nothing to reconcile."
          )
        );
        process.exit(1);
      }
      if (!selection) {
        console.error(
          chalk.red(
            `  ❌ No telemetry event files under ${path.join(
              baseDir,
              ".mycelium",
              "events"
            )}`
          )
        );
        console.error(
          chalk.gray(
            "     A run's event log is required to reconcile claims against telemetry truth."
          )
        );
        process.exit(1);
      }

      // Git
      const gitAvailable = isGitRepo(baseDir);
      let gitTruth: Map<string, GitLeafTruth> | null = null;
      if (gitAvailable) {
        gitTruth = new Map();
        for (const leaf of state!.leaves) {
          gitTruth.set(
            leaf.id,
            gitTruthForLeaf(baseDir, leaf.id, leaf.commit)
          );
        }
      } else {
        skipped.push(
          `git: ${baseDir} is not a git work tree — commit, file-count, and integration checks skipped`
        );
      }

      const availability: LedgerAvailability = {
        telemetry: telemetryAvailable,
        state: stateAvailable,
        git: gitAvailable,
        skipped,
      };

      // ── Reconcile (pure) ─────────────────────────────────────────────────
      const report = reconcile({
        runId: selection.run_id,
        organism: opts.organism ?? state!.organism ?? null,
        eventLogPath: selection.path,
        statePath: stateJsonPath(baseDir),
        events,
        state,
        gitTruth,
        availability,
      });

      // ── --json: write the full report, atomic tmp+rename ─────────────────
      if (opts.json) {
        const outDir = path.join(baseDir, ".mycelium", "ledger");
        const outPath = path.join(outDir, `${selection.run_id}.json`);
        try {
          fs.mkdirSync(outDir, { recursive: true });
          const tmp = outPath + ".tmp";
          fs.writeFileSync(tmp, JSON.stringify(report, null, 2));
          fs.renameSync(tmp, outPath);
          console.log(renderLedger(report));
          console.log(chalk.gray(`  📄 report written: ${outPath}`));
          console.log();
        } catch (err) {
          console.log(renderLedger(report));
          console.error(
            chalk.yellow(
              `  ⚠ could not write JSON report: ${
                err instanceof Error ? err.message : err
              }`
            )
          );
        }
      } else {
        console.log(renderLedger(report));
      }

      process.exit(report.exit_code);
    });
}
