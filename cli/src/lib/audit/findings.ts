// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Finding interface + Severity union — the wire between testers and the aggregator.
//
// This module defines the canonical Finding schema that all audit testers emit
// and the aggregator consumes. Frozen per NUTRIENTS.md §1.
//
// Severity semantics:
//   - critical → blocks contract-freeze on re-plant
//   - major    → blocks harvest threshold
//   - minor    → informational; included in brief but non-blocking

import { createHash } from "node:crypto";

/**
 * Severity levels for audit findings.
 *
 * The union is closed — no new severities may be added at leaf-time.
 * Per NUTRIENTS.md §1:
 *   - "critical" blocks contract-freeze on re-plant
 *   - "major" blocks harvest threshold
 *   - "minor" is informational; included in brief but non-blocking
 */
export type Severity = "critical" | "major" | "minor";

/**
 * A single audit finding emitted by a tester.
 *
 * Schema is frozen per NUTRIENTS.md §1. All testers emit findings in this exact
 * shape via the JSONL writer; the aggregator consumes them in this exact shape.
 */
export interface Finding {
  /**
   * Deterministic identifier: sha256(tester_id + "|" + biome + "|" + summary +
   * "|" + (file_path || "") + "|" + (line_range ? line_range.join("-") : "")).
   * SHA-256 hex, lowercase, 64 characters.
   *
   * The same defect across `--autofix` iterations produces the same `id` so
   * dedupe is automatic.
   */
  id: string;

  /**
   * Tester identifier, e.g., "tester.flow.talent".
   * Must start with "tester.".
   */
  tester_id: string;

  /**
   * Production biome this finding maps to.
   */
  biome: string;

  /**
   * Severity level — determines blocking behavior.
   */
  severity: Severity;

  /**
   * Path to the file where the issue was found.
   * Optional for cross-cutting findings.
   */
  file_path?: string;

  /**
   * Line range [start, end] where the issue was found.
   * Optional; omit if not applicable.
   */
  line_range?: [number, number];

  /**
   * One-line headline summarizing the finding.
   */
  summary: string;

  /**
   * Multi-line root-cause explanation.
   */
  detail: string;

  /**
   * Ordered commands or actions to reproduce the issue.
   */
  repro_steps: string[];

  /**
   * Free-text suggested fix; the re-plant leaf consumes this as acceptance
   * criterion.
   */
  suggested_fix: string;

  /**
   * ISO-8601 timestamp with milliseconds indicating when the finding was
   * observed.
   */
  observed_at: string;

  /**
   * Which autofix iteration produced this finding.
   * 0 = baseline run; 1..N = autofix iterations.
   */
  iteration: number;
}

/**
 * Summary of an audit run.
 *
 * Written to `audit/<iso-timestamp>/summary.json`.
 * Schema frozen per NUTRIENTS.md §2.
 */
export interface AuditSummary {
  /**
   * Unique run identifier: <iso-timestamp>-<4-char-hash>
   */
  audit_run_id: string;

  /**
   * Organism name from mycelium.yaml.
   */
  organism: string;

  /**
   * ISO-8601 timestamp with ms when the audit run started.
   */
  started_at: string;

  /**
   * ISO-8601 timestamp with ms when the audit run ended.
   */
  ended_at: string;

  /**
   * Wall-clock duration of the audit run in milliseconds.
   */
  wall_ms: number;

  /**
   * Number of testers that ran.
   */
  testers_run: number;

  /**
   * Number of testers that encountered errors (operator concern, not
   * cultivation defect).
   */
  testers_failed: number;

  /**
   * Total number of findings across all testers.
   */
  findings_count: number;

  /**
   * Findings broken down by severity.
   */
  by_severity: {
    critical: number;
    major: number;
    minor: number;
  };

  /**
   * Biomes with at least one critical or major finding.
   */
  biomes_affected: string[];

  /**
   * Iteration number: 0 for baseline; n for autofix run n.
   */
  iteration: number;

  /**
   * Path to prior findings.jsonl when using --against for baseline diff.
   * Omit or null for standalone runs.
   */
  audit_baseline?: string;
}

/**
 * Input parts for generating a deterministic finding ID.
 */
export interface FindingIdParts {
  tester_id: string;
  biome: string;
  summary: string;
  file_path?: string;
  line_range?: [number, number];
}

/**
 * Generate a deterministic finding ID from the given parts.
 *
 * ID formula per NUTRIENTS.md §1:
 *   sha256(tester_id + "|" + biome + "|" + summary + "|" + (file_path || "") +
 *          "|" + (line_range ? line_range.join("-") : ""))
 *
 * Returns lowercase hex, 64 characters.
 *
 * @param parts - The components that identify a unique finding
 * @returns SHA-256 hex string, lowercase, 64 chars
 */
export function findingId(parts: FindingIdParts): string {
  const segments = [
    parts.tester_id,
    parts.biome,
    parts.summary,
    parts.file_path ?? "",
    parts.line_range ? parts.line_range.join("-") : "",
  ];

  const payload = segments.join("|");
  const hash = createHash("sha256").update(payload, "utf8").digest("hex");

  // hash is already lowercase hex, 64 characters
  return hash;
}
