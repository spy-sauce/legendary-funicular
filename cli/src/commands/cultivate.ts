// Mycelium Framework — VibeSpace LLC — The network provides.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

interface Agent {
  id: string;
  scope: string;
  branch: string;
  blocked_by: string[];
  blocks: string[];
  capabilities: string[];
}

interface TimelinePhase {
  hours: string;
  active: string[];
  description: string;
}

export function registerCultivateCommand(program: Command): void {
  program
    .command("cultivate")
    .description("🌍 Start the full organism — bring the mycelium to life")
    .option("--dry-run", "Simulate without executing agents", false)
    .action(async (opts) => {
      const configPath = path.join(process.cwd(), "mycelium.yaml");
      if (!fs.existsSync(configPath)) {
        console.log(
          chalk.red("  ❌ No mycelium.yaml found. Run ") +
            chalk.cyan("mycelium init") +
            chalk.red(" first.")
        );
        return;
      }

      const raw = fs.readFileSync(configPath, "utf-8");
      const config = YAML.parse(raw);
      const agents: Agent[] = config.agents || [];
      const organism = config.organism || { name: "unknown" };

      if (agents.length === 0) {
        console.log(
          chalk.yellow("  🌑 No agents to cultivate. Create some first with ") +
            chalk.cyan("mycelium agent create <name>")
        );
        return;
      }

      // ── Startup sequence ──────────────────────────────────

      console.log();
      console.log(chalk.magentaBright.bold("  ╔══════════════════════════════════════════╗"));
      console.log(chalk.magentaBright.bold("  ║                                          ║"));
      console.log(chalk.magentaBright.bold("  ║   🌍  CULTIVATING THE ORGANISM  🌍        ║"));
      console.log(chalk.magentaBright.bold("  ║                                          ║"));
      console.log(chalk.magentaBright.bold("  ╚══════════════════════════════════════════╝"));
      console.log();

      if (opts.dryRun) {
        console.log(chalk.yellow.bold("  ⚠️  DRY RUN MODE — no agents will be executed\n"));
      }

      console.log(
        chalk.gray("  Organism: ") +
          chalk.white.bold(organism.name) +
          chalk.gray(" | Target: ") +
          chalk.cyan(organism.ship_target || "unset") +
          chalk.gray(" | Agents: ") +
          chalk.cyan(String(agents.length))
      );
      console.log();

      // Phase 1: Reading configuration
      const spinnerConfig = ora({
        text: chalk.cyan("Reading organism DNA from mycelium.yaml..."),
        spinner: "earth",
      }).start();
      await sleep(500);
      spinnerConfig.succeed(chalk.green("Organism DNA loaded"));

      // Phase 2: Validating contracts
      const spinnerContracts = ora({
        text: chalk.cyan("Validating shared contracts..."),
        spinner: "dots",
      }).start();
      await sleep(400);

      const contracts = config.contracts || [];
      const frozenCount = contracts.filter(
        (c: any) => typeof c === "object" && c.frozen
      ).length;

      spinnerContracts.succeed(
        chalk.green(
          `${contracts.length} contract(s) validated` +
            (frozenCount > 0 ? chalk.gray(` (${frozenCount} frozen)`) : "")
        )
      );

      // Phase 3: Resolving dependency graph
      const spinnerDeps = ora({
        text: chalk.cyan("Resolving dependency graph..."),
        spinner: "dots",
      }).start();
      await sleep(400);

      const layers = buildLayers(agents);
      spinnerDeps.succeed(
        chalk.green(
          `Dependency graph resolved — ${layers.length} growth phase(s) identified`
        )
      );

      // Phase 4: Initializing agents
      console.log();
      console.log(
        chalk.magentaBright("  🧬 Initializing agents...\n")
      );

      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        console.log(
          chalk.gray(`  ── Phase ${i + 1} `) +
            chalk.gray("─".repeat(40))
        );

        for (const agent of layer) {
          const spinner = ora({
            text: chalk.cyan(
              `Germinating ${chalk.white.bold(agent.id)}` +
                chalk.gray(` (${agent.scope})`)
            ),
            spinner: "dots",
            indent: 4,
          }).start();

          await sleep(250 + Math.random() * 200);

          const blockedStr =
            agent.blocked_by.length > 0
              ? chalk.gray(` [after: ${agent.blocked_by.join(", ")}]`)
              : "";

          spinner.succeed(
            chalk.green(`${agent.id} `) +
              chalk.gray("→ ") +
              chalk.cyan("HYPHAL_GROWTH") +
              blockedStr
          );
        }

        console.log();
      }

      // Phase 5: Distributing contracts
      if (contracts.length > 0) {
        const spinnerDistribute = ora({
          text: chalk.cyan("Distributing contracts to all agents..."),
          spinner: "dots",
        }).start();
        await sleep(400);
        spinnerDistribute.succeed(
          chalk.green(`Contracts distributed to ${agents.length} agent(s)`)
        );
        console.log();
      }

      // Phase 6: Starting health monitoring
      const spinnerHealth = ora({
        text: chalk.cyan("Starting health pulse monitor..."),
        spinner: "hearts",
      }).start();
      await sleep(400);
      spinnerHealth.succeed(
        chalk.green(
          `Health pulse active — interval: ${organism.health_pulse_interval || 30}s`
        )
      );

      // Phase 7: Timeline display (if present)
      const timeline = config.timeline;
      if (timeline && timeline.parallel_phases) {
        console.log();
        console.log(chalk.magentaBright("  📅 Growth Timeline:\n"));

        for (const phase of timeline.parallel_phases as TimelinePhase[]) {
          const activeStr = phase.active
            .map((id: string) => chalk.cyan(id))
            .join(chalk.gray(", "));

          console.log(
            chalk.yellow(`    ⏱  ${phase.hours}h`) +
              chalk.gray(" — ") +
              chalk.white(phase.description)
          );
          console.log(
            chalk.gray("       Active: ") + activeStr
          );
        }
      }

      // ── Final output ──────────────────────────────────────

      console.log();
      console.log(chalk.gray("  " + "═".repeat(50)));
      console.log();
      console.log(
        chalk.greenBright.bold("  🍄 The organism is alive!")
      );
      console.log();
      console.log(
        chalk.gray("  ") +
          chalk.white(`${agents.length} agents growing`) +
          chalk.gray(" across ") +
          chalk.white(`${layers.length} parallel phases`)
      );
      console.log(
        chalk.gray("  Harvest threshold: ") +
          chalk.cyan(
            `${Math.round((organism.harvest_threshold || 0.8) * 100)}%`
          )
      );
      console.log();
      console.log(
        chalk.gray("  Commands:")
      );
      console.log(
        chalk.gray("    ") +
          chalk.cyan("mycelium network status") +
          chalk.gray("    — check agent states")
      );
      console.log(
        chalk.gray("    ") +
          chalk.cyan("mycelium flow") +
          chalk.gray("               — trigger nutrient distribution")
      );
      console.log(
        chalk.gray("    ") +
          chalk.cyan("mycelium harvest") +
          chalk.gray("            — collect deliverables")
      );
      console.log();
      console.log(
        chalk.magentaBright.italic(
          "  The mycelium grows. The network provides. 🌿"
        )
      );
      console.log();
    });
}

function buildLayers(agents: Agent[]): Agent[][] {
  const placed = new Set<string>();
  const layers: Agent[][] = [];
  let remaining = [...agents];

  while (remaining.length > 0) {
    const layer = remaining.filter((a) =>
      (a.blocked_by || []).every((dep) => placed.has(dep))
    );

    if (layer.length === 0) {
      layers.push(remaining);
      break;
    }

    layers.push(layer);
    for (const a of layer) placed.add(a.id);
    remaining = remaining.filter((a) => !placed.has(a.id));
  }

  return layers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
