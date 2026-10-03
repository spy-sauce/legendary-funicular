// Mycelium Framework — VibeSpace LLC — The network provides.
//
// ledger/collect.ts — loaders for the three truth stores the ledger reconciles:
//   1. Telemetry JSONL  (.mycelium/events/<run_id>.jsonl)
//   2. sporenet/state.json
//   3. Git (read-only shell-outs, per-leaf)
//
// The single `baseDir` (from `--dir`, default cwd) drives ALL THREE stores.
// This is load-bearing: git shell-outs MUST use `git -C <baseDir>` so a
// `--dir` run reconciles the fixture repo, not the process cwd. If git read
// the real repo while files read the fixture, every git check would silently
// run against the wrong tree.
//
// Everything here degrades gracefully — a missing/unreadable store returns
// null/empty and is recorded in availability, never throws.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  readJsonlEvents,
  getEventsDir,
} from "../telemetry/sink-jsonl.js";
import type {
  LedgerEvent,
  LedgerState,
  GitLeafTruth,
} from "./types.js";

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface EventLogSelection {
  path: string;
  run_id: string;
}

/**
 * Select the event log to reconcile. Precedence:
 *   1. explicit runId (exact <run_id>.jsonl)
 *   2. newest by mtime matching the organism prefix (harvest.ts pattern)
 *   3. newest by mtime overall
 * Returns null when the events dir is missing/empty or no match.
 */
export function selectEventLog(
  baseDir: string,
  opts: { runId?: string; organism?: string } = {}
): EventLogSelection | null {
  const eventsDir = getEventsDir(baseDir);
  let entries: string[];
  try {
    if (!fs.existsSync(eventsDir)) return null;
    entries = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;

  if (opts.runId) {
    const fname = `${opts.runId}.jsonl`;
    if (entries.includes(fname)) {
      return { path: path.join(eventsDir, fname), run_id: opts.runId };
    }
    return null; // explicit run requested but absent — caller reports clearly
  }

  const ranked = entries
    .filter((f) =>
      opts.organism ? f.startsWith(opts.organism + "-") : true
    )
    .map((f) => ({
      f,
      path: path.join(eventsDir, f),
      mtime: safeMtime(path.join(eventsDir, f)),
    }))
    .sort((a, b) => b.mtime - a.mtime);

  // Fall back to newest overall if the organism filter matched nothing.
  const pick =
    ranked.length > 0
      ? ranked[0]
      : entries
          .map((f) => ({
            f,
            path: path.join(eventsDir, f),
            mtime: safeMtime(path.join(eventsDir, f)),
          }))
          .sort((a, b) => b.mtime - a.mtime)[0];

  if (!pick) return null;
  return { path: pick.path, run_id: pick.f.replace(/\.jsonl$/, "") };
}

function safeMtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** Load and parse all events from the selected log. Never throws. */
export function loadEvents(filePath: string): LedgerEvent[] {
  // readJsonlEvents already skips malformed lines and swallows read errors.
  return readJsonlEvents(filePath) as unknown as LedgerEvent[];
}

// ---------------------------------------------------------------------------
// sporenet/state.json
// ---------------------------------------------------------------------------

export function stateJsonPath(baseDir: string): string {
  return path.join(baseDir, "sporenet", "state.json");
}

/** Load sporenet/state.json. Returns null when missing/unreadable/malformed. */
export function loadState(baseDir: string): LedgerState | null {
  const p = stateJsonPath(baseDir);
  try {
    if (!fs.existsSync(p)) return null;
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.leaves)
    ) {
      return null;
    }
    return parsed as LedgerState;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Git (read-only)
// ---------------------------------------------------------------------------

/** True when baseDir is inside a git work tree. Determines whether git checks run. */
export function isGitRepo(baseDir: string): boolean {
  try {
    const out = git(baseDir, ["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Run a read-only git command in baseDir. Throws on non-zero exit
 * (callers catch). Uses `-C <baseDir>` so `--dir` runs reconcile the target
 * repo rather than the process cwd.
 */
function git(baseDir: string, args: string[]): string {
  return execFileSync("git", ["-C", baseDir, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * Gather git truth for one leaf: does its claimed commit resolve, what files
 * did it touch, is it an ancestor of HEAD, does its feat branch exist.
 * Every sub-check is independently defensive.
 */
export function gitTruthForLeaf(
  baseDir: string,
  leafId: string,
  commitSha: string | undefined
): GitLeafTruth {
  const truth: GitLeafTruth = {
    commit_resolved: false,
    files: null,
    is_ancestor: null,
    branch_exists: false,
  };

  // Branch existence — independent of commit.
  try {
    const out = git(baseDir, ["branch", "--list", `feat/${leafId}`]);
    truth.branch_exists = out.trim().length > 0;
  } catch {
    /* leave false */
  }

  if (!commitSha) return truth;

  // Does the SHA resolve to a real object?
  try {
    git(baseDir, ["cat-file", "-e", `${commitSha}^{commit}`]);
    truth.commit_resolved = true;
  } catch {
    truth.commit_resolved = false;
    return truth; // no point in the rest if it doesn't resolve
  }

  // Files touched by the commit (name-only; empty for a genuinely empty commit).
  try {
    const out = git(baseDir, [
      "show",
      "--name-only",
      "--pretty=format:",
      commitSha,
    ]);
    truth.files = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    truth.files = null;
  }

  // Integrated into HEAD? (ancestor check)
  try {
    git(baseDir, ["merge-base", "--is-ancestor", commitSha, "HEAD"]);
    truth.is_ancestor = true;
  } catch (err: any) {
    // exit 1 = not an ancestor (clean answer); other failures = unknown.
    if (err && typeof err.status === "number" && err.status === 1) {
      truth.is_ancestor = false;
    } else {
      truth.is_ancestor = null;
    }
  }

  return truth;
}
