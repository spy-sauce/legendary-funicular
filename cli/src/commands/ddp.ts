// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium ddp` — single-call pipeline runner.
// Chains: plant → contracts audit → contracts freeze → cultivate → harvest
//         → sporenet serve (optional).
//
// Each stage spawns the mycelium binary as a child process. Streams stdio
// in real time. Bails the chain on any non-zero exit.

import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to this very mycelium CLI's compiled entry point. */
const MYCELIUM_BIN = path.resolve(__dirname, "..", "index.js");

interface Stage {
  name: string;
  args: string[];
}

/** Spawn `node MYCELIUM_BIN <args...>` and wait. Resolves with exit code. */
function runStage(stage: Stage, cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("node", [MYCELIUM_BIN, ...stage.args], {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(chalk.red(`  ❌ Failed to spawn ${stage.name}: ${err.message}`));
      resolve(1);
    });
  });
}

export function registerDdpCommand(program: Command): void {
  program
    .command("ddp")
    .description(
      "🌍 Single-call pipeline — plant → audit → freeze → cultivate → harvest → serve"
    )
    .requiredOption("--brief <path>", "Path to brief.md")
    .requiredOption("-s, --stack <name>", "Stack preset (passed to plant)")
    .requiredOption(
      "-S, --security <tier>",
      "Security tier: demo, startup, regulated (passed to plant)"
    )
    .option("-c, --concurrency <n>", "Cultivate concurrency", "30")
    .option("-t, --threshold <n>", "Harvest threshold (0-1)", "0.8")
    .option("-p, --port <n>", "Sporenet serve port", "4173")
    .option("-d, --dir <dir>", "Target directory", process.cwd())
    .option("--no-serve", "Skip the sporenet serve step at the end")
    .option(
      "--skip-audit",
      "Pass --skip-audit to freeze (emergency bypass)",
      false
    )
    .option("--dry-run", "Print the chain without executing", false)
    .action(async (opts: {
      brief: string;
      stack: string;
      security: string;
      concurrency: string;
      threshold: string;
      port: string;
      dir: string;
      serve: boolean;       // commander inverts --no-serve to .serve = false
      skipAudit: boolean;
      dryRun: boolean;
    }) => {
      const cwd = path.resolve(opts.dir);

      const stages: Stage[] = [
        {
          name: "plant",
          args: [
            "plant",
            opts.brief,
            "--stack",
            opts.stack,
            "--security",
            opts.security,
          ],
        },
        {
          name: "contracts audit",
          args: ["contracts", "audit"],
        },
        {
          name: "contracts freeze",
          args: opts.skipAudit
            ? ["contracts", "freeze", "--skip-audit"]
            : ["contracts", "freeze"],
        },
        {
          name: "cultivate",
          args: ["cultivate", "-c", opts.concurrency],
        },
        {
          name: "harvest",
          args: ["harvest", "-t", opts.threshold],
        },
      ];

      if (opts.serve) {
        stages.push({
          name: "sporenet serve",
          args: ["sporenet", "serve", "--port", opts.port],
        });
      }

      // ── Banner ────────────────────────────────────────────────
      console.log(
        boxen(
          chalk.magentaBright.bold("🌍 DDP — full pipeline\n\n") +
            chalk.gray("Brief:    ") + chalk.yellow(opts.brief) + "\n" +
            chalk.gray("Stack:    ") + chalk.cyan(opts.stack) + "\n" +
            chalk.gray("Security: ") + chalk.cyan(opts.security) + "\n" +
            chalk.gray("Target:   ") + chalk.yellow(cwd) + "\n" +
            chalk.gray("Stages:   ") +
            chalk.white(stages.map((s) => s.name).join(" → ")),
          {
            padding: 1,
            borderStyle: "round",
            borderColor: "magenta",
          }
        )
      );

      // ── Dry run ───────────────────────────────────────────────
      if (opts.dryRun) {
        console.log(chalk.yellow.bold("  ⚠️  DRY RUN — no stages will execute.\n"));
        for (const [i, stage] of stages.entries()) {
          console.log(
            chalk.gray(`  ${i + 1}. `) +
              chalk.cyan(stage.name) +
              chalk.gray("  →  mycelium " + stage.args.join(" "))
          );
        }
        console.log();
        return;
      }

      // ── Execute ───────────────────────────────────────────────
      for (const [i, stage] of stages.entries()) {
        console.log();
        console.log(
          chalk.gray(`── Stage ${i + 1}/${stages.length}: `) +
            chalk.cyan.bold(stage.name) +
            chalk.gray(" ──")
        );
        const code = await runStage(stage, cwd);
        if (code !== 0) {
          console.log();
          console.log(
            chalk.red(`  ❌ Stage "${stage.name}" exited with code ${code}.`)
          );
          console.log(
            chalk.gray(
              `     Pipeline halted at stage ${i + 1}/${stages.length}.`
            )
          );
          console.log(
            chalk.gray(
              "     Resume manually after fixing — the prior stages' output persists."
            )
          );
          process.exit(code);
        }
      }

      // ── Done ──────────────────────────────────────────────────
      console.log();
      console.log(
        chalk.greenBright.bold(
          "  🍄 DDP complete — the organism is alive. The network provides. 🌿"
        )
      );
    });
}
