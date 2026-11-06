// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Dashboard state types + builder — frozen contracts per NUTRIENTS §2.
// Consumed by canvas, console, and CLI renders via window.__DASHBOARD_STATE__.
//
// Types from dashboard.data.types leaf.
// Builder (buildDashboardState) from dashboard.data.state-builder leaf.

import fs from "node:fs";
import path from "node:path";

// ────────────────────────────────────────────────────────────────────────────
// Core Dashboard State — unified shape consumed by canvas + console
// ────────────────────────────────────────────────────────────────────────────

/**
 * Root dashboard state shape. Inlined into served HTML as
 * `window.__DASHBOARD_STATE__` by the render pipeline.
 */
export interface DashboardState {
  organism: {
    name: string;
    started_at: string;        // ISO-8601
    iter: number;              // heal-loop iteration count
    view: "multiverse" | "product";
    active_product_id?: string;
  };
  agents: AgentState[];        // one per biome
  cache: CacheState;
  events: EventEntry[];        // last 200, newest first
  alerts: AlertEntry[];        // active only
  providers: ProviderState[];
}

// ────────────────────────────────────────────────────────────────────────────
// Agent + Leaf + Micro State
// ────────────────────────────────────────────────────────────────────────────

/**
 * State for a single biome agent. Aggregates leaves and tracks
 * lifecycle, cost, and token usage.
 */
export interface AgentState {
  id: string;
  state: "pending" | "active" | "fruit" | "failed" | "dorm";
  paused: boolean;
  contracts: string[];          // NUTRIENTS sections owned
  provider: string;             // "anthropic" | "openai" | ...
  leaves: LeafState[];
  history: AgentSnapshot[];     // per heal-loop iter
  cost_usd: number;
  tokens: number;
}

/**
 * State for a single leaf within an agent. Tracks execution status,
 * produced artifacts, and micro-agent fan-out.
 */
export interface LeafState {
  id: string;
  state: "pending" | "active" | "done" | "failed";
  scope: string;
  files: string[];              // produced artifacts
  commit: string;               // git sha or ""
  duration_seconds: number;
  tokens: number;
  failure_reason?: string;
  micros: MicroState[];         // 2-4 per leaf
}

/**
 * State for a micro-agent within a leaf. Micro-agents are sub-leaf
 * workers that route between cheap and full providers.
 *
 * Per NUTRIENTS §7: MICRO is a frozen vocab term — a sub-leaf worker,
 * 2-4 per leaf, spawned at leaf active, retired at leaf done/failed.
 */
export interface MicroState {
  idx: number;
  routing: "cheap" | "full";    // cheap = haiku-class, full = opus-class
  last_call_was_hit: boolean;
  fire_count: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Cache State
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cache-network state exposed to the dashboard. Populated from
 * `sporenet/state.json` cache block (written by cache-network-integration).
 *
 * Per NUTRIENTS §7: CACHE_NET is a frozen vocab term — the framework-level
 * cache layer shared across all biomes in a cultivation.
 */
export interface CacheState {
  hits: number;
  misses: number;
  entries: number;
  capacity: number;
  recent_keys: string[];        // last 16 key_hash prefixes (12 chars each)
}

// ────────────────────────────────────────────────────────────────────────────
// Event + Alert + Provider State
// ────────────────────────────────────────────────────────────────────────────

/**
 * A single event entry in the dashboard feed. Sourced from the JSONL
 * event stream in `.mycelium/events/<organism>.jsonl`.
 */
export interface EventEntry {
  ts: string;                   // ISO-8601
  category: "lifecycle" | "nutrient" | "cost" | "health" | "anomaly" | "cache";
  source: string;               // biome_id or "operator"
  severity: "info" | "warn" | "alert" | "crit";
  short_type: string;           // e.g., "cache · hit"
  message: string;
}

/**
 * An active alert displayed in the dashboard ribbon.
 */
export interface AlertEntry {
  severity: "warn" | "alert" | "crit";
  message: string;
  ts: string;
}

/**
 * State for a model provider (e.g., Anthropic, OpenAI).
 */
export interface ProviderState {
  id: string;
  up: boolean;
  latency_ms: number;
  model: string;
}

/**
 * Historical snapshot of an agent's state at a given heal-loop iteration.
 * Used for timeline visualization and cost tracking.
 */
export interface AgentSnapshot {
  iter: number;
  state: AgentState["state"];
  tokens: number;
  cost_usd: number;
}

// ────────────────────────────────────────────────────────────────────────────
// SporeNet State — shape read from sporenet/state.json
// (per cli/src/commands/sporenet.ts:34-42 — preserved exactly)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Leaf shape as stored in sporenet/state.json.
 * Internal type — not exported; maps to LeafState.
 */
interface SporeNetLeaf {
  id: string;
  agent: string;
  tag: string;
  scope: string;
  status: "pending" | "active" | "done" | "failed";
  commit?: string;
  started_at?: string;
  completed_at?: string;
  synopsis?: string;
  duration_seconds?: number;
  files_produced?: number;
}

/**
 * SporeNet state.json root shape.
 * Internal type — read-only consumption for buildDashboardState.
 */
interface SporeNetState {
  session_id: string;
  organism: string;
  started_at: string;
  ship_target?: string;
  gating?: string;
  total: number;
  leaves: SporeNetLeaf[];
  // Optional cache block per NUTRIENTS §5
  cache?: {
    hits: number;
    misses: number;
    entries: number;
    capacity: number;
    last_updated: string;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// State Builder — buildDashboardState(cwd)
// dashboard.data.state-builder leaf
// ────────────────────────────────────────────────────────────────────────────

/**
 * Default cache state when cache block is absent from state.json.
 * Per NUTRIENTS §5 reader contract.
 */
const DEFAULT_CACHE_STATE: CacheState = {
  hits: 0,
  misses: 0,
  entries: 0,
  capacity: 0,
  recent_keys: [],
};

/**
 * Map SporeNetLeaf status to LeafState state.
 * "done" in sporenet → "done" in dashboard; others pass through.
 */
function mapLeafState(
  status: SporeNetLeaf["status"]
): LeafState["state"] {
  return status;
}

/**
 * Derive agent state from its leaves' statuses.
 * Per HYPHA: any active → "active", all done → "fruit", any failed → "failed", else "pending".
 */
function deriveAgentState(leaves: LeafState[]): AgentState["state"] {
  if (leaves.length === 0) return "pending";

  const hasActive = leaves.some((l) => l.state === "active");
  if (hasActive) return "active";

  const hasFailed = leaves.some((l) => l.state === "failed");
  if (hasFailed) return "failed";

  const allDone = leaves.every((l) => l.state === "done");
  if (allDone) return "fruit";

  return "pending";
}

/**
 * Build DashboardState from sporenet/state.json.
 *
 * Per NUTRIENTS §2 builder contract:
 * - Synchronous and pure given the same on-disk state.
 * - Re-reads on every call (no caching).
 * - Tolerates missing state.json (returns shape with empty arrays, defaulted cache).
 * - Never throws on missing files — only on malformed JSON.
 *
 * @param cwd - The working directory containing sporenet/state.json
 * @returns Complete DashboardState ready for canvas + console rendering
 */
export function buildDashboardState(cwd: string): DashboardState {
  const statePath = path.join(cwd, "sporenet", "state.json");

  // Handle missing state.json — return empty shape, never throw
  if (!fs.existsSync(statePath)) {
    return {
      organism: {
        name: "",
        started_at: new Date().toISOString(),
        iter: 0,
        view: "multiverse",
      },
      agents: [],
      cache: { ...DEFAULT_CACHE_STATE },
      events: [],
      alerts: [],
      providers: [],
    };
  }

  // Read and parse — throws on malformed JSON (operator concern)
  const raw = fs.readFileSync(statePath, "utf-8");
  const sporeState: SporeNetState = JSON.parse(raw);

  // Group leaves by agent (biome)
  const leafByAgent = new Map<string, SporeNetLeaf[]>();
  for (const leaf of sporeState.leaves) {
    const bucket = leafByAgent.get(leaf.agent) ?? [];
    bucket.push(leaf);
    leafByAgent.set(leaf.agent, bucket);
  }

  // Build AgentState[] from grouped leaves
  const agents: AgentState[] = [];
  for (const [agentId, sporeLeaves] of leafByAgent) {
    // Map SporeNetLeaf → LeafState
    const leaves: LeafState[] = sporeLeaves.map((sl) => ({
      id: sl.id,
      state: mapLeafState(sl.status),
      scope: sl.scope,
      files: [], // files list not in sporenet state.json; default empty
      commit: sl.commit ?? "",
      duration_seconds: sl.duration_seconds ?? 0,
      tokens: 0, // tokens not in sporenet state.json; default 0
      micros: [], // micros populated by cache-network-micros leaf; default empty
    }));

    const agentState: AgentState = {
      id: agentId,
      state: deriveAgentState(leaves),
      paused: false, // paused state not in sporenet; default false
      contracts: [], // contracts not in sporenet; default empty
      provider: "anthropic", // default provider
      leaves,
      history: [], // history not in sporenet; default empty
      cost_usd: 0, // cost not in sporenet; default 0
      tokens: 0, // tokens not in sporenet; default 0
    };

    agents.push(agentState);
  }

  // Read cache block if present, else default to zeros
  const cache: CacheState = sporeState.cache
    ? {
        hits: sporeState.cache.hits,
        misses: sporeState.cache.misses,
        entries: sporeState.cache.entries,
        capacity: sporeState.cache.capacity,
        recent_keys: [], // recent_keys not in sporenet cache block; tailer fills this
      }
    : { ...DEFAULT_CACHE_STATE };

  // Build organism block
  const organism: DashboardState["organism"] = {
    name: sporeState.organism,
    started_at: sporeState.started_at,
    iter: 0, // iter not in sporenet; default 0
    view: "multiverse",
  };

  return {
    organism,
    agents,
    cache,
    events: [], // events populated by events-tailer leaf
    alerts: [], // alerts derived from events; default empty
    providers: [], // providers not in sporenet; default empty
  };
}
