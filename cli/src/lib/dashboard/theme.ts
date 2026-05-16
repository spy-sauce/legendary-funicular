/**
 * theme.ts — DashboardTheme types, ThemeValidationError, and DEFAULT_THEME_PATH
 *
 * Per NUTRIENTS.md §1: Theme schema contract for the dashboard-cache cultivation.
 * Every dashboard biome imports `DashboardTheme` from here.
 *
 * @module cli/src/lib/dashboard/theme
 */

import * as path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions — per NUTRIENTS §1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Brand block — cultivation identity displayed in dashboard titlebar.
 */
export interface DashboardBrand {
  title: string;
  tagline: string;
  logo_char: string;
}

/**
 * Palette keys — closed union. Hex color values only.
 */
export type PaletteKey = "ink" | "ink_2" | "ice" | "ice_2" | "cryo" | "rule";

/**
 * Lifecycle state keys — closed union. Hex color values per state.
 */
export type LifecycleKey = "germ" | "grow" | "flow" | "fruit" | "dorm";

/**
 * Severity level keys — closed union. Hex color values per level.
 */
export type SeverityKey = "warn" | "alert" | "crit";

/**
 * Modulator fields — brightness multipliers and pulse frequency.
 * All values must be finite numbers in [0, 2].
 */
export interface ThemeModulator {
  pending_brightness: number;
  active_brightness: number;
  fruit_brightness: number;
  failed_brightness: number;
  active_pulse_hz: number;
}

/**
 * DashboardTheme — the canonical per-cultivation theme shape.
 *
 * Loaded from `<cwd>/theme.yaml` with fallback to `templates/theme.default.yaml`.
 * Consumed by dashboard-canvas and dashboard-console via `window.__DASHBOARD_THEME__`.
 */
export interface DashboardTheme {
  brand: DashboardBrand;
  palette: Record<PaletteKey, string>;
  lifecycle: Record<LifecycleKey, string>;
  severity: Record<SeverityKey, string>;
  identity: Record<string, string>; // biome_id → hex
  modulator: ThemeModulator;
}

// ─────────────────────────────────────────────────────────────────────────────
// ThemeValidationError — thrown on malformed theme input
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ThemeValidationError — thrown when theme.yaml fails structural validation.
 *
 * The `field` property contains the dotted path to the offending value
 * (e.g., "palette.cryo", "modulator.active_pulse_hz", "identity.dashboard-canvas").
 */
export class ThemeValidationError extends Error {
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "ThemeValidationError";
    this.field = field;
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ThemeValidationError.prototype);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_THEME_PATH — resolved path to templates/theme.default.yaml
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Absolute path to the default theme file.
 *
 * Resolved from the compiled output location (cli/dist/lib/dashboard/theme.js)
 * to the templates directory at the project root.
 */
export const DEFAULT_THEME_PATH: string = path.resolve(
  __dirname,
  "../../../../templates/theme.default.yaml"
);
