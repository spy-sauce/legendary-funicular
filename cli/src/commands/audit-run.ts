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

import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import {
  scaffoldTester,
  ScaffoldTesterError,
} from "../lib/audit/scaffold-tester.js";

export function registerAuditRunCommand(program: Command): void {
  const auditRun = program
    .command("audit-run")
    .description(
      "🔬 Automated quality assurance — run testers against a cultivation"
    );

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

  // ────────────────────────────────────────────────────────────────────────────
  // Main audit-run command (placeholder — wired by audit.cli.command leaf)
  // ────────────────────────────────────────────────────────────────────────────
  //
  // The main audit-run action is implemented by the audit.cli.command and
  // audit.cli.orchestrator leaves. This file provides the subcommand registration
  // structure; the main action handler will be added by the sibling leaf.
  //
  // Per NUTRIENTS §7, the full flag surface is:
  //   --autofix, --max-iterations, --only-tester, --against, --concurrency,
  //   --no-serve, --autofix-branch, --max-budget-usd, --dry-run

  // Note: The main audit-run action with all flags will be wired by audit.cli.command.
  // For now, running `mycelium audit-run` without a subcommand shows help.
}
