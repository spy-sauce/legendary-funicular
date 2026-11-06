// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Dashboard render helper — pure function that injects state + theme into template.
//
// Per NUTRIENTS.md §6 and HYPHA-DASHBOARD-CLI-AGENT.md dashboard.cli.render-helper leaf:
// - Pure: state + theme → HTML string
// - No fs writes, no DOM, no network
// - Synchronous (readFileSync for template)
// - Injects state + theme as <script> tag immediately before </body>
// - Throws if </body> not present in template (template integrity error)
//
// Implementation by dashboard.cli.render-helper leaf.

import fs from "node:fs";
import type { DashboardState } from "./state.js";
import type { DashboardTheme } from "./theme.js";

/**
 * Render dashboard HTML by injecting state + theme into the template.
 *
 * Per NUTRIENTS.md §6:
 * - Reads template from templatePath synchronously
 * - Injects state + theme as a single <script> tag immediately before </body>:
 *   `<script>window.__DASHBOARD_STATE__ = {...};window.__DASHBOARD_THEME__ = {...};</script>`
 * - Returns the complete HTML string ready for response or file write
 *
 * @param state - DashboardState from buildDashboardState()
 * @param theme - DashboardTheme from loadTheme()
 * @param templatePath - Absolute path to templates/dashboard.html
 * @returns Complete HTML string with state + theme inlined
 *
 * @throws Error if template cannot be read
 * @throws Error if </body> not found in template (template integrity error from canvas/console biomes)
 */
export function renderDashboard(
  state: DashboardState,
  theme: DashboardTheme,
  templatePath: string
): string {
  // Read template synchronously (per NUTRIENTS §2 sync contract)
  const template = fs.readFileSync(templatePath, "utf-8");

  // Build injection script
  const stateJson = JSON.stringify(state);
  const themeJson = JSON.stringify(theme);
  const injectionScript = `<script>window.__DASHBOARD_STATE__ = ${stateJson};window.__DASHBOARD_THEME__ = ${themeJson};</script>`;

  // Find </body> tag (case-insensitive for robustness)
  const bodyCloseMatch = template.match(/<\/body>/i);
  if (!bodyCloseMatch || bodyCloseMatch.index === undefined) {
    throw new Error(
      `Template integrity error: </body> not found in ${templatePath}. ` +
        `This is a bug in the dashboard-canvas or dashboard-console biome.`
    );
  }

  // Inject script immediately before </body>
  const insertPosition = bodyCloseMatch.index;
  const result =
    template.slice(0, insertPosition) +
    injectionScript +
    "\n" +
    template.slice(insertPosition);

  return result;
}
