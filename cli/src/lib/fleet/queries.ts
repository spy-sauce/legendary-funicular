// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Fleet query API — typed wrappers over DuckDB JSONL queries.
//
// Contract: NUTRIENTS.md §10 — Fleet query (DuckDB over JSONL)
// Scope: Provide typed query functions for cross-organism rollups.
// Rules: No raw SQL leaks outside this file. Read-only aggregations only.

import { query } from "./duckdb.js";
import type { DDPStageId } from "../telemetry/events.js";

/**
 * Organism summary record from listOrganisms query.
 */
export interface OrganismSummary {
  name: string;
  last_run_at: string | null;
  run_count: number;
}

/**
 * Organism rollup metrics from organismRollup query.
 */
export interface OrganismRollup {
  avg_health: number;
  total_runs: number;
  total_cost_usd: number;
  last_health: number | null;
  last_run_wall_ms: number | null;
}

/**
 * DDP stage duration statistics.
 */
export interface StageDuration {
  stage_id: DDPStageId;
  avg_ms: number;
  p95_ms: number;
  n: number;
}

/**
 * Biome failure rate statistics.
 */
export interface LeafFailureRate {
  biome: string;
  fail_rate: number;
  n: number;
}

/**
 * List all organisms found in event logs with basic rollup stats.
 *
 * @returns Array of organism summaries ordered by last_run_at descending.
 */
export async function listOrganisms(): Promise<OrganismSummary[]> {
  const sql = `
    SELECT
      organism AS name,
      MAX(ts) AS last_run_at,
      COUNT(DISTINCT run_id) AS run_count
    FROM read_json_auto('.mycelium/events/*.jsonl', format='newline_delimited')
    WHERE kind = 'run_ended'
    GROUP BY organism
    ORDER BY last_run_at DESC NULLS LAST
  `;

  return query<OrganismSummary>(sql, []);
}

/**
 * Get aggregate metrics for a specific organism across all runs.
 *
 * @param name - Organism name to query.
 * @returns Rollup metrics for the organism, or zeros if not found.
 */
export async function organismRollup(name: string): Promise<OrganismRollup> {
  const sql = `
    WITH run_stats AS (
      SELECT
        data->>'health' AS health,
        data->>'wall_ms' AS wall_ms,
        ts
      FROM read_json_auto('.mycelium/events/*.jsonl', format='newline_delimited')
      WHERE kind = 'run_ended' AND organism = ?
    ),
    cost_stats AS (
      SELECT
        COALESCE(SUM(CAST(data->>'usd_estimate' AS DOUBLE)), 0.0) AS total_cost
      FROM read_json_auto('.mycelium/events/*.jsonl', format='newline_delimited')
      WHERE kind = 'cost_recorded' AND organism = ?
    ),
    latest_run AS (
      SELECT
        CAST(health AS DOUBLE) AS last_health,
        CAST(wall_ms AS DOUBLE) AS last_wall_ms
      FROM run_stats
      ORDER BY ts DESC
      LIMIT 1
    )
    SELECT
      COALESCE(AVG(CAST(r.health AS DOUBLE)), 0.0) AS avg_health,
      COUNT(*) AS total_runs,
      c.total_cost AS total_cost_usd,
      l.last_health,
      l.last_wall_ms AS last_run_wall_ms
    FROM run_stats r
    CROSS JOIN cost_stats c
    LEFT JOIN latest_run l ON true
    GROUP BY c.total_cost, l.last_health, l.last_wall_ms
  `;

  const rows = await query<OrganismRollup>(sql, [name, name]);

  // If organism has no runs, return zeros
  if (rows.length === 0) {
    return {
      avg_health: 0,
      total_runs: 0,
      total_cost_usd: 0,
      last_health: null,
      last_run_wall_ms: null,
    };
  }

  return rows[0];
}

/**
 * Get average and p95 durations for each DDP stage for a given organism.
 *
 * @param organism - Organism name to query.
 * @param lastN - Optional: limit to the last N runs (by run_id timestamp).
 * @returns Array of stage duration statistics, ordered by stage pipeline position.
 */
export async function stageDurations(
  organism: string,
  lastN?: number
): Promise<StageDuration[]> {
  // Stage order locked per NUTRIENTS.md §2
  const stageOrder = [
    "merge-order",
    "lint",
    "typecheck",
    "test",
    "build",
    "deploy-stg",
    "smoke",
    "deploy-prod",
  ];

  const limitClause = lastN ? `LIMIT ${Math.max(1, Math.floor(lastN))}` : "";

  const sql = `
    WITH recent_runs AS (
      SELECT DISTINCT run_id
      FROM read_json_auto('.mycelium/events/*.jsonl', format='newline_delimited')
      WHERE kind = 'ddp_stage_ended' AND organism = ?
      ORDER BY run_id DESC
      ${limitClause}
    ),
    stage_data AS (
      SELECT
        data->>'stage_id' AS stage_id,
        CAST(data->>'wall_ms' AS DOUBLE) AS wall_ms
      FROM read_json_auto('.mycelium/events/*.jsonl', format='newline_delimited')
      WHERE
        kind = 'ddp_stage_ended'
        AND organism = ?
        AND run_id IN (SELECT run_id FROM recent_runs)
        AND data->>'status' != 'skipped'
    )
    SELECT
      stage_id,
      AVG(wall_ms) AS avg_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY wall_ms) AS p95_ms,
      COUNT(*) AS n
    FROM stage_data
    GROUP BY stage_id
  `;

  const rows = await query<StageDuration>(sql, [organism, organism]);

  // Sort by pipeline order
  return rows.sort((a: StageDuration, b: StageDuration) => {
    const indexA = stageOrder.indexOf(a.stage_id);
    const indexB = stageOrder.indexOf(b.stage_id);
    return indexA - indexB;
  });
}

/**
 * Get leaf failure rates by biome for a given organism.
 *
 * @param organism - Organism name to query.
 * @returns Array of biome failure statistics, ordered by fail_rate descending.
 */
export async function leafFailureRate(
  organism: string
): Promise<LeafFailureRate[]> {
  const sql = `
    WITH leaf_outcomes AS (
      SELECT
        data->>'biome' AS biome,
        CASE WHEN kind = 'leaf_failed' THEN 1 ELSE 0 END AS is_failure
      FROM read_json_auto('.mycelium/events/*.jsonl', format='newline_delimited')
      WHERE
        organism = ?
        AND kind IN ('leaf_fruited', 'leaf_failed')
    )
    SELECT
      biome,
      CAST(SUM(is_failure) AS DOUBLE) / COUNT(*) AS fail_rate,
      COUNT(*) AS n
    FROM leaf_outcomes
    GROUP BY biome
    ORDER BY fail_rate DESC
  `;

  return query<LeafFailureRate>(sql, [organism]);
}
