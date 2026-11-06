// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium dashboard serve` — HTTP server with live re-render + SSE events.
//
// Per NUTRIENTS.md §6 and HYPHA-DASHBOARD-CLI-AGENT.md dashboard.cli.serve leaf:
// - Flags: --port <n> (default 3334), --cwd <path> (default process.cwd())
// - GET / → live re-render from state.json + theme.yaml per request
// - GET /events/stream → SSE stream of new JSONL events
// - GET /static/* → serve templates/ assets
// - SIGINT → clean shutdown, no orphaned port
// - Per-request logging: GET <path> <status> <ms>ms
//
// Implementation by dashboard.cli.serve leaf.

import { Command } from "commander";
import chalk from "chalk";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { loadTheme, ThemeValidationError } from "../../lib/dashboard/theme.js";
import { buildDashboardState } from "../../lib/dashboard/state.js";
import { renderDashboard } from "../../lib/dashboard/render.js";
import { tailEvents } from "../../lib/dashboard/events.js";

/**
 * Register the `dashboard serve` subcommand.
 *
 * @param parent - Parent `dashboard` command from index.ts
 */
export function registerDashboardServeCommand(parent: Command): void {
  parent
    .command("serve")
    .description("HTTP server with live re-render + SSE event stream")
    .option("--port <n>", "Port number", "3334")
    .option("--cwd <path>", "Working directory", process.cwd())
    .action((opts) => {
      const cwd = path.resolve(opts.cwd);
      const port = parseInt(opts.port, 10);

      // Resolve template path once at startup
      const templatePath = path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        "../../../../templates/dashboard.html"
      );

      // Resolve events path (organism name from state if available)
      const eventsDir = path.join(cwd, ".mycelium", "events");

      // Track active SSE connections for cleanup
      const sseConnections = new Set<http.ServerResponse>();

      const server = http.createServer((req, res) => {
        const startTime = Date.now();
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        const pathname = url.pathname;

        // ─── GET / → live re-render ───
        if (pathname === "/" && req.method === "GET") {
          try {
            const state = buildDashboardState(cwd);
            const theme = loadTheme(cwd);
            const html = renderDashboard(state, theme, templatePath);

            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            });
            res.end(html);
            logRequest(req.method!, pathname, 200, startTime);
          } catch (err) {
            const isThemeError = err instanceof ThemeValidationError;
            const status = isThemeError ? 400 : 500;
            const message = err instanceof Error ? err.message : String(err);

            res.writeHead(status, { "Content-Type": "text/plain" });
            res.end(`Dashboard render error: ${message}`);
            logRequest(req.method!, pathname, status, startTime);
          }
          return;
        }

        // ─── GET /state.json → live state poll target for the canvas/console ───
        if (pathname === "/state.json" && req.method === "GET") {
          try {
            const state = buildDashboardState(cwd);
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
            });
            res.end(JSON.stringify(state));
            logRequest(req.method!, pathname, 200, startTime);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end(`state.json error: ${message}`);
            logRequest(req.method!, pathname, 500, startTime);
          }
          return;
        }

        // ─── GET /events/stream → SSE ───
        if (pathname === "/events/stream" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          });

          sseConnections.add(res);
          logRequest(req.method!, pathname, 200, startTime);

          // Send initial connected comment
          res.write(": connected\n\n");

          // Find the organism's event file
          let lastSeenTs: string | null = null;
          const findEventsFile = (): string | null => {
            if (!fs.existsSync(eventsDir)) return null;
            const files = fs.readdirSync(eventsDir)
              .filter(f => f.endsWith(".jsonl"))
              .map(f => ({
                name: f,
                path: path.join(eventsDir, f),
                mtime: fs.statSync(path.join(eventsDir, f)).mtime.getTime(),
              }))
              .sort((a, b) => b.mtime - a.mtime);
            return files[0]?.path ?? null;
          };

          // Poll for new events every 1.4s per NUTRIENTS §3 aggregation cadence
          const pollInterval = setInterval(() => {
            try {
              const eventsPath = findEventsFile();
              if (!eventsPath) return;

              const newEvents = tailEvents(eventsPath, lastSeenTs, 50);
              for (const ev of newEvents.reverse()) {
                res.write(`data: ${JSON.stringify(ev)}\n\n`);
                if (!lastSeenTs || ev.ts > lastSeenTs) {
                  lastSeenTs = ev.ts;
                }
              }
            } catch {
              // Best effort, never crash
            }
          }, 1400);

          // Heartbeat every 15s to keep connection alive through proxies
          const heartbeat = setInterval(() => {
            try {
              res.write(": heartbeat\n\n");
            } catch {
              // Connection closed
            }
          }, 15000);

          // Cleanup on client disconnect
          req.on("close", () => {
            clearInterval(pollInterval);
            clearInterval(heartbeat);
            sseConnections.delete(res);
          });

          return;
        }

        // ─── GET /static/* → serve from templates/ ───
        if (pathname.startsWith("/static/") && req.method === "GET") {
          const relPath = pathname.slice("/static/".length);
          const templatesDir = path.resolve(
            path.dirname(new URL(import.meta.url).pathname),
            "../../../../templates"
          );
          const filePath = path.join(templatesDir, relPath);

          // Security: prevent path traversal
          if (!filePath.startsWith(templatesDir)) {
            res.writeHead(403, { "Content-Type": "text/plain" });
            res.end("Forbidden");
            logRequest(req.method!, pathname, 403, startTime);
            return;
          }

          if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found");
            logRequest(req.method!, pathname, 404, startTime);
            return;
          }

          const ext = path.extname(filePath);
          const contentTypes: Record<string, string> = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".yaml": "text/yaml; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
          };
          const contentType = contentTypes[ext] ?? "application/octet-stream";

          res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "no-store",
          });
          res.end(fs.readFileSync(filePath));
          logRequest(req.method!, pathname, 200, startTime);
          return;
        }

        // ─── 404 for any other route ───
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        logRequest(req.method!, pathname, 404, startTime);
      });

      // SIGINT handler for clean shutdown
      const shutdown = () => {
        console.log(chalk.gray("\n  shutting down..."));
        // Close all SSE connections
        for (const conn of sseConnections) {
          try {
            conn.end();
          } catch {
            // Best effort
          }
        }
        sseConnections.clear();
        server.close(() => {
          process.exit(0);
        });
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      server.listen(port, () => {
        console.log(
          chalk.greenBright("  dashboard serving at ") +
            chalk.cyan(`http://localhost:${port}`)
        );
        console.log(chalk.gray("  ctrl+c to stop"));
      });
    });
}

/**
 * Log a request with timing.
 * Format: GET <path> <status> <ms>ms
 */
function logRequest(
  method: string,
  path: string,
  status: number,
  startTime: number
): void {
  const duration = Date.now() - startTime;
  const statusColor = status >= 400 ? chalk.red : chalk.green;
  console.log(
    chalk.gray(`  ${method} ${path} `) +
      statusColor(String(status)) +
      chalk.gray(` ${duration}ms`)
  );
}
