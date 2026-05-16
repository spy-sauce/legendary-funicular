// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Dashboard state types — frozen contracts per NUTRIENTS §2.
// Consumed by canvas, console, and CLI renders via window.__DASHBOARD_STATE__.
//
// This file exports pure types only (dashboard.data.types leaf).
// Builder and event tailer logic lives in sibling leaves.

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
