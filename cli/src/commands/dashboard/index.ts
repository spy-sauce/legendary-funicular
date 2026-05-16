// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium dashboard` — live cultivation dashboard with Three.js canvas.
//
// Per NUTRIENTS.md §6: CLI surface for the dashboard subsystem.
// Wires three subcommands: init, serve, render.
//
// Subcommands:
//   init   — scaffold theme.yaml + static dashboard.html snapshot
//   serve  — HTTP server with live re-render on GET / and SSE on /events/stream
//   render — one-shot static render to sporenet/dashboard.html

import { Command } from "commander";
import { registerDashboardInitCommand } from "./init.js";
import { registerDashboardServeCommand } from "./serve.js";
import { registerDashboardRenderCommand } from "./render.js";

/**
 * Register the `mycelium dashboard` command and its subcommands.
 *
 * Per HYPHA-DASHBOARD-CLI-AGENT.md:
 * - Mirrors the shape of `registerSporenetCommand` in cli/src/commands/sporenet.ts
 * - Creates a `dashboard` parent command
 * - Attaches three subcommands: init, serve, render
 *
 * @param program - Commander program instance from cli/src/index.ts
 */
export function registerDashboardCommand(program: Command): void {
  const dashboard = program
    .command("dashboard")
    .description("📊 Live cultivation dashboard — Three.js canvas + operator chrome");

  // Wire subcommands from sibling modules
  registerDashboardInitCommand(dashboard);
  registerDashboardServeCommand(dashboard);
  registerDashboardRenderCommand(dashboard);
}
