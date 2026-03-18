// Mycelium Framework — VibeSpace LLC — The network provides.

import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import Table from "cli-table3";

interface Agent {
  id: string;
  scope: string;
  branch: string;
  blocked_by: string[];
  blocks: string[];
  capabilities: string[];
  state?: string;
}

interface OrganismConfig {
  organism: {
    name: string;
    ship_target: string;
    health_pulse_interval: number;
    harvest_threshold: number;
  };
  agents: Agent[];
}

function loadConfig(): OrganismConfig | null {
  const configPath = path.join(process.cwd(), "mycelium.yaml");
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, "utf-8");
  return YAML.parse(raw) as OrganismConfig;
}

function getAgentState(agent: Agent, allAgents: Agent[]): string {
  // Simulate state based on dependency resolution
  if (agent.state) return agent.state;
  const blockers = agent.blocked_by || [];
  if (blockers.length === 0) return "HYPHAL_GROWTH";
  const allBlockersResolved = blockers.every((bid) => {
    const blocker = allAgents.find((a) => a.id === bid);
    return blocker && getAgentState(blocker, allAgents) === "FRUIT_READY";
  });
  return allBlockersResolved ? "GERMINATING" : "SPORE";
}

function stateColor(state: string): string {
  switch (state) {
    case "SPORE":
      return chalk.gray(state);
    case "GERMINATING":
      return chalk.yellow(state);
    case "HYPHAL_GROWTH":
      return chalk.cyan(state);
    case "FRUITING":
      return chalk.magenta(state);
    case "FRUIT_READY":
      return chalk.greenBright(state);
    default:
      return chalk.white(state);
  }
}

function stateIcon(state: string): string {
  switch (state) {
    case "SPORE":
      return "💤";
    case "GERMINATING":
      return "🌱";
    case "HYPHAL_GROWTH":
      return "🌿";
    case "FRUITING":
      return "🍄";
    case "FRUIT_READY":
      return "✅";
    default:
      return "❓";
  }
}

export function registerNetworkCommand(program: Command): void {
  const network = program
    .command("network")
    .description("🕸️  Inspect the organism's neural network");

  network
    .command("status")
    .description("Show all agent states and organism health")
    .action(async () => {
      const config = loadConfig();
      if (!config) {
        console.log(
          chalk.red("  ❌ No mycelium.yaml found. Run ") +
            chalk.cyan("mycelium init") +
            chalk.red(" first.")
        );
        return;
      }

      const agents = config.agents || [];
      if (agents.length === 0) {
        console.log(chalk.yellow("  🌑 No agents in the organism."));
        return;
      }

      // Organism header
      console.log(
        chalk.magentaBright("  🍄 Organism: ") +
          chalk.white.bold(config.organism.name) +
          chalk.gray(` — target: ${config.organism.ship_target}`)
      );
      console.log();

      // Agent table
      const table = new Table({
        head: [
          chalk.magenta("Agent"),
          chalk.magenta("State"),
          chalk.magenta("Scope"),
          chalk.magenta("Branch"),
          chalk.magenta("Blocked By"),
          chalk.magenta("Blocks"),
        ],
        style: { head: [], border: ["gray"] },
      });

      let readyCount = 0;
      let activeCount = 0;

      for (const agent of agents) {
        const state = getAgentState(agent, agents);
        if (state === "FRUIT_READY") readyCount++;
        if (state === "HYPHAL_GROWTH" || state === "GERMINATING") activeCount++;

        table.push([
          `${stateIcon(state)} ${chalk.white.bold(agent.id)}`,
          stateColor(state),
          chalk.gray(agent.scope),
          chalk.cyan(agent.branch),
          agent.blocked_by.length > 0
            ? chalk.red(agent.blocked_by.join(", "))
            : chalk.green("none"),
          agent.blocks.length > 0
            ? chalk.yellow(agent.blocks.join(", "))
            : chalk.gray("none"),
        ]);
      }

      console.log(table.toString());
      console.log();

      // Health summary
      const total = agents.length;
      const healthPct = total > 0 ? Math.round((readyCount / total) * 100) : 0;
      const healthBar = generateHealthBar(healthPct);

      console.log(
        chalk.magentaBright("  🫀 Organism Health: ") + healthBar + chalk.gray(` ${healthPct}%`)
      );
      console.log(
        chalk.gray(`     ${readyCount}/${total} agents harvested, ${activeCount} actively growing`)
      );
      console.log();
    });

  network
    .command("visualize")
    .description("ASCII visualization of the agent network")
    .action(async () => {
      const config = loadConfig();
      if (!config) {
        console.log(
          chalk.red("  ❌ No mycelium.yaml found. Run ") +
            chalk.cyan("mycelium init") +
            chalk.red(" first.")
        );
        return;
      }

      const agents = config.agents || [];
      if (agents.length === 0) {
        console.log(chalk.yellow("  🌑 No agents to visualize."));
        return;
      }

      console.log(
        chalk.magentaBright("  🕸️  Network Topology — ") +
          chalk.white.bold(config.organism.name)
      );
      console.log();

      // Build dependency layers
      const layers = buildLayers(agents);

      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const isLast = i === layers.length - 1;

        // Draw nodes in this layer
        const nodeStrs = layer.map((agent) => {
          const state = getAgentState(agent, agents);
          const icon = stateIcon(state);
          return `${icon} [${chalk.white.bold(agent.id)}]`;
        });

        const layerLabel = chalk.gray(`  Layer ${i}: `);
        console.log(layerLabel + nodeStrs.join("   "));

        // Draw connections to next layer
        if (!isLast) {
          const nextLayer = layers[i + 1];
          const connections: string[] = [];

          for (const agent of layer) {
            for (const nextAgent of nextLayer) {
              if (nextAgent.blocked_by.includes(agent.id)) {
                connections.push(
                  chalk.gray(`           ${agent.id}`) +
                    chalk.magenta(" ──▶ ") +
                    chalk.gray(nextAgent.id)
                );
              }
            }
          }

          if (connections.length > 0) {
            for (const conn of connections) {
              console.log(conn);
            }
          } else {
            console.log(chalk.gray("           │"));
          }
        }
      }

      console.log();
      console.log(
        chalk.gray.italic("  Nutrients flow downward through the network. 🌊")
      );
      console.log();
    });
}

function buildLayers(agents: Agent[]): Agent[][] {
  const placed = new Set<string>();
  const layers: Agent[][] = [];

  // Iteratively place agents whose dependencies are all already placed
  let remaining = [...agents];
  while (remaining.length > 0) {
    const layer = remaining.filter((a) =>
      (a.blocked_by || []).every((dep) => placed.has(dep))
    );

    if (layer.length === 0) {
      // Circular dependency or unresolvable — dump remaining into last layer
      layers.push(remaining);
      break;
    }

    layers.push(layer);
    for (const a of layer) placed.add(a.id);
    remaining = remaining.filter((a) => !placed.has(a.id));
  }

  return layers;
}

function generateHealthBar(pct: number): string {
  const width = 20;
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;

  const filledStr =
    pct >= 80
      ? chalk.greenBright("█".repeat(filled))
      : pct >= 50
        ? chalk.yellow("█".repeat(filled))
        : chalk.red("█".repeat(filled));

  return chalk.gray("[") + filledStr + chalk.gray("░".repeat(empty)) + chalk.gray("]");
}
