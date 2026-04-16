// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium upgrades` — inspect and manage the framework's upgrade layer.
//
// Upgrades are opt-in, generic, installable capabilities. An organism's
// mycelium.yaml lists active upgrades under `organism.upgrades`; cultivate
// resolves them at run time and fires lifecycle hooks.

import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { listAll, REGISTRY } from "../upgrades/registry.js";

export function registerUpgradesCommand(program: Command): void {
  const upg = program
    .command("upgrades")
    .description(
      "🔧 Framework upgrades — opt-in, generic installable capabilities"
    );

  upg
    .command("list")
    .description("List all available upgrades")
    .action(() => {
      const installed = readInstalled();
      const all = listAll();
      console.log();
      console.log(
        chalk.magentaBright(`  🔧 ${all.length} upgrade(s) available`)
      );
      console.log();
      for (const u of all) {
        const on = installed.has(u.manifest.name);
        const dot = on ? chalk.green("●") : chalk.gray("○");
        console.log(
          `  ${dot} ` +
            chalk.white.bold(u.manifest.name.padEnd(28)) +
            chalk.gray(u.manifest.category.padEnd(12)) +
            chalk.gray(u.manifest.description)
        );
      }
      console.log();
      console.log(
        chalk.gray("  ● installed   ○ available   ") +
          chalk.gray("— install with ") +
          chalk.cyan("mycelium upgrades install <name>")
      );
      console.log();
    });

  upg
    .command("info <name>")
    .description("Show details for a specific upgrade")
    .action((name: string) => {
      const u = REGISTRY.get(name);
      if (!u) {
        console.log(chalk.red(`  ❌ Unknown upgrade: ${name}`));
        return;
      }
      const hooks = [
        u.beforePlan && "beforePlan",
        u.beforeSpawn && "beforeSpawn",
        u.afterLeaf && "afterLeaf",
        u.onCrash && "onCrash",
      ].filter(Boolean);

      console.log();
      console.log(chalk.magentaBright.bold(`  🔧 ${u.manifest.name}`));
      console.log(chalk.gray(`  ${u.manifest.category}\n`));
      console.log("  " + u.manifest.description);
      console.log();
      console.log(
        chalk.gray("  Hooks:     ") +
          chalk.cyan(hooks.join(", ") || "(none)")
      );
      if (u.manifest.conflicts && u.manifest.conflicts.length > 0) {
        console.log(
          chalk.gray("  Conflicts: ") +
            chalk.red(u.manifest.conflicts.join(", "))
        );
      }
      console.log();
    });

  upg
    .command("install <name>")
    .description("Install an upgrade into the current organism")
    .action((name: string) => {
      const u = REGISTRY.get(name);
      if (!u) {
        console.log(chalk.red(`  ❌ Unknown upgrade: ${name}`));
        return;
      }
      const cfg = readConfigOrExit();
      if (!cfg) return;

      cfg.organism = cfg.organism || {};
      const list: string[] = cfg.organism.upgrades || [];
      if (list.includes(name)) {
        console.log(chalk.yellow(`  ℹ ${name} already installed.`));
        return;
      }
      list.push(name);
      cfg.organism.upgrades = list;
      writeConfig(cfg);
      console.log(
        chalk.greenBright(`  🔧 Installed `) +
          chalk.white.bold(name) +
          chalk.gray(` (${u.manifest.category})`)
      );
    });

  upg
    .command("remove <name>")
    .description("Remove an upgrade from the current organism")
    .action((name: string) => {
      const cfg = readConfigOrExit();
      if (!cfg) return;

      const list: string[] = cfg.organism?.upgrades ?? [];
      if (!list.includes(name)) {
        console.log(chalk.yellow(`  ℹ ${name} not installed.`));
        return;
      }
      cfg.organism.upgrades = list.filter((n) => n !== name);
      writeConfig(cfg);
      console.log(
        chalk.greenBright(`  🔧 Removed `) + chalk.white.bold(name)
      );
    });
}

// ─── helpers ─────────────────────────────────────────────────────────────

function configPath(): string {
  return path.join(process.cwd(), "mycelium.yaml");
}

function readConfigOrExit(): any | null {
  const p = configPath();
  if (!fs.existsSync(p)) {
    console.log(
      chalk.red(`  ❌ No mycelium.yaml in ${process.cwd()}.`) +
        chalk.gray(" Run ") +
        chalk.cyan("mycelium init") +
        chalk.gray(" first.")
    );
    return null;
  }
  return YAML.parse(fs.readFileSync(p, "utf-8"));
}

function writeConfig(cfg: any): void {
  const updated =
    "# Mycelium Framework — VibeSpace LLC — The network provides.\n\n" +
    YAML.stringify(cfg);
  fs.writeFileSync(configPath(), updated);
}

function readInstalled(): Set<string> {
  const p = configPath();
  if (!fs.existsSync(p)) return new Set();
  try {
    const cfg = YAML.parse(fs.readFileSync(p, "utf-8"));
    const list: string[] = cfg?.organism?.upgrades ?? [];
    return new Set(list);
  } catch {
    return new Set();
  }
}
