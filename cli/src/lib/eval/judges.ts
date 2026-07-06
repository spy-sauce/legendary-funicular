// Mycelium Framework — VibeSpace LLC — The network provides.
//
// eval/judges.ts — deterministic judge executors for `mycelium eval`.
// Runs the JudgeSpec union from ./types.js against a trial directory and
// returns JudgeResult evidence. Deterministic judges (tsc, grep, command,
// contract) are first-class; the `llm` judge is deferred to phase 4
// (docs/mycelium-eval-spec.md) and reports itself as skipped.
//
// Contract: runJudges NEVER throws — every internal error (bad regex,
// missing file, spawn failure, timeout) becomes a pass:false result with
// the error captured in `detail`. Subprocess judges get a hard 120s
// timeout; on trip the child is killed and the result says so.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  CommandJudgeSpec,
  ContractJudgeSpec,
  GrepJudgeSpec,
  JudgeContext,
  JudgeResult,
  JudgeSpec,
  TscJudgeSpec,
} from "./types.js";

/** Hard wall-clock ceiling for subprocess judges (tsc, command). */
const JUDGE_TIMEOUT_MS = 120_000;

/** Output capture ceiling — plenty for tsc error dumps without OOM risk. */
const JUDGE_MAX_BUFFER = 16 * 1024 * 1024;

/** Directory names never descended into when walking a trial dir. */
const WALK_SKIP_DIRS = new Set(["node_modules", ".git", ".mycelium"]);

const LLM_DEFERRED_DETAIL =
  "llm judge deferred to phase 4 (docs/mycelium-eval-spec.md)";

const CONTRACT_V1_NOTE =
  "v1 well-formedness check; full contract generators deferred";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Execute one judge. Never throws — errors become pass:false results. */
export async function runJudge(
  spec: JudgeSpec,
  ctx: JudgeContext
): Promise<JudgeResult> {
  try {
    switch (spec.type) {
      case "tsc":
        return await runTscJudge(spec, ctx);
      case "grep":
        return runGrepJudge(spec, ctx);
      case "command":
        return await runCommandJudge(spec, ctx);
      case "contract":
        return runContractJudge(spec, ctx);
      case "llm":
        return { type: "llm", pass: false, skipped: true, detail: LLM_DEFERRED_DETAIL };
    }
    // Unreachable with a well-formed spec (tasks.ts validates), but stay defensive.
    return {
      type: (spec as JudgeSpec).type,
      pass: false,
      detail: `unknown judge type: ${JSON.stringify((spec as JudgeSpec).type)}`,
    };
  } catch (err: any) {
    return {
      type: spec.type,
      pass: false,
      detail: `judge error: ${err?.message ?? String(err)}`,
    };
  }
}

/**
 * Execute judges sequentially (deterministic ordering, no subprocess
 * contention). NEVER throws — any internal error becomes a pass:false
 * result with the error in `detail`.
 */
export async function runJudges(
  specs: JudgeSpec[],
  ctx: JudgeContext
): Promise<JudgeResult[]> {
  const results: JudgeResult[] = [];
  for (const spec of specs) {
    try {
      results.push(await runJudge(spec, ctx));
    } catch (err: any) {
      // runJudge already catches; this is the belt to its braces.
      results.push({
        type: spec.type,
        pass: false,
        detail: `judge error: ${err?.message ?? String(err)}`,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Subprocess plumbing
// ---------------------------------------------------------------------------

interface ExecOutcome {
  /** Numeric exit code; null on timeout/kill or spawn failure. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Set when the child died to a signal we did NOT send (not a timeout). */
  signal: string | null;
  /** Set when the child never ran (e.g. ENOENT). */
  spawnError: string | null;
}

/** execFile wrapped in a promise that resolves (never rejects) with the outcome. */
function execJudge(cmd: string, args: string[], cwd: string): Promise<ExecOutcome> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd,
        timeout: JUDGE_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: JUDGE_MAX_BUFFER,
        encoding: "utf-8",
      },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({
            exitCode: 0,
            stdout,
            stderr,
            timedOut: false,
            signal: null,
            spawnError: null,
          });
          return;
        }
        // On timeout execFile kills the child itself (killSignal above) and
        // sets `killed`. A signal we did not send (child crashed / killed
        // externally) sets `signal` without `killed`.
        const timedOut = err.killed === true;
        const signal = !timedOut && err.signal != null ? String(err.signal) : null;
        const exitCode = typeof err.code === "number" ? err.code : null;
        const spawnError =
          !timedOut && signal === null && exitCode === null
            ? err.message ?? String(err.code ?? "spawn failed")
            : null;
        resolve({
          exitCode,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          timedOut,
          signal,
          spawnError,
        });
      }
    );
  });
}

/** Shared timeout/spawn-failure handling; returns null when the child ran to completion. */
function subprocessFailure(type: JudgeResult["type"], res: ExecOutcome): JudgeResult | null {
  if (res.timedOut) {
    return {
      type,
      pass: false,
      detail: `timed out after ${JUDGE_TIMEOUT_MS / 1000}s — child killed`,
    };
  }
  if (res.signal) {
    return { type, pass: false, detail: `child killed by ${res.signal}` };
  }
  if (res.spawnError) {
    return { type, pass: false, detail: `spawn failed: ${res.spawnError}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// tsc judge
// ---------------------------------------------------------------------------

async function runTscJudge(spec: TscJudgeSpec, ctx: JudgeContext): Promise<JudgeResult> {
  const cwd = path.resolve(ctx.trialDir, spec.cwd ?? ".");
  const expected = spec.expect ?? 0;
  const res = await execJudge("npx", ["tsc", "--noEmit"], cwd);

  const failure = subprocessFailure("tsc", res);
  if (failure) return failure;

  if (res.exitCode === expected) {
    return { type: "tsc", pass: true, detail: `exit ${res.exitCode} (expected ${expected})` };
  }
  // tsc writes diagnostics to stdout; keep the first handful as evidence.
  const errorLines = `${res.stdout}\n${res.stderr}`
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 5);
  const evidence = errorLines.length ? `\n  ${errorLines.join("\n  ")}` : "";
  return {
    type: "tsc",
    pass: false,
    detail: `exit ${res.exitCode} (expected ${expected})${evidence}`,
  };
}

// ---------------------------------------------------------------------------
// grep judge
// ---------------------------------------------------------------------------

function runGrepJudge(spec: GrepJudgeSpec, ctx: JudgeContext): JudgeResult {
  const target = path.resolve(ctx.trialDir, spec.files);
  const minMatches = spec.min_matches ?? 1;
  // Invalid pattern throws here — caught by runJudge and reported in detail.
  const re = new RegExp(spec.pattern, "g");

  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(target);
  } catch {
    stat = null;
  }
  if (!stat) {
    return {
      type: "grep",
      pass: false,
      detail: `0 matches across 0 files (path not found: ${spec.files})`,
    };
  }

  const files = stat.isDirectory() ? walkFiles(target) : [target];
  let total = 0;
  let scanned = 0;
  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue; // tolerate unreadable files
    }
    if (content.includes("\u0000")) continue; // binary — text files only
    scanned++;
    const matches = content.match(re);
    if (matches) total += matches.length;
  }

  const pass = total >= minMatches;
  return {
    type: "grep",
    pass,
    detail: `${total} matches across ${scanned} files${pass ? "" : ` (need >= ${minMatches})`}`,
  };
}

/** Recursively collect file paths under root, skipping WALK_SKIP_DIRS. */
function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // tolerate unreadable dirs
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!WALK_SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// command judge
// ---------------------------------------------------------------------------

async function runCommandJudge(spec: CommandJudgeSpec, ctx: JudgeContext): Promise<JudgeResult> {
  const expected = spec.expect ?? 0;
  const res = await execJudge("bash", ["-c", spec.run], ctx.trialDir);

  const failure = subprocessFailure("command", res);
  if (failure) return failure;

  const pass = res.exitCode === expected;
  const output = `${res.stdout}\n${res.stderr}`.trim().slice(0, 200);
  return {
    type: "command",
    pass,
    detail: `exit ${res.exitCode} (expected ${expected})${output ? ` — ${output}` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// contract judge (v1 honest minimum — JSONL well-formedness; the full
// NUTRIENTS generators live in docs/contract-tests-from-nutrients.md)
// ---------------------------------------------------------------------------

function runContractJudge(spec: ContractJudgeSpec, ctx: JudgeContext): JudgeResult {
  const target = resolveContractTarget(ctx.trialDir, spec.against);
  if (!target) {
    return {
      type: "contract",
      pass: false,
      detail: `no .jsonl file found for ${spec.against}; ${CONTRACT_V1_NOTE}`,
    };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(target, "utf-8");
  } catch (err: any) {
    return {
      type: "contract",
      pass: false,
      detail: `cannot read ${target}: ${err?.message ?? String(err)}; ${CONTRACT_V1_NOTE}`,
    };
  }

  // Tolerate a trailing newline; whitespace-only lines are not events.
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      type: "contract",
      pass: false,
      detail: `empty JSONL file: ${target}; ${CONTRACT_V1_NOTE}`,
    };
  }

  for (let i = 0; i < lines.length; i++) {
    let parsed: any;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      return {
        type: "contract",
        pass: false,
        detail: `${lines.length} lines; first malformed line: ${i + 1} (invalid JSON); ${CONTRACT_V1_NOTE}`,
      };
    }
    if (typeof parsed !== "object" || parsed === null) {
      return {
        type: "contract",
        pass: false,
        detail: `${lines.length} lines; first malformed line: ${i + 1} (not an object); ${CONTRACT_V1_NOTE}`,
      };
    }
    const hasName = "event" in parsed || "kind" in parsed;
    const hasTimestamp = "t" in parsed || "ts" in parsed || "timestamp" in parsed;
    if (!hasName || !hasTimestamp) {
      const missing = !hasName ? "event/kind field" : "t/ts/timestamp field";
      return {
        type: "contract",
        pass: false,
        detail: `${lines.length} lines; first malformed line: ${i + 1} (missing ${missing}); ${CONTRACT_V1_NOTE}`,
      };
    }
  }

  return {
    type: "contract",
    pass: true,
    detail: `${lines.length} lines well-formed; ${CONTRACT_V1_NOTE}`,
  };
}

/**
 * Resolve `spec.against` relative to the trial dir. A `<run_id>` placeholder
 * resolves to the newest-mtime *.jsonl under the placeholder-free parent dir.
 * Returns null when a placeholder path matches nothing, or a literal path
 * does not exist.
 */
function resolveContractTarget(trialDir: string, against: string): string | null {
  const resolved = path.resolve(trialDir, against);
  if (!against.includes("<run_id>")) {
    return fs.existsSync(resolved) ? resolved : null;
  }

  // Walk up past any path segment still carrying the placeholder, then
  // glob that dir (recursively — the placeholder may be a dir component)
  // for the newest .jsonl.
  let dir = path.dirname(resolved);
  while (dir.includes("<run_id>") && dir !== path.dirname(dir)) {
    dir = path.dirname(dir);
  }

  let newestFile: string | null = null;
  let newestMtime = -Infinity;
  for (const file of walkFiles(dir)) {
    if (!file.endsWith(".jsonl")) continue;
    let mtime: number;
    try {
      mtime = fs.statSync(file).mtimeMs;
    } catch {
      continue;
    }
    if (mtime > newestMtime) {
      newestMtime = mtime;
      newestFile = file;
    }
  }
  return newestFile;
}
