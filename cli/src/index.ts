#!/usr/bin/env node
// Mycelium Framework — VibeSpace LLC — The network provides.

import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { registerInitCommand } from "./commands/init.js";
import { registerAgentCommand } from "./commands/agent.js";
import { registerContractsCommand } from "./commands/contracts.js";
import { registerNetworkCommand } from "./commands/network.js";
import { registerFlowCommand } from "./commands/flow.js";
import { registerHarvestCommand } from "./commands/harvest.js";
import { registerCultivateCommand } from "./commands/cultivate.js";

const banner = boxen(
  chalk.magentaBright.bold("🍄 Mycelium") +
    chalk.gray(" — ") +
    chalk.greenBright("The network provides."),
  {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderStyle: "round",
    borderColor: "magenta",
  }
);

const program = new Command();

program
  .name("mycelium")
  .description(
    "Agentic execution framework — orchestrate AI agents like a living organism"
  )
  .version("0.1.0")
  .hook("preAction", () => {
    console.log(banner);
  });

registerInitCommand(program);
registerAgentCommand(program);
registerContractsCommand(program);
registerNetworkCommand(program);
registerFlowCommand(program);
registerHarvestCommand(program);
registerCultivateCommand(program);

program.parse();
