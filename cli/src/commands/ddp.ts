// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium ddp` — single-call pipeline runner.
// Chains: plant → contracts audit → contracts freeze → sporenet init → cultivate
//         → ledger → harvest → sporenet serve (optional).
//
// Each stage spawns the mycelium binary as a child process. Streams stdio
// in real time. Bails the chain on any non-zero exit.
//
// One stage — `ledger` — is the exception: it may exit 2 (warn-only
// discrepancies), which must NOT halt the pipeline. See `warnOnExit2` below.

import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to this very mycelium CLI's compiled entry point. */
const MYCELIUM_BIN = path.resolve(__dirname, "..", "index.js");

interface Stage {
  name: string;
  args: string[];
  /**
   * When true, a child exit code of 2 is treated as a non-fatal warning
   * (printed loudly, pipeline continues) rather than a halt. Only the
   * `ledger` stage sets this: exit 2 = warn-only discrepancies, exit 1 =
   * critical (still halts). See docs/ledger.md exit-code table.
   */
  warnOnExit2?: boolean;
}

/**
 * The ledger stage hard-requires the same two inputs its command does:
 * `sporenet/state.json` and at least one `.mycelium/events/*.jsonl` telemetry
 * file. Without them the ledger exits 1 at a precondition (not a real critical
 * discrepancy). Telemetry emission is upgrade-gated (the `telemetry-emitter`
 * upgrade), so a cultivation that never enabled it produces no event log — we
 * detect that HERE and skip the stage with a loud warning, rather than letting
 * the precondition exit-1 halt an otherwise-healthy pipeline. Mirrors the
 * guards in cli/src/lib/ledger/collect.ts.
 */
function ledgerInputsPresent(cwd: string): boolean {
  const stateOk = fs.existsSync(path.join(cwd, "sporenet", "state.json"));
  let eventsOk = false;
  try {
    eventsOk = fs
      .readdirSync(path.join(cwd, ".mycelium", "events"))
      .some((f) => f.endsWith(".jsonl"));
  } catch {
    eventsOk = false; // dir may not exist — mirror collect.ts's guard
  }
  return stateOk && eventsOk;
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
      "🌍 Single-call pipeline — plant → audit → freeze → sporenet init → cultivate → ledger → harvest → serve"
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
      "--no-ledger",
      "Skip the post-cultivate ledger reconciliation step (default: on)"
    )
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
      ledger: boolean;      // commander inverts --no-ledger to .ledger = false
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
        // F6: scaffold sporenet/ before cultivate so the dashboard has
        // a meaningful (all-pending) state.json and index.html the moment
        // cultivate kicks off. Cultivate's ensureSporenetState is idempotent
        // — sees state.json exists and skips re-seeding, then writes
        // active/done transitions during the run. Without this stage, the
        // dashboard had no baseline render to show during the multi-hour
        // cultivate phase.
        {
          name: "sporenet init",
          args: ["sporenet", "init"],
        },
        {
          name: "cultivate",
          args: ["cultivate", "-c", opts.concurrency],
        },
      ];

      // Ledger reconciliation — default-on, --no-ledger opts out. Runs after
      // cultivate (which has already done its post-wave merge, so integrated
      // leaves are ancestors of HEAD) and before harvest, so the pipeline can
      // no longer declare victory on unshipped/mismatched work. Exit 1 =
      // critical → halts like any stage; exit 2 = warn-only → prints + continues
      // (warnOnExit2). Skipped with a loud warning if its telemetry/state
      // inputs are absent (see ledgerInputsPresent) — an upgrade-gated event
      // log means a plain cultivation may have nothing to reconcile.
      if (opts.ledger) {
        stages.push({
          name: "ledger",
          args: ["ledger", "--json"],
          warnOnExit2: true,
        });
      }

      stages.push({
        name: "harvest",
        args: ["harvest", "-t", opts.threshold],
      });

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

        // The ledger stage hard-requires state.json + a telemetry event log.
        // Telemetry is upgrade-gated, so a cultivation without the
        // telemetry-emitter upgrade has no event log — the ledger would exit 1
        // at a precondition (not a real critical). Detect that here and skip
        // the stage loudly rather than halting a healthy pipeline.
        if (stage.name === "ledger" && !ledgerInputsPresent(cwd)) {
          console.log(
            chalk.yellow(
              "  ⚠️  Ledger inputs absent (no sporenet/state.json or no .mycelium/events/*.jsonl)."
            )
          );
          console.log(
            chalk.gray(
              "     Telemetry emission is upgrade-gated (telemetry-emitter). Without an event log"
            )
          );
          console.log(
            chalk.gray(
              "     there is nothing to reconcile — skipping ledger and continuing. To enable"
            )
          );
          console.log(
            chalk.gray(
              "     the unshipped-work guarantee, add the telemetry-emitter upgrade to the organism."
            )
          );
          continue;
        }

        const code = await runStage(stage, cwd);

        // warnOnExit2: the ledger's exit 2 = warn-only discrepancies. Print
        // loudly and continue — only exit 1 (critical) halts the pipeline.
        if (code === 2 && stage.warnOnExit2) {
          console.log();
          console.log(
            chalk.yellow(
              `  ⚠️  Stage "${stage.name}" reported warn-only discrepancies (exit 2).`
            )
          );
          console.log(
            chalk.gray(
              "     Not fatal — review the ledger report above; pipeline continues."
            )
          );
          continue;
        }

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
