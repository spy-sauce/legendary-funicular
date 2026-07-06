// Mycelium Framework — VibeSpace LLC — The network provides.
//
// eval/tasks.ts — YAML task loader + hand-rolled validation for `mycelium eval`.
// Loads evals/tasks/*.yaml into EvalTask objects (types.ts is the frozen
// contract; spec: docs/mycelium-eval-spec.md "Eval task YAML"). Validation is
// strict and exhaustive: every problem in a file is collected and thrown as
// ONE EvalTaskError — never just the first. Unknown keys are hard errors
// (spec posture: "Task fails the validator"), with a single escape hatch —
// a top-level `notes` field for authoring comments. Hand-rolled by design:
// no schema-library dependency (zod is not a dep).

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  CommandJudgeSpec,
  ContractJudgeSpec,
  EvalBudget,
  EvalFixture,
  EvalGates,
  EvalLane,
  EvalTask,
  GrepJudgeSpec,
  JudgeSpec,
  LlmJudgeSpec,
  TscJudgeSpec,
} from "./types.js";
import { EvalTaskError } from "./types.js";

// ---------------------------------------------------------------------------
// Known-key tables (strict contract — anything else is a validation problem)
// ---------------------------------------------------------------------------

const LANES: readonly string[] = ["A", "B", "C"];

const TOP_LEVEL_KEYS = new Set([
  "id",
  "description",
  "lane",
  "fixture",
  "runs",
  "budget",
  "judge",
  "gates",
  "pinned_commit",
  // Authoring-comment escape hatch: accepted, never loaded into the task.
  "notes",
]);

const FIXTURE_KEYS = new Set(["hypha", "nutrients", "scope", "path"]);
const BUDGET_KEYS = new Set(["max_usd", "max_wall_sec"]);
const GATES_KEYS = new Set(["pass_at_k", "pass_caret_k"]);

const JUDGE_KEYS: Record<string, Set<string>> = {
  tsc: new Set(["type", "cwd", "expect"]),
  grep: new Set(["type", "pattern", "files", "min_matches"]),
  command: new Set(["type", "run", "expect"]),
  contract: new Set(["type", "schema", "against"]),
  llm: new Set(["type", "rubric", "pass_threshold"]),
};

/** kebab-ish: lowercase alphanumeric segments joined by single hyphens.
 *  Task ids double as storage directory names (.mycelium/evals/<task-id>/). */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Abbreviated-through-full git sha. */
const SHA_PATTERN = /^[0-9a-fA-F]{7,40}$/;

// ---------------------------------------------------------------------------
// Small validation helpers
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "nothing";
  if (Array.isArray(v)) return "an array";
  if (typeof v === "number") return String(v);
  return `a ${typeof v}`;
}

function checkUnknownKeys(
  obj: Record<string, unknown>,
  known: Set<string>,
  prefix: string,
  problems: string[]
): void {
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      problems.push(`${prefix}${key}: unknown field`);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-section validators — each appends to `problems`, never throws
// ---------------------------------------------------------------------------

function validateFixture(
  raw: unknown,
  lane: unknown,
  problems: string[]
): EvalFixture {
  // Missing fixture is treated as {} — valid for lane C; lanes A/B get their
  // lane-specific required-field problem below.
  let fixture: Record<string, unknown> = {};
  if (raw !== undefined) {
    if (isPlainObject(raw)) {
      fixture = raw;
      checkUnknownKeys(fixture, FIXTURE_KEYS, "fixture.", problems);
      for (const key of FIXTURE_KEYS) {
        if (fixture[key] !== undefined && !isNonEmptyString(fixture[key])) {
          problems.push(`fixture.${key}: expected a non-empty string, got ${describe(fixture[key])}`);
        }
      }
    } else {
      problems.push(`fixture: expected a mapping, got ${describe(raw)}`);
      fixture = {};
    }
  }

  if (lane === "A" && !isNonEmptyString(fixture.path)) {
    problems.push("fixture.path: required for lane A tasks (fixture cultivation directory)");
  }
  if (lane === "B" && !isNonEmptyString(fixture.hypha)) {
    problems.push("fixture.hypha: required for lane B tasks (HYPHA markdown path)");
  }

  const out: EvalFixture = {};
  if (isNonEmptyString(fixture.hypha)) out.hypha = fixture.hypha;
  if (isNonEmptyString(fixture.nutrients)) out.nutrients = fixture.nutrients;
  if (isNonEmptyString(fixture.scope)) out.scope = fixture.scope;
  if (isNonEmptyString(fixture.path)) out.path = fixture.path;
  return out;
}

function validateBudget(raw: unknown, problems: string[]): EvalBudget | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    problems.push(`budget: expected a mapping, got ${describe(raw)}`);
    return undefined;
  }
  checkUnknownKeys(raw, BUDGET_KEYS, "budget.", problems);
  const out: EvalBudget = {};
  for (const key of ["max_usd", "max_wall_sec"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (!isFiniteNumber(v) || v <= 0) {
      problems.push(`budget.${key}: expected a positive number, got ${describe(v)}`);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function validateGates(raw: unknown, problems: string[]): EvalGates | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    problems.push(`gates: expected a mapping, got ${describe(raw)}`);
    return undefined;
  }
  checkUnknownKeys(raw, GATES_KEYS, "gates.", problems);
  const out: EvalGates = {};
  for (const key of ["pass_at_k", "pass_caret_k"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (!isFiniteNumber(v) || v < 0 || v > 1) {
      problems.push(`gates.${key}: expected a number in [0, 1], got ${describe(v)}`);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function validateJudge(
  raw: unknown,
  index: number,
  problems: string[]
): JudgeSpec | null {
  const prefix = `judge[${index}]`;
  if (!isPlainObject(raw)) {
    problems.push(`${prefix}: expected a mapping, got ${describe(raw)}`);
    return null;
  }

  const type = raw.type;
  if (!isNonEmptyString(type)) {
    problems.push(`${prefix}.type: required (tsc | grep | command | contract | llm)`);
    return null;
  }
  const known = JUDGE_KEYS[type];
  if (!known) {
    problems.push(`${prefix}.type: unknown judge type "${type}" (expected tsc | grep | command | contract | llm)`);
    return null;
  }

  checkUnknownKeys(raw, known, `${prefix}.`, problems);
  const before = problems.length;

  const requireString = (key: string, hint: string): string => {
    const v = raw[key];
    if (!isNonEmptyString(v)) {
      problems.push(`${prefix}.${key}: required non-empty string (${hint})`);
      return "";
    }
    return v;
  };
  const optionalString = (key: string): string | undefined => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (!isNonEmptyString(v)) {
      problems.push(`${prefix}.${key}: expected a non-empty string, got ${describe(v)}`);
      return undefined;
    }
    return v;
  };
  const optionalExitCode = (key: string): number | undefined => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (!isFiniteNumber(v) || !Number.isInteger(v) || v < 0) {
      problems.push(`${prefix}.${key}: expected a non-negative integer exit code, got ${describe(v)}`);
      return undefined;
    }
    return v;
  };

  let spec: JudgeSpec | null = null;

  switch (type) {
    case "tsc": {
      const j: TscJudgeSpec = { type: "tsc" };
      const cwd = optionalString("cwd");
      if (cwd !== undefined) j.cwd = cwd;
      const expect = optionalExitCode("expect");
      if (expect !== undefined) j.expect = expect;
      spec = j;
      break;
    }
    case "grep": {
      const pattern = requireString("pattern", "JS regular expression source");
      const files = requireString("files", "file or directory path relative to the trial dir");
      if (pattern) {
        try {
          new RegExp(pattern);
        } catch (err) {
          problems.push(`${prefix}.pattern: does not compile as a regular expression (${err instanceof Error ? err.message : String(err)})`);
        }
      }
      const j: GrepJudgeSpec = { type: "grep", pattern, files };
      const minMatches = raw.min_matches;
      if (minMatches !== undefined) {
        if (!isFiniteNumber(minMatches) || !Number.isInteger(minMatches) || minMatches < 1) {
          problems.push(`${prefix}.min_matches: expected an integer >= 1, got ${describe(minMatches)}`);
        } else {
          j.min_matches = minMatches;
        }
      }
      spec = j;
      break;
    }
    case "command": {
      const run = requireString("run", "shell command run with cwd = trial dir");
      const j: CommandJudgeSpec = { type: "command", run };
      const expect = optionalExitCode("expect");
      if (expect !== undefined) j.expect = expect;
      spec = j;
      break;
    }
    case "contract": {
      const schema = requireString("schema", 'named contract, e.g. "nutrients.event_schema"');
      const against = requireString("against", "path to the JSONL file to check");
      spec = { type: "contract", schema, against } satisfies ContractJudgeSpec;
      break;
    }
    case "llm": {
      const rubric = requireString("rubric", "grading rubric text");
      const j: LlmJudgeSpec = { type: "llm", rubric };
      const threshold = raw.pass_threshold;
      if (threshold !== undefined) {
        if (!isFiniteNumber(threshold) || threshold < 1 || threshold > 5) {
          problems.push(`${prefix}.pass_threshold: expected a number in [1, 5], got ${describe(threshold)}`);
        } else {
          j.pass_threshold = threshold;
        }
      }
      spec = j;
      break;
    }
  }

  return problems.length === before ? spec : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and validate a single eval task YAML file.
 *
 * Collects EVERY validation problem before throwing one EvalTaskError —
 * an author fixing a task sees the full list, not a whack-a-mole loop.
 * On success, returns the EvalTask with `source_path` set to the absolute
 * path of the file.
 */
export function loadTaskFile(filePath: string): EvalTask {
  const absPath = path.resolve(filePath);

  let text: string;
  try {
    text = fs.readFileSync(absPath, "utf-8");
  } catch (err) {
    throw new EvalTaskError(`Cannot read eval task file: ${absPath}`, [
      err instanceof Error ? err.message : String(err),
    ]);
  }

  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    throw new EvalTaskError(`Invalid YAML in eval task file: ${absPath}`, [
      err instanceof Error ? err.message : String(err),
    ]);
  }

  if (!isPlainObject(raw)) {
    throw new EvalTaskError(`Invalid eval task file: ${absPath}`, [
      `top level: expected a YAML mapping, got ${describe(raw)}`,
    ]);
  }

  const problems: string[] = [];
  checkUnknownKeys(raw, TOP_LEVEL_KEYS, "", problems);

  // id — required, kebab-ish (doubles as the storage directory name).
  const id = raw.id;
  if (!isNonEmptyString(id)) {
    problems.push(`id: required non-empty string, got ${describe(id)}`);
  } else if (!ID_PATTERN.test(id)) {
    problems.push(`id: "${id}" is not kebab-case (expected lowercase alphanumerics and single hyphens, e.g. "single-leaf-telemetry")`);
  }

  // description — optional string.
  if (raw.description !== undefined && typeof raw.description !== "string") {
    problems.push(`description: expected a string, got ${describe(raw.description)}`);
  }

  // lane — required A | B | C.
  const lane = raw.lane;
  if (typeof lane !== "string" || !LANES.includes(lane)) {
    problems.push(`lane: expected "A", "B" or "C", got ${typeof lane === "string" ? `"${lane}"` : describe(lane)}`);
  }

  // runs — required integer >= 1 (k for pass@k; "< 3 is meaningless" is a
  // runner-level warning per types.ts, not a loader refusal).
  const runs = raw.runs;
  if (!isFiniteNumber(runs) || !Number.isInteger(runs) || runs < 1) {
    problems.push(`runs: expected an integer >= 1, got ${describe(runs)}`);
  }

  // fixture — lane-aware.
  const fixture = validateFixture(raw.fixture, lane, problems);

  // budget / gates — optional blocks.
  const budget = validateBudget(raw.budget, problems);
  const gates = validateGates(raw.gates, problems);

  // judge — required non-empty array; every entry valid; at least one
  // deterministic (non-llm) judge. LLM-only judging is a spec anti-pattern
  // and a hard validation error.
  const judges: JudgeSpec[] = [];
  if (!Array.isArray(raw.judge) || raw.judge.length === 0) {
    problems.push(`judge: required non-empty array of judge specs, got ${describe(raw.judge)}`);
  } else {
    let deterministic = 0;
    raw.judge.forEach((entry, i) => {
      const spec = validateJudge(entry, i, problems);
      if (spec) judges.push(spec);
      if (isPlainObject(entry) && typeof entry.type === "string" && entry.type in JUDGE_KEYS && entry.type !== "llm") {
        deterministic++;
      }
    });
    if (deterministic === 0) {
      problems.push("judge: at least one deterministic judge (tsc | grep | command | contract) is required — LLM-only judging is a spec anti-pattern");
    }
  }

  // pinned_commit — optional, must look like a hex sha.
  const pinnedCommit = raw.pinned_commit;
  if (pinnedCommit !== undefined) {
    if (typeof pinnedCommit !== "string" || !SHA_PATTERN.test(pinnedCommit)) {
      problems.push(`pinned_commit: expected a 7-40 char hex git sha, got ${typeof pinnedCommit === "string" ? `"${pinnedCommit}"` : describe(pinnedCommit)}`);
    }
  }

  if (problems.length > 0) {
    throw new EvalTaskError(`Invalid eval task file: ${absPath}`, problems);
  }

  const task: EvalTask = {
    id: id as string,
    lane: lane as EvalLane,
    fixture,
    runs: runs as number,
    judge: judges,
    source_path: absPath,
  };
  if (typeof raw.description === "string") task.description = raw.description;
  if (budget && Object.keys(budget).length > 0) task.budget = budget;
  if (gates && Object.keys(gates).length > 0) task.gates = gates;
  if (typeof pinnedCommit === "string") task.pinned_commit = pinnedCommit;
  return task;
}

/**
 * Load every *.yaml / *.yml task in `tasksDir` (non-recursive), sorted by
 * filename. Per-file problems are aggregated into ONE EvalTaskError listing
 * every bad file + problem. Returns [] when the directory does not exist —
 * the caller owns the "no tasks yet" messaging.
 */
export function loadAllTasks(tasksDir: string): EvalTask[] {
  if (!fs.existsSync(tasksDir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tasksDir, { withFileTypes: true });
  } catch (err) {
    throw new EvalTaskError(`Cannot read eval tasks directory: ${tasksDir}`, [
      err instanceof Error ? err.message : String(err),
    ]);
  }

  const files = entries
    .filter((e) => e.isFile() && /\.ya?ml$/i.test(e.name))
    .map((e) => e.name)
    .sort();

  const tasks: EvalTask[] = [];
  const problems: string[] = [];
  const seenIds = new Map<string, string>(); // task id → filename that defined it

  for (const name of files) {
    try {
      const task = loadTaskFile(path.join(tasksDir, name));
      const prior = seenIds.get(task.id);
      if (prior !== undefined) {
        // Task ids key the storage layout (.mycelium/evals/<task-id>/) —
        // duplicates would silently interleave runs.
        problems.push(`${name}: duplicate task id "${task.id}" (already defined in ${prior})`);
      } else {
        seenIds.set(task.id, name);
        tasks.push(task);
      }
    } catch (err) {
      if (err instanceof EvalTaskError && err.problems.length > 0) {
        for (const p of err.problems) problems.push(`${name}: ${p}`);
      } else {
        problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (problems.length > 0) {
    throw new EvalTaskError(
      `Invalid eval task file(s) in ${tasksDir} (${problems.length} problem${problems.length === 1 ? "" : "s"})`,
      problems
    );
  }

  return tasks;
}
