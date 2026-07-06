// Mycelium Framework — VibeSpace LLC — The network provides.
//
// eval/runner.ts — trial provisioning + execution for `mycelium eval`.
// Runs k trials of an EvalTask (Lane A: full cultivate subprocess, Lane B:
// single-leaf SDK session), judges each trial via judges.ts, and assembles
// the TaskRunSummary via metrics.ts. Templates: cultivate.ts cultivateLeaf
// (SDK spawn + artifact tracking), audit/testers-runner.ts (session set +
// interrupt/return close pattern), audit/heal-loop.ts spawnCultivate.
//
// ── DESIGN DECISION: no git worktrees for trials (deliberate spec override) ──
// docs/mycelium-eval-spec.md sketched worktree-per-trial isolation. Post-
// 22351c3, cultivate itself creates per-leaf worktrees + repo-GLOBAL
// feat/<leafId> branches; worktree-per-trial of THIS repo would collide
// across parallel trials and pollute the framework repo's refs. Instead:
//   - Lane B trial dir = .mycelium/evals/<task-id>/<ts>/trial-N/work — a
//     fresh empty dir seeded with the fixture's HYPHA.md / NUTRIENTS.md.
//   - Lane A copies the fixture cultivation into work/ and `git init`s an
//     ISOLATED throwaway repo there, so cultivate enters worktree mode
//     against its own scratch .git — never the framework repo's. That is
//     the ONLY place git mutates, and .mycelium/ is gitignored, so no
//     nested-repo or ref pollution is possible.
//   - eval always executes the CURRENT built CLI (node <repoRoot>/cli/dist/
//     index.js). task.pinned_commit is provenance metadata recorded into
//     the summary, NOT a checkout instruction; framework_commit records
//     what actually ran (read-only rev-parse of the repo root).

import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import chalk from "chalk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  EvalTask,
  JudgeResult,
  RunnerOptions,
  TaskRunSummary,
  TrialResult,
} from "./types.js";
import { EvalTaskError, EVAL_OUTPUT_ROOT } from "./types.js";
import { runJudges } from "./judges.js";
import { buildSummary } from "./metrics.js";
import { runWithConcurrency } from "../concurrency.js";

// ── Active session tracking (SIGINT cleanup, mirrors testers-runner) ────

const activeEvalSessions = new Set<any>();

async function closeStream(s: any): Promise<void> {
  try {
    if (typeof s?.interrupt === "function") {
      await s.interrupt().catch(() => undefined);
    }
    if (typeof s?.return === "function") {
      await s.return(undefined).catch(() => undefined);
    }
  } catch {
    // best-effort cleanup only
  }
}

/**
 * Close all active eval SDK sessions. Called on SIGINT/SIGTERM or crash
 * recovery — mirror of testers-runner's closeAllTesterSessions.
 */
export async function closeAllEvalSessions(): Promise<void> {
  const pending = Array.from(activeEvalSessions);
  activeEvalSessions.clear();
  await Promise.allSettled(pending.map((s) => closeStream(s)));
}

// ── Small helpers ────────────────────────────────────────────────────────

/** Atomic JSON write: sibling .tmp then rename (writeLeafState pattern). */
function writeJsonAtomic(filePath: string, value: unknown): void {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/** Count files under `dir` modified after `sinceMs`, skipping .git/.mycelium. */
function countFilesNewerThan(dir: string, sinceMs: number): number {
  let count = 0;
  const walk = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === ".mycelium") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          if (fs.statSync(full).mtimeMs > sinceMs) count++;
        } catch {
          // file vanished mid-walk — skip
        }
      }
    }
  };
  walk(dir);
  return count;
}

/**
 * Lane A cost: read the newest work/.mycelium/events/*.jsonl and sum
 * cost_recorded events. Field names probed defensively (cost_usd / usd /
 * amount_usd / usd_estimate) — same posture as cost-tracker's extractUsage.
 */
function readLaneACost(work: string): { cost: number; found: boolean } {
  const eventsDir = path.join(work, ".mycelium", "events");
  let files: { file: string; mtimeMs: number }[];
  try {
    files = fs
      .readdirSync(eventsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({
        file: path.join(eventsDir, f),
        mtimeMs: fs.statSync(path.join(eventsDir, f)).mtimeMs,
      }));
  } catch {
    return { cost: 0, found: false };
  }
  if (files.length === 0) return { cost: 0, found: false };
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  let cost = 0;
  let found = false;
  let raw: string;
  try {
    raw = fs.readFileSync(files[0].file, "utf-8");
  } catch {
    return { cost: 0, found: false };
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      continue; // tolerate a torn trailing line
    }
    const kind = ev?.kind ?? ev?.event;
    if (kind !== "cost_recorded") continue;
    const d = ev?.data ?? {};
    const usd = Number(d.cost_usd ?? d.usd ?? d.amount_usd ?? d.usd_estimate);
    if (Number.isFinite(usd)) {
      cost += usd;
      found = true;
    }
  }
  return { cost, found };
}

// ── Provisioning ─────────────────────────────────────────────────────────

/**
 * Provision a trial's work dir from the task fixture.
 * Lane B: copy fixture.hypha / fixture.nutrients in as HYPHA.md / NUTRIENTS.md.
 * Lane A: copy the fixture cultivation, then git-init an isolated throwaway
 * repo inside work/ (identity "mycelium-eval" via -c args — never touches
 * global config) so cultivate's worktree mode operates on scratch refs only.
 */
function provisionTrial(task: EvalTask, repoRoot: string, work: string): void {
  if (task.lane === "B") {
    fs.cpSync(path.resolve(repoRoot, task.fixture.hypha!), path.join(work, "HYPHA.md"));
    fs.cpSync(
      path.resolve(repoRoot, task.fixture.nutrients!),
      path.join(work, "NUTRIENTS.md")
    );
    return;
  }

  // Lane A
  fs.cpSync(path.resolve(repoRoot, task.fixture.path!), work, { recursive: true });
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: work,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git(["init", "-q"]);
  git(["add", "-A"]);
  git([
    "-c",
    "user.name=mycelium-eval",
    "-c",
    "user.email=eval@mycelium.local",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "eval: fixture baseline",
  ]);
}

// ── Lane B: single-leaf SDK session ──────────────────────────────────────

function buildLaneBPrompt(task: EvalTask, hypha: string, nutrients: string): string {
  return [
    `You are a single Mycelium leaf under evaluation (eval task \`${task.id}\`).`,
    ``,
    `Work ONLY inside the current working directory — it is your cultivation`,
    `root. Do not read or write anything outside it. Your HYPHA spec and the`,
    `frozen NUTRIENTS contracts are reproduced below; read both before you`,
    `write a line, then produce the artifact the HYPHA describes.`,
    ...(task.fixture.scope
      ? [``, `Deliverable scope: ${task.fixture.scope}`]
      : []),
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `HYPHA.md`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    hypha,
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `NUTRIENTS.md`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    nutrients,
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    `When the artifact is complete, finish with exactly one line:`,
    ``,
    `FRUIT_READY — <one-sentence deliverable summary>`,
    ``,
    `The network provides. 🍄`,
  ].join("\n");
}

interface LaneExecResult {
  cost: number;
  budgetExceeded: boolean;
  artifacts: string[];
  error?: string;
  notes?: string;
}

async function execLaneB(
  task: EvalTask,
  work: string,
  trialDir: string
): Promise<LaneExecResult> {
  const hypha = fs.readFileSync(path.join(work, "HYPHA.md"), "utf-8");
  const nutrients = fs.readFileSync(path.join(work, "NUTRIENTS.md"), "utf-8");
  const prompt = buildLaneBPrompt(task, hypha, nutrients);

  const logStream = fs.createWriteStream(path.join(trialDir, "stdout.log"), {
    flags: "a",
  });
  const logLine = (obj: any) =>
    logStream.write(JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n");
  logLine({ event: "start", task: task.id, lane: "B" });
  logLine({ event: "prompt", prompt });

  const artifacts: string[] = [];
  let cost = 0;
  let budgetExceeded = false;
  let error: string | undefined;
  let wallExceeded = false;
  let wallTimer: NodeJS.Timeout | undefined;
  let stream: any;

  try {
    stream = query({
      prompt,
      options: {
        cwd: work,
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permissionMode: "acceptEdits",
        ...(task.budget?.max_usd !== undefined
          ? { maxBudgetUsd: task.budget.max_usd }
          : {}),
      },
    });
    activeEvalSessions.add(stream);

    if (task.budget?.max_wall_sec !== undefined) {
      wallTimer = setTimeout(() => {
        wallExceeded = true;
        stream.interrupt().catch(() => {});
      }, task.budget.max_wall_sec * 1000);
    }

    for await (const msg of stream) {
      logLine({ event: "sdk_msg", msg });
      if (msg.type === "assistant") {
        const blocks = (msg as any).message?.content ?? [];
        for (const b of blocks) {
          if (
            b.type === "tool_use" &&
            (b.name === "Write" || b.name === "Edit") &&
            b.input?.file_path
          ) {
            artifacts.push(b.input.file_path);
          }
        }
      } else if (msg.type === "result") {
        cost = Number((msg as any).total_cost_usd) || 0;
        if ((msg as any).subtype === "error_max_budget_usd") {
          budgetExceeded = true;
        }
      }
    }
  } catch (err: any) {
    error = `sdk error: ${String(err?.message ?? err).split("\n")[0].slice(0, 200)}`;
    logLine({ event: "error", error });
  } finally {
    if (wallTimer) clearTimeout(wallTimer);
    if (stream) {
      activeEvalSessions.delete(stream);
      await closeStream(stream);
    }
    logStream.end();
  }

  // Wall-clock overrun trumps any softer error: the trial did not complete.
  if (wallExceeded) error = "wall_clock_exceeded";

  return { cost, budgetExceeded, artifacts, error };
}

// ── Lane A: full cultivate subprocess against the isolated scratch repo ──

async function execLaneA(
  task: EvalTask,
  repoRoot: string,
  work: string,
  trialDir: string
): Promise<LaneExecResult> {
  const cliPath = path.join(repoRoot, "cli", "dist", "index.js");
  const logStream = fs.createWriteStream(path.join(trialDir, "stdout.log"), {
    flags: "a",
  });

  return new Promise<LaneExecResult>((resolve) => {
    const proc = spawn(process.execPath, [cliPath, "cultivate", "-c", "2"], {
      cwd: work,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let wallExceeded = false;
    let wallTimer: NodeJS.Timeout | undefined;
    if (task.budget?.max_wall_sec !== undefined) {
      wallTimer = setTimeout(() => {
        wallExceeded = true;
        proc.kill("SIGTERM");
      }, task.budget.max_wall_sec * 1000);
    }

    proc.stdout.on("data", (chunk) => logStream.write(chunk));
    proc.stderr.on("data", (chunk) => logStream.write(chunk));

    proc.on("error", (err) => {
      if (wallTimer) clearTimeout(wallTimer);
      logStream.end();
      resolve({
        cost: 0,
        budgetExceeded: false,
        artifacts: [],
        error: `spawn error: ${err.message}`,
      });
    });

    proc.on("close", (code) => {
      if (wallTimer) clearTimeout(wallTimer);
      logStream.end();
      if (wallExceeded) {
        resolve({
          cost: 0,
          budgetExceeded: false,
          artifacts: [],
          error: "wall_clock_exceeded",
        });
        return;
      }
      const { cost, found } = readLaneACost(work);
      const notesParts: string[] = [];
      if (!found) {
        notesParts.push(
          "cost unknown (no cost_recorded events — fixture should enable telemetry-emitter + cost-tracker upgrades)"
        );
      }
      if (code !== 0) notesParts.push(`cultivate exit code ${code}`);
      resolve({
        cost,
        budgetExceeded: false,
        artifacts: [],
        notes: notesParts.length > 0 ? notesParts.join("; ") : undefined,
      });
    });
  });
}

// ── Per-trial orchestration ──────────────────────────────────────────────

async function runTrial(
  task: EvalTask,
  opts: RunnerOptions,
  runRoot: string,
  trialIndex: number,
  log: (line: string) => void
): Promise<TrialResult> {
  const trialDir = path.join(runRoot, `trial-${trialIndex}`);
  const work = path.join(trialDir, "work");
  const startNs = process.hrtime.bigint();

  let cost = 0;
  let budgetExceeded = false;
  let filesWritten = 0;
  let error: string | undefined;
  let notes: string | undefined;
  let judges: JudgeResult[] = [];

  try {
    fs.mkdirSync(work, { recursive: true });
    provisionTrial(task, opts.repoRoot, work);
    const provisionedAtMs = Date.now();

    const exec =
      task.lane === "B"
        ? await execLaneB(task, work, trialDir)
        : await execLaneA(task, opts.repoRoot, work, trialDir);

    cost = exec.cost;
    budgetExceeded = exec.budgetExceeded;
    error = exec.error;
    notes = exec.notes;
    filesWritten =
      task.lane === "B"
        ? exec.artifacts.length
        : countFilesNewerThan(work, provisionedAtMs);

    // Budget post-check — both lanes. Lane B's SDK abort may already have
    // flagged it; the post-check also catches overshoot-without-abort.
    if (task.budget?.max_usd !== undefined && cost > task.budget.max_usd) {
      budgetExceeded = true;
    }

    // Infra errors (timeout, spawn failure) mean the trial did not complete:
    // judges are NOT run — pass:false with judges:[] and error set.
    if (!error) {
      judges = await runJudges(task.judge, {
        trialDir: work,
        repoRoot: opts.repoRoot,
      });
    }
  } catch (err: any) {
    error = String(err?.message ?? err).split("\n")[0].slice(0, 200);
  }

  const wallMs = Number((process.hrtime.bigint() - startNs) / 1_000_000n);
  const pass =
    !error &&
    !budgetExceeded &&
    judges.filter((j) => !j.skipped).every((j) => j.pass);

  try {
    writeJsonAtomic(path.join(trialDir, "judges.json"), judges);
    writeJsonAtomic(path.join(trialDir, "metrics.json"), {
      cost_usd: cost,
      wall_ms: wallMs,
      files_written: filesWritten,
    });
  } catch {
    // trial dir may be gone in pathological cases — the TrialResult is
    // still returned and lands in summary.json either way.
  }

  log(
    (pass ? chalk.green(`  ✔ trial ${trialIndex}`) : chalk.red(`  ✘ trial ${trialIndex}`)) +
      chalk.gray(
        ` — ${(wallMs / 1000).toFixed(1)}s · $${cost.toFixed(4)} · ${filesWritten} files` +
          (error ? ` · ${error}` : "") +
          (budgetExceeded ? " · budget exceeded" : "")
      )
  );

  return {
    trial: trialIndex,
    pass,
    judges,
    cost_usd: cost,
    wall_ms: wallMs,
    files_written: filesWritten,
    budget_exceeded: budgetExceeded,
    ...(error !== undefined ? { error } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

// ── Public entry point ───────────────────────────────────────────────────

/**
 * Run all trials for one EvalTask and return the assembled TaskRunSummary.
 * Trials run via runWithConcurrency — default SERIAL (concurrency 1): SDK
 * rate-limit discipline (PR#3's -c 30 run got 0/43, all rate-limited).
 * summary.json is written atomically to .mycelium/evals/<task-id>/<ts>/.
 */
export async function runTask(
  task: EvalTask,
  opts: RunnerOptions
): Promise<TaskRunSummary> {
  const log = opts.log ?? console.log;

  if (task.lane === "C") {
    throw new EvalTaskError(
      "Lane C rides the Router chokepoint — lands with Router phase 1"
    );
  }

  // Fail fast at the boundary: fixture shape + existence per lane.
  const problems: string[] = [];
  if (task.lane === "B") {
    for (const key of ["hypha", "nutrients"] as const) {
      const rel = task.fixture[key];
      if (!rel) problems.push(`lane B requires fixture.${key}`);
      else if (!fs.existsSync(path.resolve(opts.repoRoot, rel)))
        problems.push(`fixture.${key} not found: ${rel}`);
    }
  } else {
    if (!task.fixture.path) problems.push("lane A requires fixture.path");
    else if (!fs.existsSync(path.resolve(opts.repoRoot, task.fixture.path)))
      problems.push(`fixture.path not found: ${task.fixture.path}`);
  }
  if (problems.length > 0) {
    throw new EvalTaskError(`task ${task.id}: fixture invalid`, problems);
  }

  const runs = opts.runsOverride ?? task.runs;
  if (runs < 3) {
    log(
      chalk.yellow(
        `⚠ ${task.id}: k=${runs} — below 3 trials pass@k/pass^k are statistically meaningless (spec anti-pattern)`
      )
    );
  }

  // Provenance: what actually ran. pinned_commit stays metadata-only.
  let frameworkCommit: string | undefined;
  try {
    frameworkCommit = execFileSync(
      "git",
      ["-C", opts.repoRoot, "rev-parse", "HEAD"],
      { encoding: "utf-8" }
    ).trim();
  } catch {
    frameworkCommit = undefined;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = path.join(opts.repoRoot, EVAL_OUTPUT_ROOT, task.id, timestamp);
  fs.mkdirSync(runRoot, { recursive: true });

  log(
    chalk.cyan(`🧪 eval ${task.id}`) +
      chalk.gray(
        ` — lane ${task.lane} · k=${runs} · concurrency ${opts.concurrency ?? 1} · ${runRoot}`
      )
  );

  const trialIndices = Array.from({ length: runs }, (_, i) => i + 1);
  const trials = await runWithConcurrency(
    trialIndices,
    opts.concurrency ?? 1,
    (i) => runTrial(task, opts, runRoot, i, log)
  );

  const summary = buildSummary(task, timestamp, trials, frameworkCommit);
  writeJsonAtomic(path.join(runRoot, "summary.json"), summary);

  // keepTrialDirs defaults TRUE — the trial dirs under gitignored .mycelium/
  // are the audit trail. Only an explicit false removes them.
  if (opts.keepTrialDirs === false) {
    for (const i of trialIndices) {
      fs.rmSync(path.join(runRoot, `trial-${i}`), { recursive: true, force: true });
    }
  }

  return summary;
}
