// Mycelium Framework — VibeSpace LLC — The network provides.
//
// eval/types.ts — frozen data contract for `mycelium eval` (backlog 0.2).
// Shared by tasks.ts / metrics.ts / judges.ts / runner.ts / report.ts and
// the eval command. Spec: docs/mycelium-eval-spec.md. The on-disk
// summary.json / baseline JSON files follow these field names — amend
// deliberately, never casually.

export type EvalLane = "A" | "B" | "C";

// ---------------------------------------------------------------------------
// Judge specs — discriminated on `type`.
// Deterministic judges (tsc, grep, command, contract) are first-class.
// `llm` is phase-4: judges.ts reports it as skipped, and a trial's pass
// verdict ignores skipped judges.
// ---------------------------------------------------------------------------

export interface TscJudgeSpec {
  type: "tsc";
  /** Directory (relative to the trial dir) to run `npx tsc --noEmit` in. */
  cwd?: string;
  /** Expected exit code. Default 0. */
  expect?: number;
}

export interface GrepJudgeSpec {
  type: "grep";
  /** JS regular expression source (no slashes), applied per file. */
  pattern: string;
  /** File or directory path relative to the trial dir; dirs walk recursively. */
  files: string;
  /** Minimum total matches across all files. Default 1. */
  min_matches?: number;
}

export interface CommandJudgeSpec {
  type: "command";
  /** Shell command run with cwd = trial dir. */
  run: string;
  /** Expected exit code. Default 0. */
  expect?: number;
}

export interface ContractJudgeSpec {
  type: "contract";
  /** Named contract, e.g. "nutrients.event_schema" (v1: JSONL well-formedness
   *  + required event fields; full NUTRIENTS generators live in
   *  docs/contract-tests-from-nutrients.md and land later). */
  schema: string;
  /** Path (relative to trial dir) to the JSONL file to check. May contain
   *  a `<run_id>` placeholder — resolved to the newest matching file. */
  against: string;
}

export interface LlmJudgeSpec {
  type: "llm";
  rubric: string;
  /** Pass threshold on a 1-5 rubric score. Default 4. */
  pass_threshold?: number;
}

export type JudgeSpec =
  | TscJudgeSpec
  | GrepJudgeSpec
  | CommandJudgeSpec
  | ContractJudgeSpec
  | LlmJudgeSpec;

// ---------------------------------------------------------------------------
// Task definition (loaded from evals/tasks/*.yaml)
// ---------------------------------------------------------------------------

export interface EvalFixture {
  /** Lane B: HYPHA markdown path, relative to the repo root. */
  hypha?: string;
  /** Lane B: NUTRIENTS markdown path, relative to the repo root. */
  nutrients?: string;
  /** Lane B: the artifact path the leaf is asked to produce (prompt hint). */
  scope?: string;
  /** Lane A: fixture cultivation directory (mycelium.yaml + hyphae/ +
   *  NUTRIENTS.md), relative to the repo root. Copied per trial. */
  path?: string;
}

export interface EvalBudget {
  /** Per-trial cost ceiling in USD. Trial FAILS on overshoot even if judges pass. */
  max_usd?: number;
  /** Per-trial wall-clock ceiling in seconds. */
  max_wall_sec?: number;
}

export interface EvalGates {
  /** Minimum pass@k (0..1) for the task to be considered shipping. */
  pass_at_k?: number;
  /** Minimum pass^k (0..1) — stability floor. */
  pass_caret_k?: number;
}

export interface EvalTask {
  id: string;
  description?: string;
  lane: EvalLane;
  fixture: EvalFixture;
  /** k — trials per run. Spec anti-pattern: below 3 is meaningless; the
   *  runner warns but does not refuse. */
  runs: number;
  budget?: EvalBudget;
  judge: JudgeSpec[];
  gates?: EvalGates;
  /** Framework commit the task was authored against. Recorded into the
   *  summary; eval always executes the CURRENT built CLI (see runner.ts). */
  pinned_commit?: string;
  /** Absolute path of the YAML file this task was loaded from. */
  source_path?: string;
}

/** Thrown by tasks.ts — carries every validation problem found, not just the first. */
export class EvalTaskError extends Error {
  readonly problems: string[];
  constructor(message: string, problems: string[] = []) {
    super(problems.length ? `${message}\n  - ${problems.join("\n  - ")}` : message);
    this.name = "EvalTaskError";
    this.problems = problems;
  }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface JudgeResult {
  type: JudgeSpec["type"];
  pass: boolean;
  /** Human-readable evidence: exit codes, match counts, first error lines. */
  detail: string;
  /** True when the judge did not run (e.g. llm deferred to phase 4).
   *  Skipped judges do not count against a trial's pass verdict. */
  skipped?: boolean;
}

export interface TrialResult {
  /** 1-based trial index. */
  trial: number;
  /** All non-skipped judges passed AND budget respected AND no infra error. */
  pass: boolean;
  judges: JudgeResult[];
  /** Observed spend; 0 when unknown (detail recorded in `notes`). */
  cost_usd: number;
  wall_ms: number;
  files_written: number;
  budget_exceeded: boolean;
  /** Infra failure (spawn error, timeout) — trial did not complete. */
  error?: string;
  /** Free-form runner notes (e.g. "cost unknown: no cost_recorded events"). */
  notes?: string;
}

export interface TaskRunSummary {
  task_id: string;
  lane: EvalLane;
  pinned_commit?: string;
  /** Framework commit actually executed (rev-parse HEAD of the repo root). */
  framework_commit?: string;
  /** ISO-8601 timestamp; doubles as the run directory name (colons → dashes). */
  timestamp: string;
  runs: number;
  trials: TrialResult[];
  /** 1 if trial #1 passed, else 0. */
  pass_at_1: number;
  /** 1 if at least one trial passed, else 0. */
  pass_at_k: number;
  /** 1 if every trial passed (and there was at least one), else 0. */
  pass_caret_k: number;
  /** Fraction of trials passing (headline reliability across the set). */
  pass_rate: number;
  total_cost_usd: number;
  total_wall_ms: number;
  /** null when the task declares no gates. */
  gates_met: boolean | null;
}

export interface EvalBaseline {
  task_id: string;
  pinned_commit?: string;
  accepted_at: string;
  summary: TaskRunSummary;
}

export interface BaselineDelta {
  task_id: string;
  baseline: EvalBaseline | null;
  current: TaskRunSummary;
  /** current − baseline; null when no baseline exists. */
  pass_at_k_delta: number | null;
  pass_caret_k_delta: number | null;
  /** (current − baseline) / baseline × 100; null when no baseline or baseline cost 0. */
  cost_delta_pct: number | null;
  /** pass@k decreased, pass^k decreased, or cost drifted beyond +20%. */
  regression: boolean;
}

// ---------------------------------------------------------------------------
// Execution contexts
// ---------------------------------------------------------------------------

export interface JudgeContext {
  /** The directory the trial's outputs live in (judges resolve paths here). */
  trialDir: string;
  /** Framework repo root (for judges that need the toolchain, e.g. tsc). */
  repoRoot: string;
}

export interface RunnerOptions {
  /** Framework repo root (contains cli/, evals/, .mycelium/). */
  repoRoot: string;
  /** Override task.runs (k). */
  runsOverride?: number;
  /** Parallel trials. Default 1 (serial) — SDK rate-limit discipline. */
  concurrency?: number;
  /** Keep trial dirs on disk after the run (default: keep — they live under
   *  the gitignored .mycelium/evals/ and are the audit trail). */
  keepTrialDirs?: boolean;
  /** Progress sink; defaults to console.log. */
  log?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Storage layout (relative to repoRoot) — spec §Storage
// ---------------------------------------------------------------------------

export const EVAL_TASKS_DIR = "evals/tasks";
export const EVAL_FIXTURES_DIR = "evals/fixtures";
export const EVAL_OUTPUT_ROOT = ".mycelium/evals";
export const EVAL_BASELINES_DIR = ".mycelium/evals/baselines";
