// Mycelium Framework — VibeSpace LLC — The network provides.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import Table from "cli-table3";
import { rollupFromJsonl, type CostRollup } from "../lib/telemetry/cost-rollup.js";

interface Agent {
  id: string;
  scope: string;
  branch: string;
  blocked_by: string[];
  blocks: string[];
  state?: string;
}

export function registerHarvestCommand(program: Command): void {
  program
    .command("harvest")
    .description(
      "🧺 Collect all FRUIT_READY deliverables from the organism"
    )
    .option(
      "-t, --threshold <number>",
      "Minimum harvest threshold (0-1)",
      "0.8"
    )
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
      const threshold = parseFloat(opts.threshold);

      if (agents.length === 0) {
        console.log(chalk.yellow("  🌑 No agents to harvest from."));
        return;
      }

      console.log(
        chalk.magentaBright("  🧺 Harvest Time") +
          chalk.gray(" — collecting deliverables from the organism...\n")
      );

      const spinner = ora({
        text: chalk.cyan("Inspecting fruiting bodies..."),
        spinner: "dots",
      }).start();

      await sleep(500);
      spinner.text = chalk.cyan("Evaluating ripeness...");
      await sleep(400);
      spinner.text = chalk.cyan("Collecting deliverables...");
      await sleep(300);

      // Determine fruit-ready agents. Truth source (in priority order):
      //   1. sporenet/state.json — written by `mycelium cultivate` per leaf
      //      as it transitions through pending → growing → done. This is
      //      the live cultivation state.
      //   2. agent.state from mycelium.yaml — set if the operator manually
      //      flipped state in yaml (rare).
      //   3. blockers.length === 0 — fallback for pre-cultivation harvests
      //      ("which biomes COULD start now"); only used if no sporenet
      //      state exists.
      //
      // The bug this replaces: the prior implementation checked only #2 OR
      // #3, missing #1 entirely. Cultivate writes status to state.json but
      // never updates yaml, so post-cultivation harvest reported only the
      // unblocked roots (schema-core, design-system) as ready, even when
      // every leaf had completed. Fixed in this commit.
      const sporenetStatePath = path.join(
        process.cwd(),
        "sporenet",
        "state.json"
      );
      const leafStatusBySporenetId: Record<string, string> = {};
      if (fs.existsSync(sporenetStatePath)) {
        try {
          const sporenetState = JSON.parse(
            fs.readFileSync(sporenetStatePath, "utf-8")
          );
          for (const leaf of sporenetState.leaves ?? []) {
            if (typeof leaf?.id === "string" && typeof leaf?.status === "string") {
              leafStatusBySporenetId[leaf.id] = leaf.status;
            }
          }
        } catch {
          // sporenet/state.json malformed — fall through to legacy detection.
        }
      }
      const sporenetHasState = Object.keys(leafStatusBySporenetId).length > 0;

      const fruitReady: Agent[] = [];
      const notReady: Agent[] = [];

      for (const agent of agents) {
        let isReady: boolean;
        if (sporenetHasState) {
          // Cultivation has run — trust sporenet/state.json.
          // state.json may key by biome id (legacy depth-1 organisms) or by
          // leaf id (depth-3 cellular organisms). Try biome match first; if
          // none, roll up leaf statuses scoped to this biome.
          const direct = leafStatusBySporenetId[agent.id];
          if (direct !== undefined) {
            isReady = direct === "done";
          } else {
            const prefix = agent.id + ".";
            const leafEntries = Object.entries(leafStatusBySporenetId).filter(
              ([id]) => id.startsWith(prefix)
            );
            // Biome is ready iff at least one leaf is tracked AND every
            // tracked leaf is done. No leaves tracked = not ready.
            isReady =
              leafEntries.length > 0 &&
              leafEntries.every(([, status]) => status === "done");
          }
        } else {
          // No cultivation yet — use yaml hint or unblocked-root heuristic.
          const blockers = agent.blocked_by || [];
          isReady = agent.state === "FRUIT_READY" || blockers.length === 0;
        }

        if (isReady) {
          fruitReady.push(agent);
        } else {
          notReady.push(agent);
        }
      }

      const harvestRatio = fruitReady.length / agents.length;

      spinner.succeed(chalk.greenBright("Harvest inspection complete!"));
      console.log();

      // Results table
      const table = new Table({
        head: [
          chalk.magenta("Agent"),
          chalk.magenta("Branch"),
          chalk.magenta("Status"),
          chalk.magenta("Deliverable"),
        ],
        style: { head: [], border: ["gray"] },
      });

      for (const agent of fruitReady) {
        table.push([
          chalk.greenBright(`✅ ${agent.id}`),
          chalk.cyan(agent.branch),
          chalk.green("FRUIT_READY"),
          chalk.white(agent.scope),
        ]);
      }

      for (const agent of notReady) {
        table.push([
          chalk.gray(`⏳ ${agent.id}`),
          chalk.gray(agent.branch),
          chalk.yellow("GROWING"),
          chalk.gray(agent.scope),
        ]);
      }

      console.log(table.toString());
      console.log();

      // Harvest threshold check
      const pct = Math.round(harvestRatio * 100);

      if (harvestRatio >= threshold) {
        console.log(
          chalk.greenBright(`  🎉 Harvest threshold met! `) +
            chalk.white.bold(`${pct}%`) +
            chalk.green(` >= ${Math.round(threshold * 100)}%`)
        );
        console.log();
        console.log(
          chalk.greenBright("  Ready to ship! ") +
            chalk.gray("The organism has borne fruit. 🍄")
        );
      } else {
        console.log(
          chalk.yellow(`  ⚠️  Harvest threshold not met: `) +
            chalk.white.bold(`${pct}%`) +
            chalk.yellow(` < ${Math.round(threshold * 100)}%`)
        );
        console.log();
        console.log(
          chalk.gray("  Still growing: ") +
            chalk.yellow(notReady.map((a) => a.id).join(", "))
        );
        console.log();
        console.log(
          chalk.gray.italic("  Patience. The mycelium grows in its own time. 🌱")
        );
      }

      console.log();

      // Merge order suggestion
      if (fruitReady.length > 0) {
        const mergeOrder = config.merge_order || fruitReady.map((a) => a.id);
        const readyIds = new Set(fruitReady.map((a) => a.id));
        const orderedReady = mergeOrder.filter((id: string) =>
          readyIds.has(id)
        );

        console.log(chalk.magentaBright("  📋 Suggested merge order:"));
        for (let i = 0; i < orderedReady.length; i++) {
          const connector = i === orderedReady.length - 1 ? "└──" : "├──";
          console.log(
            chalk.gray(`     ${connector} `) +
              chalk.white.bold(`${i + 1}. ${orderedReady[i]}`)
          );
        }
        console.log();
      }

      // Cost estimate section — only shown when JSONL event log exists
      // Silently skipped if no events file (preserves existing harvest behavior)
      const organism = config.organism?.name || "unknown";
      const eventLogPath = findLatestEventLog(organism);
      if (eventLogPath) {
        try {
          const rollup = await rollupFromJsonl(eventLogPath);
          // Only print if there's actual cost data (at least one cost_recorded event)
          if (rollup.total_usd > 0 || Object.keys(rollup.by_leaf).length > 0) {
            printCostReport(rollup);
          }
        } catch {
          // Silently skip on error — never block harvest on cost failure
          // per HYPHA-COST-AGENT rules
        }
      }
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Find the latest JSONL event log for the given organism.
 * Searches .mycelium/events/ for files matching the organism name pattern.
 * Returns the path to the most recent file by modification time, or null if none.
 */
function findLatestEventLog(organism: string): string | null {
  const eventsDir = path.join(process.cwd(), ".mycelium", "events");
  if (!fs.existsSync(eventsDir)) {
    return null;
  }

  const files = fs.readdirSync(eventsDir)
    .filter((f) => f.endsWith(".jsonl") && f.startsWith(organism + "-"))
    .map((f) => ({
      name: f,
      path: path.join(eventsDir, f),
      mtime: fs.statSync(path.join(eventsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].path : null;
}

/**
 * Format a number as a compact token count string.
 * E.g., 1234567 -> "1.2M", 12345 -> "12k"
 */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  } else if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return String(n);
}

/**
 * Format a USD amount with 2 decimal places.
 */
function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Print the cost estimate section to the console.
 * Only called when cost data is available from the event log.
 */
function printCostReport(rollup: CostRollup): void {
  console.log(chalk.magentaBright("  💰 Cost estimate (current run):"));
  console.log();

  // Total cost
  console.log(
    chalk.gray("    Total:     ") +
    chalk.greenBright.bold(formatUSD(rollup.total_usd))
  );

  // Token breakdown
  const tokensLine = [
    `${formatTokenCount(rollup.tokens.input)} in`,
    `${formatTokenCount(rollup.tokens.output)} out`,
    `${formatTokenCount(rollup.tokens.cache_read)} cache-read`,
    `${formatTokenCount(rollup.tokens.cache_write)} cache-write`,
  ].join(" / ");
  console.log(chalk.gray("    Tokens:    ") + chalk.white(tokensLine));

  // Top biomes by cost (sorted descending, top 5 max)
  const biomeEntries = Object.entries(rollup.by_biome)
    .filter(([, cost]) => cost > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (biomeEntries.length > 0) {
    console.log();
    console.log(chalk.gray("    Top biomes by cost:"));
    for (const [biome, cost] of biomeEntries) {
      const costStr = formatUSD(cost).padStart(8);
      console.log(chalk.gray("      ") + chalk.cyan(biome.padEnd(20)) + chalk.white(costStr));
    }
  }

  // Disclaimer per NUTRIENTS.md / HYPHA spec
  console.log();
  console.log(
    chalk.gray.italic("    (* estimates based on published rates — reconcile against billing)")
  );
  console.log();
}
