// Mycelium Framework — VibeSpace LLC — The network provides.
//
// S3 telemetry sink — best-effort, never throws.
//
// This sink is gated on MYCELIUM_S3_BUCKET env. If unset, returns a no-op sink.
// Uses @aws-sdk/client-s3 only if already present in the runtime — otherwise
// emits a single stderr warning and no-ops. This module defines the adapter
// shape; wiring real S3 requires the consuming project to install the SDK.
//
// Buffer semantics:
//   - Events are buffered in memory
//   - Flush triggers: close() call, 50 events reached, or 5s since last flush
//   - S3 key format: .mycelium/events/<run_id>.jsonl (mirrors local layout)
//
// Contract: NUTRIENTS.md §1 (event schema), HYPHA-TELEMETRY-AGENT.md

import type { BaseEvent } from "./events.js";

/**
 * Sink interface — same shape as JSONL sink for composability.
 */
export interface S3Sink {
  /** Append an event to the buffer. Triggers flush if buffer is full. */
  append(event: BaseEvent): void;
  /** Flush remaining buffer and close the sink. */
  close(): Promise<void>;
}

/**
 * Configuration resolved from environment.
 */
interface S3Config {
  bucket: string;
  region: string;
  prefix: string;
}

/** Flush every N events */
const FLUSH_THRESHOLD = 50;
/** Flush every N milliseconds */
const FLUSH_INTERVAL_MS = 5000;

/**
 * Attempt to dynamically import @aws-sdk/client-s3.
 * Returns null if not installed (expected in most dev environments).
 */
async function tryLoadS3Client(): Promise<{
  S3Client: any;
  PutObjectCommand: any;
} | null> {
  try {
    // Dynamic import — only succeeds if @aws-sdk/client-s3 is installed
    const sdk = await import("@aws-sdk/client-s3");
    return {
      S3Client: sdk.S3Client,
      PutObjectCommand: sdk.PutObjectCommand,
    };
  } catch {
    return null;
  }
}

/**
 * Create a no-op sink that silently discards events.
 */
function createNoopSink(): S3Sink {
  return {
    append: () => {},
    close: async () => {},
  };
}

/**
 * Open an S3 sink for the given run.
 *
 * Gated on MYCELIUM_S3_BUCKET env. If unset, returns a no-op sink.
 * If @aws-sdk/client-s3 is not installed, emits a single warning and returns no-op.
 *
 * @param runId - The telemetry run ID (used in S3 key)
 * @returns Sink with append() and close() methods
 */
export async function openS3Sink(runId: string): Promise<S3Sink> {
  // Gate 1: Check for bucket configuration
  const bucket = process.env.MYCELIUM_S3_BUCKET;
  if (!bucket) {
    // No bucket configured — silent no-op (expected in local dev)
    return createNoopSink();
  }

  // Gate 2: Check for AWS SDK availability
  const sdk = await tryLoadS3Client();
  if (!sdk) {
    // SDK not installed — emit one warning, then no-op
    console.error(
      "[telemetry-s3] @aws-sdk/client-s3 not installed — S3 sink disabled. " +
        "Install it to enable remote telemetry: npm install @aws-sdk/client-s3"
    );
    return createNoopSink();
  }

  // Resolve configuration
  const config: S3Config = {
    bucket,
    region: process.env.MYCELIUM_S3_REGION || process.env.AWS_REGION || "us-east-1",
    prefix: process.env.MYCELIUM_S3_PREFIX || ".mycelium/events",
  };

  // Initialize S3 client
  let client: any;
  try {
    client = new sdk.S3Client({ region: config.region });
  } catch (err) {
    console.error(
      `[telemetry-s3] Failed to initialize S3 client: ${err instanceof Error ? err.message : String(err)}`
    );
    return createNoopSink();
  }

  // Buffer state
  const buffer: BaseEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;
  let uploadCount = 0;

  /**
   * Flush buffered events to S3.
   * Called on threshold, timer, or close().
   */
  async function flush(): Promise<void> {
    if (buffer.length === 0) return;

    // Clear pending timer
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    // Drain buffer
    const events = buffer.splice(0, buffer.length);
    uploadCount++;

    // Build JSONL content
    const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";

    // S3 key: <prefix>/<run_id>/<upload_count>.jsonl
    // Using numbered uploads allows concurrent appends without overwrite
    const key = `${config.prefix}/${runId}/${String(uploadCount).padStart(6, "0")}.jsonl`;

    try {
      const command = new sdk.PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: content,
        ContentType: "application/x-ndjson",
      });
      await client.send(command);
    } catch (err) {
      // Best-effort: log and continue, never throw
      console.error(
        `[telemetry-s3] Failed to upload to s3://${config.bucket}/${key}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Schedule a flush after FLUSH_INTERVAL_MS if not already scheduled.
   */
  function scheduleFlush(): void {
    if (flushTimer || isClosed) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch((err) => {
        console.error(
          `[telemetry-s3] Scheduled flush error: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }, FLUSH_INTERVAL_MS);
  }

  return {
    append(event: BaseEvent): void {
      if (isClosed) {
        console.error("[telemetry-s3] append() called after close() — event dropped");
        return;
      }

      buffer.push(event);

      // Flush if buffer is full
      if (buffer.length >= FLUSH_THRESHOLD) {
        flush().catch((err) => {
          console.error(
            `[telemetry-s3] Threshold flush error: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      } else {
        // Schedule timer-based flush
        scheduleFlush();
      }
    },

    async close(): Promise<void> {
      if (isClosed) return;
      isClosed = true;

      // Clear any pending timer
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      // Final flush
      await flush();

      // Destroy client if possible
      try {
        if (client && typeof client.destroy === "function") {
          client.destroy();
        }
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Check if S3 sink would be active (useful for diagnostics).
 * Returns true if MYCELIUM_S3_BUCKET is set.
 */
export function isS3SinkConfigured(): boolean {
  return Boolean(process.env.MYCELIUM_S3_BUCKET);
}
