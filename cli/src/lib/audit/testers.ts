// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Tester types for audit-run. Defines the shape of a tester definition
// (parsed from HYPHA-TEST-*.md) and the result of running a tester.
//
// Frozen contract: NUTRIENTS.md §4 — Tester registry + runner contract.
// Do not modify these interfaces without unfreezing the contract first.

import type { Finding } from "./findings.js";
import type { MicroCallRecord } from "../micro-agents/types.js";

/**
 * Allowed tools for testers. Write/Edit are NEVER granted to testers —
 * they are read-only observers. If a HYPHA-TEST-*.md declares Write or Edit,
 * the loader logs a warning and strips them.
 */
export type TesterTool = "Read" | "Bash";

/**
 * Tester definition parsed from a HYPHA-TEST-*.md file in the cultivation
 * being audited. Operators author these per NUTRIENTS §6.
 *
 * The loader scans `<cultivationDir>/hyphae/HYPHA-TEST-*.md` and produces
 * an array of these definitions for the runner pool.
 */
export interface TesterDef {
  /**
   * Tester identifier — must start with "tester." (e.g., "tester.flow.talent").
   * Parsed from `**TESTER_ID:** tester.<name>` in the HYPHA CACHE HEADER.
   */
  id: string;

  /**
   * The biome this tester mirrors, or null for cross-cutting testers.
   * Parsed from `**MIRRORS_BIOME:** <biome-id>` or `(cross-cutting)`.
   */
  mirrors_biome: string | null;

  /**
   * One-line description of what the tester covers.
   * Parsed from `**SCOPE:** <one-line>` in the HYPHA CACHE HEADER.
   */
  scope: string;

  /**
   * Paths to cultivated artifacts and NUTRIENTS sections the tester reads.
   * Parsed from `**INPUTS:** <comma-list>` in the HYPHA CACHE HEADER.
   * The tester has read-only access to these paths.
   */
  inputs: string[];

  /**
   * Free-text description of what the tester asserts.
   * Parsed from the "Assertions" section of the HYPHA-TEST-*.md file.
   */
  assertion_summary: string;

  /**
   * Tools granted to this tester. Defaults to ["Read", "Bash"].
   * Write and Edit are NEVER granted — if declared in the HYPHA, the loader
   * logs a warning and strips them from this array.
   */
  tools: TesterTool[];

  /**
   * Path to the source HYPHA-TEST-*.md file (relative to cultivation root).
   */
  hypha_path: string;
}

/**
 * Result of running a single tester via the Claude Agent SDK.
 * The runner captures stdout/stderr to disk and parses any emitted Finding.
 */
export interface TesterResult {
  /**
   * The tester that was run — matches TesterDef.id.
   */
  tester_id: string;

  /**
   * Exit code from the tester session:
   *   0 = all assertions passed (finding is null)
   *   1 = an assertion failed (finding is populated)
   *   2+ = tester_error (operator concern, not a cultivation defect)
   */
  exit_code: number;

  /**
   * Wall-clock time in milliseconds for the tester run.
   */
  wall_ms: number;

  /**
   * The Finding emitted by the tester, or null if all assertions passed.
   * Parsed from `<auditRunDir>/testers/<tester_id>/finding.json`.
   */
  finding: Finding | null;

  /**
   * Absolute path to the tester's stdout log.
   * Written to `<auditRunDir>/testers/<tester_id>/stdout.log`.
   */
  stdout_path: string;

  /**
   * Absolute path to the tester's stderr log.
   * Written to `<auditRunDir>/testers/<tester_id>/stderr.log`.
   */
  stderr_path: string;

  /**
   * Per-call records from the read-side micro fan-out (Spec §3), if micros ran.
   */
  micro_records?: MicroCallRecord[];

  /**
   * Targets actually summarized by micros and folded into the tester prompt.
   */
  micro_folded_targets?: string[];

  /**
   * Count of redundant re-reads detected in the tester stdout — files the
   * tester re-READ despite already having a folded summary.
   */
  micro_redundant_re_reads?: number;
}

/**
 * Default tools granted to testers when not explicitly specified in the HYPHA.
 * Per NUTRIENTS §4: "default ["Read", "Bash"]".
 */
export const DEFAULT_TESTER_TOOLS: TesterTool[] = ["Read", "Bash"];

/**
 * Validates that a tester ID follows the required format.
 * Per NUTRIENTS §4: `id` must start with "tester.".
 */
export function isValidTesterId(id: string): boolean {
  return typeof id === "string" && id.startsWith("tester.");
}
