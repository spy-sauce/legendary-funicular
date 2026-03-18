// Mycelium Framework — VibeSpace LLC — The network provides.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const AGENT_TEMPLATE = (name: string): string => `// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Agent: ${name}
// State: SPORE (dormant — awaiting activation)
//
// Lifecycle:  SPORE -> GERMINATING -> HYPHAL_GROWTH -> FRUITING -> FRUIT_READY
//

import type { AgentContext, AgentResult } from "@vibespace/mycelium-core";

export default {
  id: "${name}",
  scope: "TODO: describe this agent's responsibility",
  branch: "feat/${name}",
  blocked_by: [],
  blocks: [],
  capabilities: [],

  async germinate(ctx: AgentContext): Promise<void> {
    // Called when the agent transitions from SPORE to GERMINATING.
    // Set up workspace, check prerequisites, prepare environment.
    ctx.log("🌱 ${name} is germinating...");
  },

  async grow(ctx: AgentContext): Promise<void> {
    // Called during HYPHAL_GROWTH — the main work phase.
    // Implement the agent's core logic here.
    ctx.log("🌿 ${name} is growing...");
  },

  async fruit(ctx: AgentContext): Promise<AgentResult> {
    // Called during FRUITING — produce deliverables.
    // Return the agent's output for harvesting.
    ctx.log("🍄 ${name} is fruiting...");
    return {
      deliverables: [],
      status: "FRUIT_READY",
    };
  },
};
`;

export function registerAgentCommand(program: Command): void {
  const agent = program
    .command("agent")
    .description("🧬 Manage agents in the organism");

  agent
    .command("create <name>")
    .description("Spawn a new agent from a spore template")
    .option(
      "-s, --scope <scope>",
      "Agent's scope/responsibility",
      "TODO: describe scope"
    )
    .option(
      "-b, --branch <branch>",
      "Git branch for this agent"
    )
    .option(
      "-c, --capabilities <caps>",
      "Comma-separated capabilities",
      ""
    )
    .action(async (name: string, opts) => {
      const spinner = ora({
        text: chalk.cyan(`Spawning agent spore ${chalk.white.bold(name)}...`),
        spinner: "dots",
      }).start();

      const agentsDir = path.join(process.cwd(), "agents");
      if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
      }

      const agentFile = path.join(agentsDir, `${name}.ts`);
      if (fs.existsSync(agentFile)) {
        spinner.fail(
          chalk.red(`Agent ${chalk.bold(name)} already exists at ${agentFile}`)
        );
        return;
      }

      fs.writeFileSync(agentFile, AGENT_TEMPLATE(name), "utf-8");

      // Update mycelium.yaml if it exists
      const configPath = path.join(process.cwd(), "mycelium.yaml");
      if (fs.existsSync(configPath)) {
        spinner.text = chalk.cyan("Registering agent in organism config...");

        const raw = fs.readFileSync(configPath, "utf-8");
        const config = YAML.parse(raw);

        if (!config.agents) config.agents = [];

        const branchName = opts.branch || `feat/${name}`;
        const capabilities = opts.capabilities
          ? opts.capabilities.split(",").map((c: string) => c.trim())
          : [];

        config.agents.push({
          id: name,
          scope: opts.scope,
          branch: branchName,
          blocked_by: [],
          blocks: [],
          capabilities,
        });

        if (!config.merge_order) config.merge_order = [];
        config.merge_order.push(name);

        const updatedYaml =
          "# Mycelium Framework — VibeSpace LLC — The network provides.\n\n" +
          YAML.stringify(config);
        fs.writeFileSync(configPath, updatedYaml, "utf-8");
      }

      spinner.succeed(
        chalk.greenBright(`Agent spore ${chalk.white.bold(name)} planted!`)
      );

      console.log();
      console.log(
        chalk.gray("  📄 ") + chalk.yellow(agentFile)
      );
      console.log();
      console.log(
        chalk.gray("  State: ") +
          chalk.magenta("SPORE") +
          chalk.gray(" (dormant — awaiting ") +
          chalk.cyan("mycelium cultivate") +
          chalk.gray(")")
      );
      console.log();
      console.log(
        chalk.gray.italic("  A new spore joins the network. It will grow when the time is right. 🌱")
      );
    });

  agent
    .command("list")
    .description("List all agents in the organism")
    .action(async () => {
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
      const agents = config.agents || [];

      if (agents.length === 0) {
        console.log(
          chalk.yellow("  🌑 No agents in the organism yet. Create one with ") +
            chalk.cyan("mycelium agent create <name>")
        );
        return;
      }

      console.log(
        chalk.magentaBright(`  🧬 ${agents.length} agent(s) in the organism:\n`)
      );

      for (const agent of agents) {
        const blockedTag =
          agent.blocked_by && agent.blocked_by.length > 0
            ? chalk.red(` [blocked by: ${agent.blocked_by.join(", ")}]`)
            : chalk.green(" [unblocked]");

        console.log(
          chalk.white.bold(`    ${agent.id}`) +
            chalk.gray(` — ${agent.scope}`) +
            blockedTag
        );
      }

      console.log();
    });
}
