// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Telemetry event builders.
//
// Event schema is frozen per NUTRIENTS.md §1. Every event conforms to BaseEvent,
// with kind-specific payload in the `data` field. These builders ensure type safety
// and contract adherence across all telemetry-emitting upgrades.

/**
 * Event kinds — exhaustive union. Frozen contract.
 */
export type EventKind =
  | "run_started"
  | "leaf_started"
  | "leaf_fruited"
  | "leaf_failed"
  | "run_ended"
  | "ddp_stage_started"
  | "ddp_stage_ended"
  | "alert"
  | "cost_recorded";

/**
 * Base event shape — all events carry these fields.
 * Frozen contract per NUTRIENTS.md §1.
 */
export interface BaseEvent {
  /** Schema version. Always 1 for this cultivation. */
  v: 1;
  /** Unique run identifier: <organism>-<ISO8601-compact>-<4-char-hash> */
  run_id: string;
  /** Organism name from mycelium.yaml */
  organism: string;
  /** ISO-8601 timestamp with milliseconds */
  ts: string;
  /** Event discriminator */
  kind: EventKind;
  /** Kind-specific payload */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/**
 * DDP stage ID — locked list. Order matters.
 * Frozen contract per NUTRIENTS.md §2.
 */
export type DDPStageId =
  | "merge-order"
  | "lint"
  | "typecheck"
  | "test"
  | "build"
  | "deploy-stg"
  | "smoke"
  | "deploy-prod";

// ────────────────────────────────────────────────────────────────────────────
// Per-kind data payloads (TypeScript shapes for documentation)
// ────────────────────────────────────────────────────────────────────────────

export interface RunStartedData {
  total_leaves: number;
  biomes: string[];
  max_concurrency: number;
  gating: string;
}

export interface LeafStartedData {
  leaf_id: string;
  biome: string;
  tag: string;
  scope: string;
  branch: string;
  lineage: string[];
}

export interface LeafFruitedData {
  leaf_id: string;
  biome: string;
  commit_sha: string | null;
  wall_ms: number;
  files_written: number;
  summary: string;
}

export interface LeafFailedData {
  leaf_id: string;
  biome: string;
  wall_ms: number;
  error: string;
}

export interface RunEndedData {
  ok: number;
  failed: number;
  total: number;
  health: number;
  wall_ms: number;
}

export interface DDPStageStartedData {
  stage_id: DDPStageId;
  gh_run_id?: string;
  gh_run_url?: string;
}

export interface DDPStageEndedData {
  stage_id: DDPStageId;
  status: "success" | "failure" | "skipped";
  wall_ms: number;
  logs_url?: string;
}

export interface AlertData {
  severity: "info" | "warn" | "error" | "critical";
  source: string;
  title: string;
  detail: string;
  leaf_id?: string;
}

export interface CostRecordedData {
  leaf_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd_estimate: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Event builders — one per kind
// ────────────────────────────────────────────────────────────────────────────

interface EventBuilderBase {
  run_id: string;
  organism: string;
}

/**
 * Build a `run_started` event.
 */
export function buildRunStarted(
  base: EventBuilderBase,
  data: RunStartedData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "run_started",
    data,
  };
}

/**
 * Build a `leaf_started` event.
 */
export function buildLeafStarted(
  base: EventBuilderBase,
  data: LeafStartedData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "leaf_started",
    data,
  };
}

/**
 * Build a `leaf_fruited` event.
 */
export function buildLeafFruited(
  base: EventBuilderBase,
  data: LeafFruitedData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "leaf_fruited",
    data,
  };
}

/**
 * Build a `leaf_failed` event.
 */
export function buildLeafFailed(
  base: EventBuilderBase,
  data: LeafFailedData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "leaf_failed",
    data,
  };
}

/**
 * Build a `run_ended` event.
 */
export function buildRunEnded(
  base: EventBuilderBase,
  data: RunEndedData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "run_ended",
    data,
  };
}

/**
 * Build a `ddp_stage_started` event.
 */
export function buildDDPStageStarted(
  base: EventBuilderBase,
  data: DDPStageStartedData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "ddp_stage_started",
    data,
  };
}

/**
 * Build a `ddp_stage_ended` event.
 */
export function buildDDPStageEnded(
  base: EventBuilderBase,
  data: DDPStageEndedData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "ddp_stage_ended",
    data,
  };
}

/**
 * Build an `alert` event.
 */
export function buildAlert(
  base: EventBuilderBase,
  data: AlertData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "alert",
    data,
  };
}

/**
 * Build a `cost_recorded` event.
 */
export function buildCostRecorded(
  base: EventBuilderBase,
  data: CostRecordedData
): BaseEvent {
  return {
    v: 1,
    run_id: base.run_id,
    organism: base.organism,
    ts: new Date().toISOString(),
    kind: "cost_recorded",
    data,
  };
}
