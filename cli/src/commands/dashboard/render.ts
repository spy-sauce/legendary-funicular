// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium dashboard render` — one-shot static render.
//
// Per NUTRIENTS.md §6 and HYPHA-DASHBOARD-CLI-AGENT.md dashboard.cli.render leaf:
// - Flags: --cwd <path> (default process.cwd()), --out <path> (default <cwd>/sporenet/dashboard.html)
// - Reads state via buildDashboardState(cwd)
// - Reads theme via loadTheme(cwd)
// - Calls renderDashboard() and writes atomically (temp-file + rename)
// - Stdout: confirmation line with path + byte count
// - Exit 0 on success; non-zero with stderr on ThemeValidationError or template failure
//
// Implementation by dashboard.cli.render leaf.

import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadTheme, ThemeValidationError } from "../../lib/dashboard/theme.js";
import { buildDashboardState } from "../../lib/dashboard/state.js";
import { renderDashboard } from "../../lib/dashboard/render.js";

/**
 * Register the `dashboard render` subcommand.
 *
 * @param parent - Parent `dashboard` command from index.ts
 */
export function registerDashboardRenderCommand(parent: Command): void {
  parent
    .command("render")
    .description("One-shot static render to dashboard.html")
    .option("--cwd <path>", "Working directory", process.cwd())
    .option("--out <path>", "Output file path (default: <cwd>/sporenet/dashboard.html)")
    .action((opts) => {
      const cwd = path.resolve(opts.cwd);
      const outPath = opts.out
        ? path.resolve(opts.out)
        : path.join(cwd, "sporenet", "dashboard.html");

      // Resolve template path
      const templatePath = path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        "../../../../templates/dashboard.html"
      );

      try {
        // Build state and load theme
        const state = buildDashboardState(cwd);
        const theme = loadTheme(cwd);

        // Render HTML
        const html = renderDashboard(state, theme, templatePath);

        // Ensure output directory exists
        const outDir = path.dirname(outPath);
        fs.mkdirSync(outDir, { recursive: true });

        // Atomic write: temp file + rename
        const tmpPath = path.join(os.tmpdir(), `dashboard-${Date.now()}-${process.pid}.html`);
        fs.writeFileSync(tmpPath, html, "utf-8");
        fs.renameSync(tmpPath, outPath);

        // Success output
        const byteCount = Buffer.byteLength(html, "utf-8");
        console.log(
          chalk.greenBright(`  wrote ${outPath}`) +
            chalk.gray(` (${byteCount.toLocaleString()} bytes)`)
        );
        process.exit(0);
      } catch (err) {
        if (err instanceof ThemeValidationError) {
          console.error(chalk.red(`  theme validation error: ${err.message}`));
          if (err.field) {
            console.error(chalk.red(`    at field: ${err.field}`));
          }
          process.exit(1);
        }

        // Template read failure or other error
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  render failed: ${message}`));
        process.exit(1);
      }
    });
}
