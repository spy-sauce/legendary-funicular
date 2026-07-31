// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium dashboard init` — scaffold theme.yaml + static dashboard.html snapshot.
//
// Per NUTRIENTS.md §6 and HYPHA-DASHBOARD-CLI-AGENT.md dashboard.cli.init leaf:
// - Flags: --cwd <path> (default process.cwd()), --force
// - Writes <cwd>/theme.yaml from templates/theme.default.yaml (if missing or --force)
// - Ensures <cwd>/sporenet/ exists
// - Renders static dashboard.html snapshot via renderDashboard()
//
// Implementation by dashboard.cli.init leaf.

import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { loadTheme, DEFAULT_THEME_PATH } from "../../lib/dashboard/theme.js";
import { buildDashboardState } from "../../lib/dashboard/state.js";
import { renderDashboard } from "../../lib/dashboard/render.js";

/**
 * Register the `dashboard init` subcommand.
 *
 * @param parent - Parent `dashboard` command from index.ts
 */
export function registerDashboardInitCommand(parent: Command): void {
  parent
    .command("init")
    .description("Scaffold theme.yaml + static dashboard.html snapshot")
    .option("--cwd <path>", "Working directory", process.cwd())
    .option("--force", "Overwrite existing theme.yaml", false)
    .action((opts) => {
      const cwd = path.resolve(opts.cwd);

      // Step 1: Write theme.yaml if missing or --force
      const themeDestPath = path.join(cwd, "theme.yaml");
      if (!fs.existsSync(themeDestPath) || opts.force) {
        const defaultThemeContent = fs.readFileSync(DEFAULT_THEME_PATH, "utf-8");
        fs.writeFileSync(themeDestPath, defaultThemeContent, "utf-8");
        console.log(chalk.greenBright("  wrote theme.yaml"));
      } else {
        console.log(chalk.yellow("  theme.yaml exists; pass --force to overwrite"));
      }

      // Step 2: Ensure sporenet/ directory exists
      const sporenetDir = path.join(cwd, "sporenet");
      fs.mkdirSync(sporenetDir, { recursive: true });

      // Step 3: Build state + theme, render dashboard
      const state = buildDashboardState(cwd);
      const theme = loadTheme(cwd);

      // Resolve template path (from compiled location back to templates/)
      const templatePath = path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        "../../../../templates/dashboard.html"
      );

      const html = renderDashboard(state, theme, templatePath);
      const outPath = path.join(sporenetDir, "dashboard.html");
      fs.writeFileSync(outPath, html, "utf-8");
      console.log(chalk.greenBright("  wrote sporenet/dashboard.html"));

      // Exit 0 on success (implicit)
    });
}
