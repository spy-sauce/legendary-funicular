// Mycelium Framework — VibeSpace LLC — The network provides.
//
// audit.aggregator.summary — writeSummary emits audit/<ts>/summary.json per NUTRIENTS §2.
//
// Atomic temp-file/rename pattern mirrors writeAuditBlock in sporenet-integration.
// Called once per audit-run iteration (baseline + each autofix iteration).

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * AuditSummary — schema per NUTRIENTS §2.
 *
 * Written to `audit/<ts>/summary.json` by `writeSummary`.
 */
export interface AuditSummary {
  /** Format: `<iso-timestamp>-<4-char-hash>` */
  audit_run_id: string;
  /** Organism name from mycelium.yaml */
  organism: string;
  /** ISO-8601 with ms — when the audit-run started */
  started_at: string;
  /** ISO-8601 with ms — when the audit-run ended */
  ended_at: string;
  /** Wall-clock duration in milliseconds */
  wall_ms: number;
  /** Number of testers executed */
  testers_run: number;
  /** Number of testers that errored (operator concern, not cultivation defect) */
  testers_failed: number;
  /** Total number of findings emitted */
  findings_count: number;
  /** Counts by severity level */
  by_severity: { critical: number; major: number; minor: number };
  /** Biomes with at least one critical or major finding */
  biomes_affected: string[];
  /** 0 for baseline; n for autofix iteration n */
  iteration: number;
  /** Path to prior findings.jsonl (for --against); absent on baseline */
  audit_baseline?: string;
}

/**
 * Writes summary.json to the given audit run directory.
 *
 * Uses atomic temp-file/rename pattern to avoid partial writes being read
 * by concurrent readers (sporenet, heal-loop, etc.).
 *
 * @param runDir - The audit run directory, e.g., `audit/2026-05-11T12-34-56-789Z`
 * @param summary - The AuditSummary object to persist
 */
export async function writeSummary(
  runDir: string,
  summary: AuditSummary
): Promise<void> {
  // Ensure the run directory exists
  await fs.promises.mkdir(runDir, { recursive: true });

  const targetPath = path.join(runDir, "summary.json");

  // Atomic write: temp file in same directory, then rename
  const tmpSuffix = randomBytes(4).toString("hex");
  const tmpPath = path.join(runDir, `.summary.json.${tmpSuffix}.tmp`);

  const content = JSON.stringify(summary, null, 2) + "\n";

  try {
    await fs.promises.writeFile(tmpPath, content, "utf-8");
    await fs.promises.rename(tmpPath, targetPath);
  } catch (err) {
    // Best-effort cleanup of temp file on failure
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Reads summary.json from an audit run directory.
 *
 * Returns null if the file doesn't exist or is malformed.
 * Never throws — caller handles the null case.
 *
 * @param runDir - The audit run directory
 */
export async function readSummary(runDir: string): Promise<AuditSummary | null> {
  const targetPath = path.join(runDir, "summary.json");

  try {
    const content = await fs.promises.readFile(targetPath, "utf-8");
    const parsed = JSON.parse(content) as AuditSummary;

    // Basic shape validation — matches NUTRIENTS §2 required fields
    if (
      typeof parsed.audit_run_id !== "string" ||
      typeof parsed.organism !== "string" ||
      typeof parsed.started_at !== "string" ||
      typeof parsed.ended_at !== "string" ||
      typeof parsed.wall_ms !== "number" ||
      typeof parsed.testers_run !== "number" ||
      typeof parsed.testers_failed !== "number" ||
      typeof parsed.findings_count !== "number" ||
      typeof parsed.by_severity !== "object" ||
      typeof parsed.by_severity.critical !== "number" ||
      typeof parsed.by_severity.major !== "number" ||
      typeof parsed.by_severity.minor !== "number" ||
      !Array.isArray(parsed.biomes_affected) ||
      typeof parsed.iteration !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Builds an AuditSummary object from its components.
 *
 * Convenience helper for audit-cli and audit-heal-loop to construct the
 * summary without manually assembling every field.
 *
 * @param params - The components of the summary
 */
export function buildSummary(params: {
  auditRunId: string;
  organism: string;
  startedAt: Date;
  endedAt: Date;
  testersRun: number;
  testersFailed: number;
  findingsCount: number;
  bySeverity: { critical: number; major: number; minor: number };
  biomesAffected: string[];
  iteration: number;
  auditBaseline?: string;
}): AuditSummary {
  const wallMs = params.endedAt.getTime() - params.startedAt.getTime();

  return {
    audit_run_id: params.auditRunId,
    organism: params.organism,
    started_at: params.startedAt.toISOString(),
    ended_at: params.endedAt.toISOString(),
    wall_ms: wallMs,
    testers_run: params.testersRun,
    testers_failed: params.testersFailed,
    findings_count: params.findingsCount,
    by_severity: params.bySeverity,
    biomes_affected: params.biomesAffected,
    iteration: params.iteration,
    ...(params.auditBaseline !== undefined && { audit_baseline: params.auditBaseline }),
  };
}

/**
 * Generates an audit_run_id in the format `<iso-timestamp>-<4-char-hash>`.
 *
 * The timestamp uses the filesystem-safe format from NUTRIENTS §2:
 * `YYYY-MM-DDTHH-mm-ss-mmmZ` (colons replaced with dashes).
 *
 * @param ts - The timestamp for the run (defaults to now)
 */
export function generateAuditRunId(ts: Date = new Date()): string {
  // ISO-8601 but filesystem-safe: replace colons with dashes
  const isoSafe = ts.toISOString().replace(/:/g, "-");
  const hash = randomBytes(2).toString("hex"); // 4 hex chars
  return `${isoSafe}-${hash}`;
}

/**
 * Extracts the timestamp directory name from an audit_run_id.
 *
 * The directory name is the ISO-safe timestamp portion (before the final hash).
 *
 * @param auditRunId - The full audit run ID
 */
export function auditRunIdToDir(auditRunId: string): string {
  // The format is: YYYY-MM-DDTHH-mm-ss-mmmZ-<4hex>
  // We need to strip the trailing -<4hex>
  const lastDash = auditRunId.lastIndexOf("-");
  if (lastDash > 0) {
    return auditRunId.slice(0, lastDash);
  }
  return auditRunId;
}
