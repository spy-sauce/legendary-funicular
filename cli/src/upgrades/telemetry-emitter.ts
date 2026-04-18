// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Upgrade: telemetry-emitter
//
// The backbone telemetry upgrade. Generates a unique run_id at beforePlan,
// opens a JSONL event log, and emits lifecycle events at each hook:
//   - run_started (beforePlan)
//   - leaf_started (beforeSpawn)
//   - leaf_fruited / leaf_failed (afterLeaf)
//   - run_ended (onCrash or end of run)
//
// Exposes `ctx.telemetry = { runId, emit }` so other upgrades (cost-tracker,
// alerting) can emit events through the same pipe without opening their own sinks.
//
// Event schema is frozen per NUTRIENTS.md §1. Never throws from hooks.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  Upgrade,
  UpgradeCtx,
  LeafLike,
  LeafResultLike,
} from "../lib/upgrades/types.js";
import {
  type EventKind,
  type BaseEvent,
  buildRunStarted,
  buildLeafStarted,
  buildLeafFruited,
  buildLeafFailed,
  buildRunEnded,
} from "../lib/telemetry/events.js";

// ── Run ID generation ───────────────────────────────────────────────────
// Format: <organism>-<ISO8601-compact>-<4-char-hash>
// e.g. ddp-integration-20260417T1830Z-a7f3

function generateRunId(organism: string): string {
  const now = new Date();
  const compact =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    "T" +
    String(now.getUTCHours()).padStart(2, "0") +
    String(now.getUTCMinutes()).padStart(2, "0") +
    "Z";
  const hash = crypto.randomBytes(2).toString("hex"); // 4 chars
  return `${organism}-${compact}-${hash}`;
}

// ── JSONL sink (inline minimal implementation) ──────────────────────────
// The full sink module is at cli/src/lib/telemetry/sink-jsonl.ts (sibling leaf).
// This inline version ensures the upgrade works standalone if the sink isn't
// available, while remaining compatible with the external sink interface.

interface JsonlSink {
  append(event: BaseEvent): void;
  close(): void;
  readonly path: string;
}

function openJsonlSink(runId: string, targetDir: string): JsonlSink {
  const eventsDir = path.join(targetDir, ".mycelium", "events");
  const filePath = path.join(eventsDir, `${runId}.jsonl`);

  // Ensure directory exists
  try {
    fs.mkdirSync(eventsDir, { recursive: true });
  } catch (err) {
    // Log but don't throw — rule: never block on sink failure
    console.error(`[telemetry-emitter] failed to create events dir: ${err}`);
  }

  return {
    path: filePath,
    append(event: BaseEvent): void {
      try {
        // Synchronous append to preserve order across parallel leaves
        fs.appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
      } catch (err) {
        // Log but don't throw — rule: never block on sink failure
        console.error(`[telemetry-emitter] failed to append event: ${err}`);
      }
    },
    close(): void {
      // No-op for sync file appends — file handle isn't held open
    },
  };
}

// ── Telemetry context extension ─────────────────────────────────────────
// Attached to UpgradeCtx so other upgrades can emit events through our sink.

export interface TelemetryCtx {
  runId: string;
  organism: string;
  emit: (kind: EventKind, data: Record<string, unknown>) => void;
}

// Extend the UpgradeCtx type for telemetry. Other upgrades import this type.
declare module "../lib/upgrades/types.js" {
  interface UpgradeCtx {
    telemetry?: TelemetryCtx;
  }
}

// ── Upgrade state (module-level for cross-hook access) ──────────────────

let sink: JsonlSink | null = null;
let runId: string = "";
let organismName: string = "";
let runStartedAt: number = 0;
let leafCount = { ok: 0, failed: 0, total: 0 };

// Reset state for fresh runs (important if CLI process is reused)
function resetState(): void {
  sink = null;
  runId = "";
  organismName = "";
  runStartedAt = 0;
  leafCount = { ok: 0, failed: 0, total: 0 };
}

// ── The Upgrade ─────────────────────────────────────────────────────────

const upgrade: Upgrade = {
  manifest: {
    name: "telemetry-emitter",
    description:
      "Emit lifecycle events to .mycelium/events/<run_id>.jsonl for dashboards and CI.",
    category: "runtime",
  },

  /**
   * beforePlan: Generate run_id, open sink, emit run_started, attach telemetry to ctx.
   */
  async beforePlan(ctx) {
    resetState();

    organismName = ctx.organism?.name ?? "unknown";
    runId = generateRunId(organismName);
    runStartedAt = Date.now();

    // Open the JSONL sink
    sink = openJsonlSink(runId, ctx.targetDir);

    // Count unique biomes from leaves
    const biomes = [...new Set(ctx.leaves.map((l) => l.biome))];
    leafCount.total = ctx.leaves.length;

    // Emit run_started
    const event = buildRunStarted(
      { run_id: runId, organism: organismName },
      {
        total_leaves: ctx.leaves.length,
        biomes,
        max_concurrency: ctx.config?.organism?.max_concurrency ?? 50,
        gating: ctx.organism?.gating ?? "wave",
      }
    );
    sink.append(event);

    // Attach telemetry context for other upgrades
    ctx.telemetry = {
      runId,
      organism: organismName,
      emit: (kind: EventKind, data: Record<string, unknown>) => {
        if (!sink) return;
        const evt: BaseEvent = {
          v: 1,
          run_id: runId,
          organism: organismName,
          ts: new Date().toISOString(),
          kind,
          data,
        };
        sink.append(evt);
      },
    };

    // Return advisory with run_id for visibility
    return {
      warnings: [`telemetry run_id: ${runId} → ${sink.path}`],
    };
  },

  /**
   * beforeSpawn: Emit leaf_started. Never skip leaves.
   */
  async beforeSpawn(ctx, leaf) {
    if (!sink) return;

    // Determine the stream tag for this leaf's biome
    const tag = `MF/${leaf.biome.replace(/-agent$/, "").toUpperCase()}`;

    const event = buildLeafStarted(
      { run_id: runId, organism: organismName },
      {
        leaf_id: leaf.id,
        biome: leaf.biome,
        tag,
        scope: leaf.scope,
        branch: leaf.branch,
        lineage: leaf.lineage,
      }
    );
    sink.append(event);

    // Never skip — always return undefined (or empty decision)
    return;
  },

  /**
   * afterLeaf: Emit leaf_fruited or leaf_failed based on result.
   */
  async afterLeaf(ctx, leaf, result) {
    if (!sink) return;

    if (result.success) {
      leafCount.ok++;

      // Extract summary from log if available — simplified approach
      const summary = result.artifacts.length > 0
        ? `Wrote ${result.artifacts.length} file(s)`
        : "Completed";

      const event = buildLeafFruited(
        { run_id: runId, organism: organismName },
        {
          leaf_id: leaf.id,
          biome: leaf.biome,
          commit_sha: null, // Commit happens after afterLeaf in cultivate.ts
          wall_ms: result.ms,
          files_written: result.artifacts.length,
          summary,
        }
      );
      sink.append(event);
    } else {
      leafCount.failed++;

      const event = buildLeafFailed(
        { run_id: runId, organism: organismName },
        {
          leaf_id: leaf.id,
          biome: leaf.biome,
          wall_ms: result.ms,
          error: result.error ?? "Unknown error",
        }
      );
      sink.append(event);
    }
  },

  /**
   * onCrash: Emit run_ended with partial counts. Best-effort cleanup.
   */
  async onCrash(ctx, err) {
    if (!sink) return;

    const wallMs = Date.now() - runStartedAt;
    const total = leafCount.total;
    const ok = leafCount.ok;
    const failed = leafCount.failed;
    // Health is ok/total, but we may not have processed all leaves
    const processed = ok + failed;
    const health = processed > 0 ? ok / processed : 0;

    const event = buildRunEnded(
      { run_id: runId, organism: organismName },
      {
        ok,
        failed,
        total,
        health,
        wall_ms: wallMs,
      }
    );
    sink.append(event);
    sink.close();

    // Clear state
    resetState();
  },
};

export default upgrade;

// ── End-of-run hook (called after all leaves complete successfully) ─────
// Note: The current Upgrade interface doesn't have an explicit "afterRun" hook.
// For now, onCrash handles abnormal exits. Normal exits don't emit run_ended.
// This is a known gap — a future upgrade to the interface could add afterRun.
//
// Workaround: The CI/CD layer (ddp-emit.sh) emits run_ended at workflow end.
