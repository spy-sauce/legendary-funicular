// Mycelium Framework — VibeSpace LLC — The network provides.
//
// JSONL findings writer — atomic append with SHA-256 dedupe.
//
// This module writes audit findings to `<runDir>/findings.jsonl`, one JSON
// object per line, newline-terminated. Testers emit findings via appendFinding;
// the aggregator reads via readFindings.
//
// Contract rules (per NUTRIENTS.md §1 and HYPHA-AUDIT-FINDINGS-AGENT.md):
//   - Never throw on write failure — log to stderr and continue
//   - Dedupe by id before append (same defect across iterations = same id)
//   - Use serialized promise chain to prevent concurrent append interleaving
//   - Create the directory if missing
//   - UTF-8 encoding, \n-terminated lines

import * as fs from "node:fs";
import * as path from "node:path";
import type { Finding } from "./findings.js";

// ────────────────────────────────────────────────────────────────────────────
// Serialization chains — one per file path. Prevents concurrent appends from
// interleaving within the same findings.jsonl. Mirrors the writeLeafState
// serialization fix from cultivate.ts (2026-05-10).
// ────────────────────────────────────────────────────────────────────────────
const _appendChains = new Map<string, Promise<void>>();

function getChain(filePath: string): Promise<void> {
  return _appendChains.get(filePath) ?? Promise.resolve();
}

function setChain(filePath: string, chain: Promise<void>): void {
  _appendChains.set(filePath, chain);
}

/**
 * Wait for all queued append operations to drain.
 *
 * Call before audit-run exits to ensure all findings are flushed to disk.
 */
export async function drainFindingsWrites(): Promise<void> {
  await Promise.all(Array.from(_appendChains.values()));
}

// ────────────────────────────────────────────────────────────────────────────
// appendFinding — atomic append with dedupe
// ────────────────────────────────────────────────────────────────────────────

/**
 * Append a finding to `<runDir>/findings.jsonl`.
 *
 * - Creates the directory if missing.
 * - Reads existing lines and dedupes by `id` — if the same `id` already exists,
 *   this is a no-op (no second line written).
 * - Uses a serialized promise chain per file to prevent concurrent appends
 *   from interleaving.
 * - Never throws on filesystem error — logs to stderr and continues.
 *
 * @param runDir - The audit run directory (e.g., `audit/<ISO-timestamp>`)
 * @param finding - The Finding to append
 */
export async function appendFinding(
  runDir: string,
  finding: Finding
): Promise<void> {
  const filePath = path.join(runDir, "findings.jsonl");

  const chain = getChain(filePath).then(
    () =>
      new Promise<void>((resolve) => {
        try {
          // Ensure directory exists
          fs.mkdirSync(runDir, { recursive: true });

          // Read existing findings for dedupe check
          const existingIds = new Set<string>();
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, { encoding: "utf-8" });
            const lines = content.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed) as Finding;
                if (parsed.id) {
                  existingIds.add(parsed.id);
                }
              } catch {
                // Malformed line — skip for dedupe purposes
              }
            }
          }

          // Dedupe: skip if this id already exists
          if (existingIds.has(finding.id)) {
            resolve();
            return;
          }

          // Append the finding
          const line = JSON.stringify(finding) + "\n";
          fs.appendFileSync(filePath, line, { encoding: "utf-8" });
          resolve();
        } catch (err) {
          // NEVER throw from append — log and continue.
          // Mirrors the telemetry-emitter pattern from sink-jsonl.ts.
          console.error(
            `[audit] warning: failed to append finding to ${filePath}:`,
            err instanceof Error ? err.message : err
          );
          resolve();
        }
      })
  );

  setChain(filePath, chain);
  await chain;
}

// ────────────────────────────────────────────────────────────────────────────
// readFindings — line-by-line parse with tolerance for missing/empty files
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read all findings from `<runDir>/findings.jsonl`.
 *
 * - Returns `[]` for a missing or empty file (does not throw).
 * - Throws on malformed JSON — this is an operator concern that should surface.
 *
 * @param runDir - The audit run directory (e.g., `audit/<ISO-timestamp>`)
 * @returns Array of Finding objects in file order
 */
export async function readFindings(runDir: string): Promise<Finding[]> {
  const filePath = path.join(runDir, "findings.jsonl");
  const findings: Finding[] = [];

  if (!fs.existsSync(filePath)) {
    return findings;
  }

  const content = fs.readFileSync(filePath, { encoding: "utf-8" });
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Throws on malformed JSON — operator concern, per HYPHA spec.
    // "throw only on malformed JSON (operator concern)"
    const finding = JSON.parse(line) as Finding;
    findings.push(finding);
  }

  return findings;
}

// ────────────────────────────────────────────────────────────────────────────
// findingsPath — utility for consistent path resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get the path to findings.jsonl for a given run directory.
 *
 * @param runDir - The audit run directory
 * @returns Absolute path to findings.jsonl
 */
export function findingsPath(runDir: string): string {
  return path.join(runDir, "findings.jsonl");
}
