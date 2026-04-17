// Mycelium Framework — VibeSpace LLC — The network provides.
//
// JSONL telemetry sink — append-only local file writer.
//
// This sink writes events to `.mycelium/events/<run_id>.jsonl`, one JSON object
// per line, newline-terminated. It is the backbone of the telemetry system —
// every other biome (dashboard, fleet, cost, alerting) reads from these files.
//
// Contract rules (per HYPHA-TELEMETRY-AGENT.md):
//   - Never throw on write failure — log to stderr and continue
//   - Use synchronous fs.appendFileSync to preserve order across parallel leaves
//   - Create the events directory if missing
//   - Event schema is frozen per NUTRIENTS.md §1

import * as fs from "node:fs";
import * as path from "node:path";
import type { BaseEvent } from "./events.js";

/**
 * Sink interface — append events and close the sink.
 */
export interface JsonlSink {
  /** Append an event to the JSONL file. Never throws. */
  append(event: BaseEvent): void;
  /** Close the sink (flush any buffers, clean up). */
  close(): void;
  /** Path to the JSONL file being written. */
  readonly filePath: string;
}

/**
 * Open a JSONL sink for the given run ID.
 *
 * Events are written to `.mycelium/events/<run_id>.jsonl` under the target
 * directory (defaults to cwd). Each event is one JSON object per line,
 * newline-terminated, UTF-8 encoded.
 *
 * The sink uses synchronous fs.appendFileSync to ensure ordering is preserved
 * when multiple parallel leaves emit events. This is intentional — telemetry
 * ordering matters more than maximum throughput.
 *
 * @param runId - The run identifier (e.g., `ddp-integration-20260417T1830Z-a7f3`)
 * @param targetDir - Base directory (default: process.cwd())
 * @returns A JsonlSink that appends events to the file
 */
export function openJsonlSink(runId: string, targetDir?: string): JsonlSink {
  const baseDir = targetDir ?? process.cwd();
  const eventsDir = path.join(baseDir, ".mycelium", "events");
  const filePath = path.join(eventsDir, `${runId}.jsonl`);

  // Ensure directory exists. If this fails, we'll catch it on first append.
  try {
    fs.mkdirSync(eventsDir, { recursive: true });
  } catch (err) {
    // Log but don't throw — we'll try again on append or fail gracefully
    console.error(
      `[telemetry] warning: could not create events directory: ${eventsDir}`,
      err instanceof Error ? err.message : err
    );
  }

  let closed = false;

  return {
    filePath,

    append(event: BaseEvent): void {
      if (closed) {
        console.error(
          `[telemetry] warning: attempted append to closed sink (run_id=${runId})`
        );
        return;
      }

      try {
        // Serialize to JSON, one line per event, newline-terminated
        const line = JSON.stringify(event) + "\n";

        // Synchronous append preserves order across parallel leaf executions.
        // This is a deliberate trade-off: we prioritize event ordering over
        // maximum throughput. Telemetry events are small (<1KB typically),
        // so sync I/O is acceptable here.
        fs.appendFileSync(filePath, line, { encoding: "utf-8" });
      } catch (err) {
        // NEVER throw from a sink operation — log and continue.
        // The cultivate run must not fail because telemetry failed.
        console.error(
          `[telemetry] warning: failed to write event to ${filePath}:`,
          err instanceof Error ? err.message : err
        );
      }
    },

    close(): void {
      if (closed) {
        return;
      }
      closed = true;

      // JSONL sink has no buffering, so close is a no-op for I/O.
      // We just mark it closed to catch accidental post-close appends.
    },
  };
}

/**
 * Read all events from a JSONL file.
 *
 * This is a utility for downstream consumers (dashboard, fleet) that need
 * to read the event log. Parsing errors on individual lines are logged
 * and skipped — partial/corrupted logs don't crash readers.
 *
 * @param filePath - Absolute path to the JSONL file
 * @returns Array of parsed events (malformed lines are skipped)
 */
export function readJsonlEvents(filePath: string): BaseEvent[] {
  const events: BaseEvent[] = [];

  try {
    if (!fs.existsSync(filePath)) {
      return events;
    }

    const content = fs.readFileSync(filePath, { encoding: "utf-8" });
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue; // Skip empty lines
      }

      try {
        const event = JSON.parse(line) as BaseEvent;
        events.push(event);
      } catch (parseErr) {
        // Log malformed line but keep reading — don't fail the whole file
        console.error(
          `[telemetry] warning: malformed JSON at ${filePath}:${i + 1}:`,
          parseErr instanceof Error ? parseErr.message : parseErr
        );
      }
    }
  } catch (err) {
    console.error(
      `[telemetry] warning: failed to read ${filePath}:`,
      err instanceof Error ? err.message : err
    );
  }

  return events;
}

/**
 * Get the path to the events directory for a given target directory.
 *
 * @param targetDir - Base directory (default: process.cwd())
 * @returns Path to `.mycelium/events/`
 */
export function getEventsDir(targetDir?: string): string {
  const baseDir = targetDir ?? process.cwd();
  return path.join(baseDir, ".mycelium", "events");
}

/**
 * Get the JSONL file path for a given run ID.
 *
 * @param runId - The run identifier
 * @param targetDir - Base directory (default: process.cwd())
 * @returns Path to `.mycelium/events/<run_id>.jsonl`
 */
export function getJsonlPath(runId: string, targetDir?: string): string {
  return path.join(getEventsDir(targetDir), `${runId}.jsonl`);
}

/**
 * List all JSONL event files in the events directory.
 *
 * @param targetDir - Base directory (default: process.cwd())
 * @returns Array of run IDs (filenames without .jsonl extension)
 */
export function listEventFiles(targetDir?: string): string[] {
  const eventsDir = getEventsDir(targetDir);

  try {
    if (!fs.existsSync(eventsDir)) {
      return [];
    }

    const files = fs.readdirSync(eventsDir);
    return files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(/\.jsonl$/, ""))
      .sort(); // Alphabetical = chronological due to ISO timestamp in run_id
  } catch (err) {
    console.error(
      `[telemetry] warning: failed to list event files in ${eventsDir}:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Tail events from a JSONL file starting from a given offset.
 *
 * Useful for SSE streaming — read only new events since last check.
 *
 * @param filePath - Absolute path to the JSONL file
 * @param byteOffset - Byte offset to start reading from
 * @returns Object with events array and new byte offset
 */
export function tailJsonlEvents(
  filePath: string,
  byteOffset: number = 0
): { events: BaseEvent[]; newOffset: number } {
  const events: BaseEvent[] = [];

  try {
    if (!fs.existsSync(filePath)) {
      return { events, newOffset: 0 };
    }

    const stats = fs.statSync(filePath);
    if (stats.size <= byteOffset) {
      return { events, newOffset: byteOffset };
    }

    // Open file and read from offset
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(stats.size - byteOffset);
      fs.readSync(fd, buffer, 0, buffer.length, byteOffset);
      const content = buffer.toString("utf-8");

      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const event = JSON.parse(trimmed) as BaseEvent;
          events.push(event);
        } catch {
          // Skip malformed lines in tail mode
        }
      }
    } finally {
      fs.closeSync(fd);
    }

    return { events, newOffset: stats.size };
  } catch (err) {
    console.error(
      `[telemetry] warning: failed to tail ${filePath}:`,
      err instanceof Error ? err.message : err
    );
    return { events, newOffset: byteOffset };
  }
}
