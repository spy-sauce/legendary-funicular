/**
 * theme.ts — DashboardTheme types, ThemeValidationError, and DEFAULT_THEME_PATH
 *
 * Per NUTRIENTS.md §1: Theme schema contract for the dashboard-cache cultivation.
 * Every dashboard biome imports `DashboardTheme` from here.
 *
 * @module cli/src/lib/dashboard/theme
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ─────────────────────────────────────────────────────────────────────────────
// loadTheme — dashboard.theme.loader implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a value is a plain object (not array, not null).
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Deep-merge source into target.
 * - Arrays: source replaces target
 * - Plain objects: recurse (merge per-key)
 * - Scalars: source overwrites target
 *
 * Inlined helper — no external deps (no lodash.merge).
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const targetVal = result[key];
    const sourceVal = source[key];
    if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }
  return result as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Hex color regex: exactly 6 hex digits with # prefix */
const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

/** Closed set of palette keys per NUTRIENTS §1 */
const PALETTE_KEYS: readonly PaletteKey[] = ["ink", "ink_2", "ice", "ice_2", "cryo", "rule"];

/** Closed set of lifecycle keys per NUTRIENTS §1 */
const LIFECYCLE_KEYS: readonly LifecycleKey[] = ["germ", "grow", "flow", "fruit", "dorm"];

/** Closed set of severity keys per NUTRIENTS §1 */
const SEVERITY_KEYS: readonly SeverityKey[] = ["warn", "alert", "crit"];

/** Modulator field names */
const MODULATOR_KEYS: readonly (keyof ThemeModulator)[] = [
  "pending_brightness",
  "active_brightness",
  "fruit_brightness",
  "failed_brightness",
  "active_pulse_hz",
];

/**
 * Validate a hex color string.
 * @throws ThemeValidationError if invalid
 */
function validateHex(value: unknown, fieldPath: string): void {
  if (typeof value !== "string" || !HEX_REGEX.test(value)) {
    throw new ThemeValidationError(
      `Invalid hex color "${value}" at ${fieldPath} — must match #RRGGBB`,
      fieldPath
    );
  }
}

/**
 * Validate a modulator numeric value is finite and in [0, 2].
 * @throws ThemeValidationError if invalid
 */
function validateModulatorNumber(value: unknown, fieldPath: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2) {
    throw new ThemeValidationError(
      `Invalid modulator value "${value}" at ${fieldPath} — must be finite number in [0, 2]`,
      fieldPath
    );
  }
}

/**
 * Validate a non-empty string.
 * @throws ThemeValidationError if invalid
 */
function validateNonEmptyString(value: unknown, fieldPath: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new ThemeValidationError(
      `Invalid value at ${fieldPath} — must be a non-empty string`,
      fieldPath
    );
  }
}

/**
 * Validate that the merged theme matches the DashboardTheme shape.
 * Checks all required keys, hex formats, and modulator bounds.
 *
 * @throws ThemeValidationError with `field` set to the first offending dotted path
 */
function validateTheme(theme: unknown): asserts theme is DashboardTheme {
  if (!isPlainObject(theme)) {
    throw new ThemeValidationError("Theme must be an object", "");
  }

  // ─── Validate brand ───
  if (!isPlainObject(theme.brand)) {
    throw new ThemeValidationError("Missing or invalid brand section", "brand");
  }
  validateNonEmptyString(theme.brand.title, "brand.title");
  validateNonEmptyString(theme.brand.tagline, "brand.tagline");
  validateNonEmptyString(theme.brand.logo_char, "brand.logo_char");

  // ─── Validate palette ───
  if (!isPlainObject(theme.palette)) {
    throw new ThemeValidationError("Missing or invalid palette section", "palette");
  }
  for (const key of PALETTE_KEYS) {
    if (!(key in theme.palette)) {
      throw new ThemeValidationError(`Missing palette key "${key}"`, `palette.${key}`);
    }
    validateHex(theme.palette[key], `palette.${key}`);
  }

  // ─── Validate lifecycle ───
  if (!isPlainObject(theme.lifecycle)) {
    throw new ThemeValidationError("Missing or invalid lifecycle section", "lifecycle");
  }
  for (const key of LIFECYCLE_KEYS) {
    if (!(key in theme.lifecycle)) {
      throw new ThemeValidationError(`Missing lifecycle key "${key}"`, `lifecycle.${key}`);
    }
    validateHex(theme.lifecycle[key], `lifecycle.${key}`);
  }

  // ─── Validate severity ───
  if (!isPlainObject(theme.severity)) {
    throw new ThemeValidationError("Missing or invalid severity section", "severity");
  }
  for (const key of SEVERITY_KEYS) {
    if (!(key in theme.severity)) {
      throw new ThemeValidationError(`Missing severity key "${key}"`, `severity.${key}`);
    }
    validateHex(theme.severity[key], `severity.${key}`);
  }

  // ─── Validate identity (open Record<string, string>) ───
  if (!isPlainObject(theme.identity)) {
    throw new ThemeValidationError("Missing or invalid identity section", "identity");
  }
  for (const [biomeId, hexVal] of Object.entries(theme.identity)) {
    validateHex(hexVal, `identity.${biomeId}`);
  }

  // ─── Validate modulator ───
  if (!isPlainObject(theme.modulator)) {
    throw new ThemeValidationError("Missing or invalid modulator section", "modulator");
  }
  for (const key of MODULATOR_KEYS) {
    if (!(key in theme.modulator)) {
      throw new ThemeValidationError(`Missing modulator key "${key}"`, `modulator.${key}`);
    }
    validateModulatorNumber(theme.modulator[key], `modulator.${key}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// loadTheme — main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load and validate a dashboard theme.
 *
 * Steps per NUTRIENTS §1:
 * 1. Parse `templates/theme.default.yaml` as the base theme
 * 2. If `<cwd>/theme.yaml` exists, parse and deep-merge over the base
 *    (overlay values win; missing overlay keys keep base; identity map merges per-key)
 * 3. Validate the merged result
 * 4. Return the validated DashboardTheme
 *
 * @param cwd - Working directory to look for theme.yaml
 * @returns Validated DashboardTheme
 *
 * @throws ThemeValidationError - on malformed input (hex strings, modulator bounds, etc.)
 * @throws Error - if default theme file is missing (framework bug)
 *
 * @remarks
 * - Synchronous — called per-render-request
 * - Missing `<cwd>/theme.yaml` is NOT an error — returns validated default theme
 * - Missing default theme file IS an error (framework bug)
 */
export function loadTheme(cwd: string): DashboardTheme {
  // Step 1: Load the default theme (required — framework bug if missing)
  let defaultTheme: Record<string, unknown>;
  try {
    const defaultYaml = fs.readFileSync(DEFAULT_THEME_PATH, "utf8");
    defaultTheme = parseYaml(defaultYaml) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Framework bug: default theme file missing at ${DEFAULT_THEME_PATH}`
      );
    }
    throw err;
  }

  // Step 2: Load and merge <cwd>/theme.yaml if it exists
  const cwdThemePath = path.join(cwd, "theme.yaml");
  let mergedTheme = defaultTheme;

  if (fs.existsSync(cwdThemePath)) {
    try {
      const cwdYaml = fs.readFileSync(cwdThemePath, "utf8");
      const cwdTheme = parseYaml(cwdYaml) as Record<string, unknown>;
      mergedTheme = deepMerge(defaultTheme, cwdTheme);
    } catch (err) {
      // File exists but failed to parse — this is a validation error
      throw new ThemeValidationError(
        `Failed to parse ${cwdThemePath}: ${(err as Error).message}`,
        ""
      );
    }
  }

  // Step 3: Validate the merged theme
  validateTheme(mergedTheme);

  // Step 4: Return the validated theme
  return mergedTheme;
}
