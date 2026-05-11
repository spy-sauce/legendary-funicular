// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium audit-run` — automated quality assurance for cultivations.
//
// This file implements the CLI surface per NUTRIENTS §7:
//   - audit-run (main command) — run testers against a cultivation
//   - audit-run scaffold-tester <biome> — emit a HYPHA-TEST stub from a biome HYPHA
//
// Subcommands:
//   scaffold-tester <biome>  — emit hyphae/HYPHA-TEST-<biome>.md stub from biome HYPHA
//
// Exit codes per NUTRIENTS §7:
//   0: clean (or autofix succeeded — zero criticals at termination)
//   1: findings present in non-autofix mode
//   2: autofix exhausted with criticals remaining (max-iter or budget)
//   3: tester_error count > 0 (operator concern)

import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import {
  scaffoldTester,
  ScaffoldTesterError,
} from "../lib/audit/scaffold-tester.js";
import { runAuditOrchestrator } from "../lib/audit/orchestrator.js";

export function registerAuditRunCommand(program: Command): void {
  const auditRun = program
    .command("audit-run")
    .description(
      "🔬 Automated quality assurance — run testers against a cultivation"
    )
    // ────────────────────────────────────────────────────────────────────────
    // Flags per NUTRIENTS §7 — frozen CLI surface
    // ────────────────────────────────────────────────────────────────────────
    .option(
      "--autofix",
      "Enter heal-loop to auto-fix defects (default: off)",
      false
    )
    .option(
      "--max-iterations <n>",
      "Maximum autofix iterations (default: 3)",
      (v) => parseInt(v, 10),
      3
    )
    .option(
      "--only-tester <tester_id>",
      "Run only the specified tester (for debugging)"
    )
    .option(
      "--against <ref>",
      "Baseline findings.jsonl path or git ref for regression diff"
    )
    .option(
      "--concurrency <n>",
      "Max simultaneous tester sessions (default: from yaml or 30)",
      (v) => parseInt(v, 10)
    )
    .option(
      "--no-serve",
      "Skip sporenet state.json writes (sporenet integration disabled)"
    )
    .option(
      "--autofix-branch <name>",
      "Branch name for autofix commits (sub-organism mode; default: commit-on-top)"
    )
    .option(
      "--max-budget-usd <n>",
      "Cost cap for the audit run in USD",
      (v) => parseFloat(v)
    )
    .option(
      "--dry-run",
      "Print execution plan without spawning sessions",
      false
    )
    .action(async (opts) => {
      // Map Commander options to orchestrator options
      // Note: --no-serve inverts to opts.serve = false
      const cultivationDir = process.cwd();
      const concurrency = opts.concurrency ?? undefined; // Let orchestrator resolve default

      console.log();
      console.log(
        chalk.magentaBright.bold("  🔬 Audit Run ") +
          chalk.gray("— automated quality assurance")
      );
      console.log();

      try {
        const result = await runAuditOrchestrator({
          cultivationDir,
          autofix: opts.autofix,
          maxIterations: opts.maxIterations,
          onlyTester: opts.onlyTester,
          againstRef: opts.against,
          concurrency: concurrency ?? 30,
          noServe: !opts.serve, // Commander inverts --no-serve to opts.serve
          autofixBranch: opts.autofixBranch,
          maxBudgetUsd: opts.maxBudgetUsd,
          dryRun: opts.dryRun,
        });

        process.exit(result.exitCode);
      } catch (err) {
        console.error(chalk.red("  ❌ Audit run failed:"), err);
        process.exit(3); // tester_error exit code
      }
    });

  // ────────────────────────────────────────────────────────────────────────────
  // audit-run scaffold-tester <biome>
  // ────────────────────────────────────────────────────────────────────────────
  //
  // Emits a HYPHA-TEST-<biome>.md stub pre-filled from the biome's HYPHA spec.
  // Operator edits the Assertions, Repro recipe, and Suggested fix sections.
  //
  // Per NUTRIENTS §6 (HYPHA-TEST-*.md authoring schema) and §7 (CLI surface).

  auditRun
    .command("scaffold-tester <biome>")
    .description(
      "📝 Emit a HYPHA-TEST stub from an existing biome HYPHA — pre-fills scope, inputs, and TODO assertions"
    )
    .option(
      "-d, --dir <dir>",
      "Cultivation directory (must have hyphae/)",
      process.cwd()
    )
    // TODO: .option("--force", "Overwrite existing HYPHA-TEST file", false)
    .action((biome: string, opts) => {
      const cultivationDir = path.resolve(opts.dir);

      console.log();
      console.log(
        chalk.magentaBright.bold("  📝 Scaffolding tester for biome ") +
          chalk.white.bold(biome)
      );
      console.log(
        chalk.gray("  Cultivation: ") + chalk.yellow(cultivationDir)
      );
      console.log();

      try {
        const outputPath = scaffoldTester(cultivationDir, biome, {
          force: false, // TODO: opts.force when --force is exposed
        });

        console.log(
          chalk.greenBright("  ✔ Tester HYPHA scaffolded: ") +
            chalk.yellow(path.relative(cultivationDir, outputPath))
        );
        console.log();
        console.log(chalk.gray("  Next steps:"));
        console.log(
          chalk.gray("    1. ") +
            chalk.white("Edit ") +
            chalk.yellow("## Assertions") +
            chalk.white(" — convert TODOs into testable conditions")
        );
        console.log(
          chalk.gray("    2. ") +
            chalk.white("Fill in ") +
            chalk.yellow("## Repro recipe") +
            chalk.white(" — steps to reproduce failures")
        );
        console.log(
          chalk.gray("    3. ") +
            chalk.white("Fill in ") +
            chalk.yellow("## Suggested fix template")
        );
        console.log(
          chalk.gray("    4. ") +
            chalk.cyan("mycelium audit-run --only-tester tester." + biome) +
            chalk.white(" to test")
        );
        console.log();
      } catch (err) {
        if (err instanceof ScaffoldTesterError) {
          console.log(chalk.red("  ❌ " + err.message));
          process.exit(1);
        }
        throw err;
      }
    });

}
