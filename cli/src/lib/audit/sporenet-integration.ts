// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `cli/src/lib/audit/sporenet-integration.ts`
//
// Sporenet integration for audit-run: extends sporenet/state.json with an
// optional `audit` block. Uses atomic temp-file/rename pattern (mirrors
// writeLeafState in cultivate.ts) so concurrent readers never see partial
// state. Serialized via promise chain to prevent read-modify-write races.
//
// Scope: audit.sporenet.state — per NUTRIENTS §3, HYPHA-AUDIT-SPORENET-AGENT.md

import fs from "node:fs";
import path from "node:path";

// ────────────────────────────────────────────────────────────────────────────
// SporenetAuditBlock — frozen contract from NUTRIENTS.md §3
// ────────────────────────────────────────────────────────────────────────────

/**
 * Audit block schema for sporenet/state.json extension.
 * Added to existing state.json root as an optional `audit` field.
 * Preserves all existing fields per framework rule #9.
 */
export interface SporenetAuditBlock {
  /** Current audit-run status */
  status: "pending" | "running" | "complete" | "failed";
  /** Audit run identifier; null when status === "pending" */
  audit_run_id: string | null;
  /** 0 for baseline, n for autofix iteration */
  iteration: number;
  /** Total findings count */
  findings_count: number;
  /** Counts by severity bucket */
  by_severity: { critical: number; major: number; minor: number };
  /** Biomes with >= 1 critical or major finding */
  biomes_affected: string[];
  /** ISO-8601 with ms; null when never run */
  last_run_at: string | null;
  /** ISO-8601 with ms; null when not running */
  started_at: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Serialization chain — prevents read-modify-write races
// ────────────────────────────────────────────────────────────────────────────

/**
 * Promise chain for serializing concurrent writeAuditBlock calls.
 * Multiple calls (e.g., status transitions during an audit-run) queue onto
 * this chain so each read-modify-write completes before the next starts.
 */
let _auditStateChain: Promise<void> = Promise.resolve();

// ────────────────────────────────────────────────────────────────────────────
// writeAuditBlock — atomic temp/rename pattern per NUTRIENTS §3
// ────────────────────────────────────────────────────────────────────────────

/**
 * Merge an audit block into sporenet/state.json.
 *
 * - Reads `<stateDir>/sporenet/state.json`
 * - Merges `audit: block` into the root object (preserving all existing fields)
 * - Writes via atomic temp-file/rename so concurrent readers never see partial state
 * - Serialized internally via promise chain so concurrent writes never lose updates
 *
 * @param stateDir - Directory containing sporenet/state.json (typically organism root)
 * @param block - The SporenetAuditBlock to write
 * @returns Promise<void> that resolves when the write is complete
 */
export function writeAuditBlock(
  stateDir: string,
  block: SporenetAuditBlock
): Promise<void> {
  const promise = _auditStateChain.then(
    () =>
      new Promise<void>((resolve) => {
        try {
          const statePath = path.join(stateDir, "sporenet", "state.json");

          // Bail silently if state.json doesn't exist — mirrors writeLeafState pattern
          if (!fs.existsSync(statePath)) {
            return resolve();
          }

          // Read current state
          const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

          // Merge audit block (preserves all existing fields per framework rule #9)
          state.audit = block;

          // Atomic write: temp file + rename
          // Concurrent readers always see complete state, never half-truncated
          const tmpPath = statePath + ".audit.tmp";
          fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
          fs.renameSync(tmpPath, statePath);

          resolve();
        } catch {
          // Best-effort — never throw on filesystem error (mirrors telemetry-emitter pattern)
          resolve();
        }
      })
  );

  _auditStateChain = promise;
  return promise;
}

// ────────────────────────────────────────────────────────────────────────────
// drainAuditStateWrites — await pending writes before exit
// ────────────────────────────────────────────────────────────────────────────

/**
 * Await all pending writeAuditBlock calls.
 *
 * Call before audit-run exits to ensure all queued writes flush to disk.
 * Without this, the process can return before final status writes land,
 * leaving the dashboard with a stale view.
 *
 * @returns Promise<void> that resolves when all pending writes are complete
 */
export async function drainAuditStateWrites(): Promise<void> {
  await _auditStateChain;
}

// ────────────────────────────────────────────────────────────────────────────
// clearAuditBlock — remove audit key for clean state
// ────────────────────────────────────────────────────────────────────────────

/**
 * Remove the `audit` key from sporenet/state.json.
 *
 * Useful for resetting to a clean state at the start of a new cultivation.
 * Uses the same atomic temp/rename pattern and serialization chain.
 *
 * @param stateDir - Directory containing sporenet/state.json
 * @returns Promise<void> that resolves when the clear is complete
 */
export function clearAuditBlock(stateDir: string): Promise<void> {
  const promise = _auditStateChain.then(
    () =>
      new Promise<void>((resolve) => {
        try {
          const statePath = path.join(stateDir, "sporenet", "state.json");

          if (!fs.existsSync(statePath)) {
            return resolve();
          }

          const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

          // Remove audit key if present
          if ("audit" in state) {
            delete state.audit;

            // Atomic write
            const tmpPath = statePath + ".audit.tmp";
            fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
            fs.renameSync(tmpPath, statePath);
          }

          resolve();
        } catch {
          resolve(); // best-effort
        }
      })
  );

  _auditStateChain = promise;
  return promise;
}

// ────────────────────────────────────────────────────────────────────────────
// Factory helpers — convenience for audit-run orchestration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a pending audit block (initial state before run starts).
 */
export function createPendingAuditBlock(): SporenetAuditBlock {
  return {
    status: "pending",
    audit_run_id: null,
    iteration: 0,
    findings_count: 0,
    by_severity: { critical: 0, major: 0, minor: 0 },
    biomes_affected: [],
    last_run_at: null,
    started_at: null,
  };
}

/**
 * Create a running audit block (transition when audit-run starts).
 *
 * @param auditRunId - The audit run identifier (ISO timestamp + hash)
 * @param iteration - Current iteration (0 for baseline)
 */
export function createRunningAuditBlock(
  auditRunId: string,
  iteration: number = 0
): SporenetAuditBlock {
  return {
    status: "running",
    audit_run_id: auditRunId,
    iteration,
    findings_count: 0,
    by_severity: { critical: 0, major: 0, minor: 0 },
    biomes_affected: [],
    last_run_at: null,
    started_at: new Date().toISOString(),
  };
}

/**
 * Create a complete audit block (transition when audit-run finishes successfully).
 *
 * @param auditRunId - The audit run identifier
 * @param iteration - Final iteration number
 * @param findingsCount - Total findings
 * @param bySeverity - Counts by severity
 * @param biomesAffected - Biomes with findings
 * @param startedAt - When the run started (ISO-8601)
 */
export function createCompleteAuditBlock(
  auditRunId: string,
  iteration: number,
  findingsCount: number,
  bySeverity: { critical: number; major: number; minor: number },
  biomesAffected: string[],
  startedAt: string
): SporenetAuditBlock {
  return {
    status: "complete",
    audit_run_id: auditRunId,
    iteration,
    findings_count: findingsCount,
    by_severity: bySeverity,
    biomes_affected: biomesAffected,
    last_run_at: new Date().toISOString(),
    started_at: startedAt,
  };
}

/**
 * Create a failed audit block (transition when audit-run fails).
 *
 * @param auditRunId - The audit run identifier (may be null if failed before ID assigned)
 * @param iteration - Iteration at failure
 * @param startedAt - When the run started (ISO-8601)
 */
export function createFailedAuditBlock(
  auditRunId: string | null,
  iteration: number,
  startedAt: string | null
): SporenetAuditBlock {
  return {
    status: "failed",
    audit_run_id: auditRunId,
    iteration,
    findings_count: 0,
    by_severity: { critical: 0, major: 0, minor: 0 },
    biomes_affected: [],
    last_run_at: new Date().toISOString(),
    started_at: startedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// resetBiomeLeaves — unblock heal-loop's re-cultivation (Bug 1 fix, 2026-05-11)
// ────────────────────────────────────────────────────────────────────────────
//
// Cultivate's F1 path (cli/src/commands/cultivate.ts:158-170) reads
// sporenet/state.json and skips any leaf already marked `done`. That's
// correct for forward-progress cultivations but blocks the heal-loop's
// re-plant: every prior-cultivation leaf is `done`, so the spawned
// `mycelium cultivate --only-biome <biome>` produces zero files.
//
// The heal-loop calls this helper BEFORE each `spawnCultivate` to flip
// the targeted biome's leaves back to `pending`, restoring re-plant
// semantics without modifying cultivate.ts (framework rule #2).
//
// Uses the same atomic temp/rename pattern + promise-chain serialization
// as writeAuditBlock, so concurrent state writes never lose updates.

/**
 * Reset the targeted biome's leaves from `done` → `pending` so the next
 * `mycelium cultivate --only-biome <biome>` actually re-spawns them.
 *
 * Matches leaves where `leaf.agent === biomeId` OR `leaf.id === biomeId`
 * OR `leaf.id` starts with `biomeId + "."`  (sub-leaf naming convention).
 *
 * @param stateDir - Directory containing sporenet/state.json
 * @param biomeId - The biome whose leaves should be reset
 * @returns Promise<void> that resolves when the write completes
 */
export function resetBiomeLeaves(
  stateDir: string,
  biomeId: string
): Promise<void> {
  const promise = _auditStateChain.then(
    () =>
      new Promise<void>((resolve) => {
        try {
          const statePath = path.join(stateDir, "sporenet", "state.json");

          if (!fs.existsSync(statePath)) {
            return resolve();
          }

          const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

          if (!Array.isArray(state.leaves)) {
            return resolve();
          }

          let resetCount = 0;
          state.leaves = state.leaves.map((leaf: any) => {
            const matches =
              leaf.agent === biomeId ||
              leaf.id === biomeId ||
              (typeof leaf.id === "string" && leaf.id.startsWith(biomeId + "."));

            if (!matches) return leaf;

            resetCount += 1;

            // Preserve identity fields; clear completion fields so F1 re-spawns.
            const {
              status: _status,
              completed_at: _completed,
              commit: _commit,
              files_produced: _files,
              duration_seconds: _duration,
              started_at: _started,
              ...identity
            } = leaf;

            return { ...identity, status: "pending" };
          });

          // Atomic write
          const tmpPath = statePath + ".reset.tmp";
          fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
          fs.renameSync(tmpPath, statePath);

          // Surface what we did so the heal-loop's spawnCultivate output is interpretable.
          if (resetCount > 0) {
            console.log(
              `[heal-loop] Reset ${resetCount} leaf(s) for biome '${biomeId}' (status: done → pending) so cultivate's F1 path will re-spawn them.`
            );
          }

          resolve();
        } catch {
          // Best-effort — never throw on filesystem error
          resolve();
        }
      })
  );

  _auditStateChain = promise;
  return promise;
}
