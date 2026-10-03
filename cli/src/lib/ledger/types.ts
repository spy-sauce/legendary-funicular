// Mycelium Framework — VibeSpace LLC — The network provides.
//
// ledger/types.ts — data contract for `mycelium ledger` — the post-cultivate
// run-reconciliation report. Cross-checks what each spawned leaf agent CLAIMED
// (sporenet/state.json) against git/filesystem/telemetry TRUTH.
//
// NOT to be confused with `audit` (the QA-testers subsystem). This is the
// bookkeeping reconciliation of a cultivate run's claims vs observable reality.
//
// These types are ledger-local by design: LedgerLeafState is a superset of
// sporenet's `Leaf` (it adds the additive `conflicted` status + `integrated` +
// `conflict_files` fields that cultivate.ts writes but the sporenet interface
// doesn't declare). We deliberately do NOT import sporenet's Leaf.

// ---------------------------------------------------------------------------
// State stores (as loaded — see collect.ts)
// ---------------------------------------------------------------------------

/** A leaf as it appears in sporenet/state.json — the CLAIMS side. */
export interface LedgerLeafState {
  id: string;
  agent?: string;
  tag?: string;
  scope?: string;
  /** cultivate also writes "conflicted" additively (not in sporenet's union). */
  status: "pending" | "active" | "done" | "failed" | "conflicted" | string;
  commit?: string;
  started_at?: string;
  completed_at?: string;
  synopsis?: string;
  duration_seconds?: number;
  files_produced?: number;
  integrated?: boolean;
  conflict_files?: string[];
}

/** sporenet/state.json root, as loaded. */
export interface LedgerState {
  session_id?: string;
  organism?: string;
  started_at?: string;
  total?: number;
  leaves: LedgerLeafState[];
}

/** A single telemetry event (BaseEvent), narrowed to what the ledger reads. */
export interface LedgerEvent {
  v: number;
  run_id: string;
  organism: string;
  ts: string;
  kind: string;
  data: any;
}

/** Everything the git truth store can tell us about one leaf's commit. */
export interface GitLeafTruth {
  /** state.json-claimed SHA resolves in git. */
  commit_resolved: boolean;
  /** Files actually touched by the leaf commit (name-only). null when no/unresolvable commit. */
  files: string[] | null;
  /** commit is an ancestor of HEAD (i.e. integrated). null when unresolvable. */
  is_ancestor: boolean | null;
  /** feat/<leafId> branch exists. */
  branch_exists: boolean;
}

// ---------------------------------------------------------------------------
// Discrepancies
// ---------------------------------------------------------------------------

export type DiscrepancySeverity = "critical" | "warn" | "info";

export type DiscrepancyCheck =
  | "status_mismatch"
  | "phantom_commit"
  | "ghost_files"
  | "file_count_drift"
  | "not_integrated"
  | "conflicted_leaf"
  | "missing_cost"
  | "duration_drift"
  | "leaf_count_mismatch"
  | "missing_run_ended";

export interface Discrepancy {
  severity: DiscrepancySeverity;
  check: DiscrepancyCheck;
  /** Leaf id, or "(run)" for run-level findings. */
  leaf: string;
  /** What the claim side said. */
  claimed: string;
  /** What the truth side observed. */
  observed: string;
  /** Optional short explanatory note (e.g. "expected on clean local runs"). */
  note?: string;
}

// ---------------------------------------------------------------------------
// Per-leaf reconciled row (for the table)
// ---------------------------------------------------------------------------

export interface LeafLedgerEntry {
  leaf: string;
  /** state.json status. */
  status: string;
  /** files_produced claimed by state.json (null = unknown). */
  files_claimed: number | null;
  /** files actually in the leaf commit (null = git skipped / no commit). */
  files_actual: number | null;
  /** short SHA of state.json commit, or null. */
  commit_short: string | null;
  /** integrated into HEAD: true / false / null (git skipped or no commit). */
  integrated: boolean | null;
  /** summed usd_estimate from cost_recorded events for this leaf, or null when none. */
  cost_usd: number | null;
  /** duration in seconds (state.json). */
  duration_seconds: number | null;
  /** highest-severity discrepancy on this leaf, or null when clean. */
  worst: DiscrepancySeverity | null;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/** Which truth stores were available; degrade gracefully when any is missing. */
export interface LedgerAvailability {
  telemetry: boolean;
  state: boolean;
  git: boolean;
  /** Human-readable notes about what was skipped and why. */
  skipped: string[];
}

export interface LedgerReport {
  run_id: string | null;
  organism: string | null;
  /** ISO timestamp of the earliest event / state started_at, best-effort. */
  when: string | null;
  event_log_path: string | null;
  state_path: string | null;
  availability: LedgerAvailability;

  leaves: LeafLedgerEntry[];
  discrepancies: Discrepancy[];

  /** leaves with no critical/warn discrepancy. */
  leaves_ok: number;
  leaves_total: number;

  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;

  counts: {
    critical: number;
    warn: number;
    info: number;
  };

  /** 0 = clean or info-only, 1 = any critical, 2 = warn-only. */
  exit_code: 0 | 1 | 2;
}
