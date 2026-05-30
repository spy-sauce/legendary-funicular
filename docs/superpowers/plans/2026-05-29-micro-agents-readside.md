# Micro-Agents Read-Side v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the audit-run testers fan out 2–4 cheap (Haiku) read-only micro-agents that summarize each tester's INPUTS; fold those summaries into the tester's prompt so the expensive (Opus) tester reads compact context instead of raw sources; instrument it to measure whether the offload pays.

**Architecture:** A pure `derivePlan(tester)` turns declared INPUTS into 2–4 `summarize` sub-jobs. `runMicroFanout` runs them as cheap read-only `query()` calls through the existing `runWithConcurrency`, each cache-checked via the existing `cacheKey`/`store`. Summaries fold into the tester prompt; the tester's step-1 instruction is flipped to "rely on Gathered Context, re-read raw only if insufficient." A `--no-micros` flag captures baseline. Metrics (input-token delta, dedup rate, re-read rate, compression) write to `micro-metrics.json`.

**Tech Stack:** TypeScript (Node 18+), `@anthropic-ai/claude-agent-sdk` `query()`, vitest, existing `cli/src/lib/cache-network/` + `cli/src/lib/concurrency.ts`. No new deps.

**Branch:** `feat/dashboard-cache-net` (the foundation — cache-network + micro-agent stubs — lives here, not on main). Build here.

**Spec:** `docs/superpowers/specs/2026-05-29-micro-agents-readside-v1-design.md`

---

## File structure (locked before tasks)

| File | Responsibility | New/Edit |
|---|---|---|
| `cli/src/lib/micro-agents/types.ts` | `MicroSubJob`, `MicroCallRecord`, `MicroMetrics`, `MicroFanoutResult` interfaces | NEW |
| `cli/src/lib/micro-agents/derive-plan.ts` | pure: `(testerId, inputs[], severity?) → MicroSubJob[]` (2–4, seeded cap, `summarize` only) | NEW |
| `cli/src/lib/micro-agents/metrics.ts` | pure: `(records[], reReadCount, foldedTargets) → MicroMetrics`; pure `scanReReads(stdout, foldedTargets)` | NEW |
| `cli/src/lib/micro-agents/fanout.ts` | `runMicroFanout(opts) → MicroFanoutResult`: run workers via runWithConcurrency, cache-check each, return folded context + records | NEW |
| `cli/src/lib/micro-agents/derive-plan.test.ts` | vitest for derive-plan | NEW |
| `cli/src/lib/micro-agents/metrics.test.ts` | vitest for metrics | NEW |
| `cli/src/lib/micro-agents/index.ts` | re-export new surface | EDIT (additive) |
| `cli/src/lib/audit/testers-runner.ts` | call fanout before main query; prepend folded context; flip step-1 line; scan re-reads | EDIT |
| `cli/src/lib/audit/testers-pool.ts` | thread `microsEnabled` + accumulate records; write `micro-metrics.json` at end | EDIT |
| `cli/src/commands/audit-run.ts` | register `--no-micros` flag; pass through | EDIT |

**Verified anchors (do not guess — these are real):**
- `TesterDef` has `id: string`, `inputs: string[]`, `mirrors_biome: string | null`, `scope: string` (`cli/src/lib/audit/testers.ts:25-55`).
- `RunTesterContext` = `{ auditRunDir, cultivationDir, iteration }` (`testers-runner.ts:21`).
- `buildTesterPrompt(extDef, ctx)` at `testers-runner.ts:121`; the line to flip is `1. READ the cultivated artifacts listed in your INPUTS.` at `testers-runner.ts:144`.
- `runTester(def, ctx)` at `testers-runner.ts:238`; SDK `query({ prompt, options:{ cwd, allowedTools:["Read","Bash","Glob","Grep"], permissionMode:"acceptEdits" }})` at `testers-runner.ts:286`.
- `runTestersInPool(testers, ctx)` at `testers-pool.ts:43`; `PoolContext = { auditRunDir, cultivationDir, iteration, concurrency? }` at `testers-pool.ts:23`.
- `runWithConcurrency<T,R>(items, limit, fn)` at `concurrency.ts:8`.
- Cache: `cacheKey({tool_name, args, contract_hash})` (`cache-network/keys.ts:72`), `makeCacheStore({capacity, eventsPath?})` (`cache-network/store.ts:146`), `CacheEntry.payload` holds arbitrary `unknown`.
- `spawnMicros({leafId, severity?})` deterministic count via `rng.nextInt(2,5)` (`micro-agents/spawn.ts:123`).
- `audit-run.ts` uses Commander `.option(...)` chain ending `.action(async (opts)=>{...})` at `:78`; pattern for a negatable flag is `.option("--no-serve", "...")` already present at `:61`.

---

## Task 1: Types

**Files:**
- Create: `cli/src/lib/micro-agents/types.ts`

- [ ] **Step 1: Write the types file**

```ts
// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Micro-agents read-side v1 — shared types.
// Spec: docs/superpowers/specs/2026-05-29-micro-agents-readside-v1-design.md §3,§5

/**
 * One read-side sub-job a tester fans out into. v1 emits kind:"summarize" only;
 * "read"/"grep" are reserved for v2 (the union allows them without a contract change).
 */
export interface MicroSubJob {
  id: string;        // stable slug, e.g. "summarize-nutrients-md"
  kind: "read" | "grep" | "summarize";
  target: string;    // a path / glob / section ref taken from the tester's INPUTS
  question: string;  // fixed template, e.g. "Summarize the contract/behavior in <target>."
}

/** One micro call's accounting record. */
export interface MicroCallRecord {
  tester_id: string;
  sub_job_id: string;
  cache_status: "hit" | "miss";
  model: "haiku";
  input_tokens: number;    // 0 on hit
  output_tokens: number;   // 0 on hit; summary size on miss (logged, not headlined)
  raw_target_bytes: number; // byte size of the source the summary replaces (0 if unreadable)
}

/** Pool-level rolled-up metrics, written to audit/<ts>/micro-metrics.json. */
export interface MicroMetrics {
  micros_enabled: boolean;
  total_calls: number;
  cache_hits: number;
  cache_misses: number;
  dedup_rate: number;             // cache_hits / total_calls (0 if total_calls===0)
  haiku_input_tokens: number;     // Σ worker input tokens (misses only)
  folded_targets: number;         // distinct targets folded across the pool
  redundant_re_reads: number;     // tester re-read a folded target's raw source
  re_read_rate: number;           // redundant_re_reads / folded_targets (0 if none folded)
  summary_input_tokens: number;   // Σ summary tokens consumed by testers
  raw_target_bytes: number;       // Σ raw bytes the summaries replaced
  compression_ratio: number;      // summary_input_tokens / raw_target_bytes (0 if no bytes)
}

/** Return shape of runMicroFanout. */
export interface MicroFanoutResult {
  foldedContext: string;     // "## Gathered Context" block, or "" when no sub-jobs / all failed
  records: MicroCallRecord[];
  foldedTargets: string[];   // targets successfully summarized (for re-read scan)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd cli && npx tsc --noEmit`
Expected: no errors referencing `types.ts`.

- [ ] **Step 3: Commit**

```bash
git add cli/src/lib/micro-agents/types.ts
git commit -m "[MYC] micro-agents: read-side v1 shared types"
```

---

## Task 2: derivePlan (pure, TDD)

**Files:**
- Create: `cli/src/lib/micro-agents/derive-plan.ts`
- Test: `cli/src/lib/micro-agents/derive-plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { derivePlan } from "./derive-plan.js";

describe("derivePlan", () => {
  it("returns one summarize sub-job per input, capped at the seeded count", () => {
    const plan = derivePlan("tester.schema", [
      "NUTRIENTS.md", "cli/src/x.ts", "cli/src/y.ts", "cli/src/z.ts", "cli/src/w.ts",
    ]);
    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan.length).toBeLessThanOrEqual(4);
    expect(plan.every((j) => j.kind === "summarize")).toBe(true);
    expect(plan.every((j) => typeof j.id === "string" && j.id.length > 0)).toBe(true);
  });

  it("is deterministic for the same tester id + inputs", () => {
    const a = derivePlan("tester.auth", ["a.ts", "b.ts", "c.ts"]);
    const b = derivePlan("tester.auth", ["a.ts", "b.ts", "c.ts"]);
    expect(a).toEqual(b);
  });

  it("returns empty plan when there are no inputs", () => {
    expect(derivePlan("tester.types", [])).toEqual([]);
  });

  it("never produces more sub-jobs than inputs", () => {
    const plan = derivePlan("tester.x", ["only-one.ts"]);
    expect(plan.length).toBe(1);
  });

  it("derives stable distinct slugs from targets", () => {
    const plan = derivePlan("tester.s", ["NUTRIENTS.md", "src/App.tsx"]);
    const ids = plan.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run src/lib/micro-agents/derive-plan.test.ts`
Expected: FAIL — `derive-plan.js` / `derivePlan` not found.

- [ ] **Step 3: Write the implementation**

```ts
// Mycelium Framework — VibeSpace LLC — The network provides.
//
// derivePlan — pure: tester INPUTS → 2–4 summarize sub-jobs (deterministic).
// Spec §4.1. No LLM. The seeded count reuses spawn.ts's derivation so the
// dashboard's "2–4 spheres" stays honest.

import { createHash } from "node:crypto";
import type { MicroSubJob } from "./types.js";

/** Derive a 32-bit seed from a tester id — same scheme as spawn.ts deriveSeed. */
function deriveSeed(id: string): number {
  return createHash("sha256").update(id).digest().readUInt32BE(0);
}

/** xorshift32 next() — same algorithm as spawn.ts. */
function nextSeed(state: number): number {
  let x = state >>> 0 || 1;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x >>> 0;
}

/** Stable slug from a target path/ref. */
function slugFor(target: string): string {
  const base = target
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `summarize-${base || "target"}`;
}

/**
 * Turn a tester's declared INPUTS into 2–4 deterministic summarize sub-jobs.
 *
 * - Count = min(inputs.length, seededCount) where seededCount ∈ [2,4] from the tester id.
 * - One sub-job per distinct input (in declared order), kind always "summarize".
 * - Empty inputs → empty plan (caller skips fan-out).
 * - Pure: same (testerId, inputs) → deep-equal output.
 */
export function derivePlan(
  testerId: string,
  inputs: string[],
  _severity?: "critical" | "major" | "minor"
): MicroSubJob[] {
  if (inputs.length === 0) return [];

  // Seeded cap in [2,4], matching spawn.ts's rng.nextInt(2,5) shape.
  const seed = nextSeed(deriveSeed(testerId));
  const seededCount = 2 + (seed % 3); // 2, 3, or 4
  const count = Math.min(inputs.length, seededCount);

  const seen = new Set<string>();
  const jobs: MicroSubJob[] = [];
  for (let i = 0; i < inputs.length && jobs.length < count; i++) {
    const target = inputs[i].trim();
    if (!target) continue;
    let id = slugFor(target);
    // ensure distinct ids even if two targets slug identically
    let n = 1;
    while (seen.has(id)) id = `${slugFor(target)}-${++n}`;
    seen.add(id);
    jobs.push({
      id,
      kind: "summarize",
      target,
      question: `Summarize the contract, behavior, and key declarations in ${target}. Be concise — capture only what a test of this would need to assert.`,
    });
  }
  return jobs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run src/lib/micro-agents/derive-plan.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/lib/micro-agents/derive-plan.ts cli/src/lib/micro-agents/derive-plan.test.ts
git commit -m "[MYC] micro-agents: derivePlan — pure INPUTS→summarize sub-jobs + tests"
```

---

## Task 3: metrics (pure, TDD)

**Files:**
- Create: `cli/src/lib/micro-agents/metrics.ts`
- Test: `cli/src/lib/micro-agents/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { rollupMetrics, scanReReads } from "./metrics.js";
import type { MicroCallRecord } from "./types.js";

const rec = (o: Partial<MicroCallRecord>): MicroCallRecord => ({
  tester_id: "t", sub_job_id: "s", cache_status: "miss", model: "haiku",
  input_tokens: 0, output_tokens: 0, raw_target_bytes: 0, ...o,
});

describe("rollupMetrics", () => {
  it("computes rates and sums; guards divide-by-zero", () => {
    const recs = [
      rec({ cache_status: "miss", input_tokens: 100, output_tokens: 40, raw_target_bytes: 800 }),
      rec({ cache_status: "hit" }),
    ];
    const m = rollupMetrics({ records: recs, micrsEnabled: true, foldedTargets: ["a", "b"], redundantReReads: 1, summaryInputTokens: 40, rawTargetBytes: 800 });
    expect(m.total_calls).toBe(2);
    expect(m.cache_hits).toBe(1);
    expect(m.cache_misses).toBe(1);
    expect(m.dedup_rate).toBeCloseTo(0.5);
    expect(m.haiku_input_tokens).toBe(100);
    expect(m.folded_targets).toBe(2);
    expect(m.re_read_rate).toBeCloseTo(0.5);
    expect(m.compression_ratio).toBeCloseTo(40 / 800);
  });

  it("returns zeroed rates for an empty pool (no divide-by-zero)", () => {
    const m = rollupMetrics({ records: [], micrsEnabled: false, foldedTargets: [], redundantReReads: 0, summaryInputTokens: 0, rawTargetBytes: 0 });
    expect(m.dedup_rate).toBe(0);
    expect(m.re_read_rate).toBe(0);
    expect(m.compression_ratio).toBe(0);
    expect(m.micros_enabled).toBe(false);
  });
});

describe("scanReReads", () => {
  it("counts folded targets the tester re-read via Read", () => {
    const stdout = [
      `[TOOL_USE] Read: {"file_path":"/cult/NUTRIENTS.md"}`,
      `[TOOL_USE] Bash: {"command":"ls"}`,
      `[TOOL_USE] Read: {"file_path":"/cult/src/App.tsx"}`,
    ].join("\n");
    // folded targets given as the bare targets that were summarized
    expect(scanReReads(stdout, ["NUTRIENTS.md", "src/Other.tsx"])).toBe(1);
  });

  it("returns 0 when nothing folded", () => {
    expect(scanReReads("[TOOL_USE] Read: {...}", [])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run src/lib/micro-agents/metrics.test.ts`
Expected: FAIL — `metrics.js` not found.

- [ ] **Step 3: Write the implementation**

```ts
// Mycelium Framework — VibeSpace LLC — The network provides.
//
// metrics — pure rollups for micro read-side measurement. Spec §5.
// Input tokens are the headline (near-deterministic); output tokens logged not headlined.

import type { MicroCallRecord, MicroMetrics } from "./types.js";

const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

export interface RollupInput {
  records: MicroCallRecord[];
  micrsEnabled: boolean;
  foldedTargets: string[];
  redundantReReads: number;
  summaryInputTokens: number; // Σ summary tokens the testers consumed
  rawTargetBytes: number;     // Σ raw bytes those summaries replaced
}

/** Roll per-call records + tester-side counts into pool MicroMetrics. */
export function rollupMetrics(input: RollupInput): MicroMetrics {
  const { records, micrsEnabled, foldedTargets, redundantReReads, summaryInputTokens, rawTargetBytes } = input;
  const total = records.length;
  const hits = records.filter((r) => r.cache_status === "hit").length;
  const misses = total - hits;
  const haikuInput = records.reduce((s, r) => s + r.input_tokens, 0);
  return {
    micros_enabled: micrsEnabled,
    total_calls: total,
    cache_hits: hits,
    cache_misses: misses,
    dedup_rate: safeDiv(hits, total),
    haiku_input_tokens: haikuInput,
    folded_targets: foldedTargets.length,
    redundant_re_reads: redundantReReads,
    re_read_rate: safeDiv(redundantReReads, foldedTargets.length),
    summary_input_tokens: summaryInputTokens,
    raw_target_bytes: rawTargetBytes,
    compression_ratio: safeDiv(summaryInputTokens, rawTargetBytes),
  };
}

/**
 * Count folded targets that the tester re-read via a Read tool_use.
 * stdout lines look like: [TOOL_USE] Read: {"file_path":"/abs/path"}.
 * A folded target matches if its basename appears in any Read file_path.
 */
export function scanReReads(stdout: string, foldedTargets: string[]): number {
  if (foldedTargets.length === 0) return 0;
  const readPaths: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/\[TOOL_USE\] Read: (\{.*\})/);
    if (!m) continue;
    try {
      const obj = JSON.parse(m[1]) as { file_path?: string };
      if (obj.file_path) readPaths.push(obj.file_path);
    } catch { /* ignore truncated json (input is sliced to 200 chars in the log) */ }
  }
  let count = 0;
  for (const t of foldedTargets) {
    const base = t.split("/").pop() ?? t;
    if (readPaths.some((p) => p.includes(base))) count++;
  }
  return count;
}
```

> **Note on the truncation caveat:** `testers-runner.ts:305` logs `JSON.stringify(b.input).slice(0,200)`. For a `Read` tool the input is just `{"file_path":"..."}` — well under 200 chars — so the JSON parses. `scanReReads` tolerates parse failures (returns no match for that line) so a future longer input never crashes the scan.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run src/lib/micro-agents/metrics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/lib/micro-agents/metrics.ts cli/src/lib/micro-agents/metrics.test.ts
git commit -m "[MYC] micro-agents: metrics rollup + re-read scan (pure) + tests"
```

---

## Task 4: runMicroFanout (orchestrator)

**Files:**
- Create: `cli/src/lib/micro-agents/fanout.ts`

> No unit test (SDK/IO orchestration — discipline is `tsc --noEmit` + a real audit run, per rule #5). The pure pieces it calls (`derivePlan`, cache) are already tested.

- [ ] **Step 1: Write the implementation**

```ts
// Mycelium Framework — VibeSpace LLC — The network provides.
//
// runMicroFanout — read-side micro fan-out for one tester. Spec §3,§4.
// Cheap (haiku) read-only workers summarize the tester's INPUTS; each call is
// cache-checked via the existing cache-network. Returns a folded context block
// + per-call records. NEVER throws — a failed worker degrades to "no summary".

import * as fs from "node:fs";
import * as path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { derivePlan } from "./derive-plan.js";
import type { MicroCallRecord, MicroFanoutResult, MicroSubJob } from "./types.js";
import { runWithConcurrency } from "../concurrency.js";
import { cacheKey } from "../cache-network/keys.js";
import type { CacheStoreWithMissRecording } from "../cache-network/store.js";

export interface MicroFanoutOpts {
  testerId: string;
  inputs: string[];
  severity?: "critical" | "major" | "minor";
  cultivationDir: string;          // cwd for the worker's read tools
  contractHash: string;            // for cache key invalidation on re-freeze
  store?: CacheStoreWithMissRecording; // optional — undefined disables caching
  concurrency?: number;            // inner cap, default = plan length (≤4)
}

const WORKER_MAX_TURNS = 3;

/** Read the byte size of a target file (best-effort; 0 if not a readable file). */
function rawBytes(cultivationDir: string, target: string): number {
  try {
    const p = path.isAbsolute(target) ? target : path.join(cultivationDir, target);
    return fs.statSync(p).size;
  } catch {
    return 0; // glob / section-ref / missing file — not a single readable file
  }
}

/** Run one worker micro for a sub-job. Returns its summary text + record. */
async function runWorker(
  job: MicroSubJob,
  opts: MicroFanoutOpts
): Promise<{ summary: string | null; record: MicroCallRecord }> {
  const { testerId, cultivationDir, contractHash, store } = opts;
  const baseRecord: MicroCallRecord = {
    tester_id: testerId,
    sub_job_id: job.id,
    cache_status: "miss",
    model: "haiku",
    input_tokens: 0,
    output_tokens: 0,
    raw_target_bytes: rawBytes(cultivationDir, job.target),
  };

  // 1. Cache lookup (content-addressed; cross-tester dedup lives here).
  const key = store
    ? cacheKey({ tool_name: "micro.work", args: { kind: job.kind, target: job.target, question: job.question }, contract_hash: contractHash })
    : null;
  if (store && key) {
    const hit = store.get(key);
    if (hit) {
      const cached = hit.payload as { summary: string };
      return { summary: cached.summary, record: { ...baseRecord, cache_status: "hit" } };
    }
    store.recordMiss();
  }

  // 2. Miss — run a cheap read-only worker.
  const prompt = [
    `You are a read-only micro-agent. Do ONE thing:`,
    job.question,
    ``,
    `Read the target with the Read/Grep/Glob tools, then output a concise plain-text`,
    `summary. Do not write files. Do not run Bash. Output only the summary.`,
  ].join("\n");

  let summaryText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const stream = query({
      prompt,
      options: {
        cwd: cultivationDir,
        allowedTools: ["Read", "Grep", "Glob"],
        permissionMode: "acceptEdits",
        model: "haiku",
        maxTurns: WORKER_MAX_TURNS,
      } as any, // `model` + `maxTurns` are valid Options (coreTypes.d.ts) — cast for older type bundle
    });
    for await (const msg of stream as any) {
      if (msg.type === "assistant") {
        for (const b of msg.message?.content ?? []) {
          if (b.type === "text" && typeof b.text === "string") summaryText += b.text;
        }
      } else if (msg.type === "result") {
        const usage = (msg as any).usage;
        if (usage?.input_tokens) inputTokens = usage.input_tokens;
        if (usage?.output_tokens) outputTokens = usage.output_tokens;
      }
    }
  } catch {
    return { summary: null, record: baseRecord }; // worker failed → no summary
  }

  summaryText = summaryText.trim();
  if (!summaryText) return { summary: null, record: baseRecord }; // empty → no summary

  // 3. Store for cross-tester reuse.
  if (store && key) {
    store.set(key, { summary: summaryText }, inputTokens, testerId, 0);
  }
  return {
    summary: summaryText,
    record: { ...baseRecord, cache_status: "miss", input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

/**
 * Fan out read-side micros for one tester.
 * Returns the folded "## Gathered Context" block + per-call records + the list
 * of targets actually summarized (for the re-read scan). Never throws.
 */
export async function runMicroFanout(opts: MicroFanoutOpts): Promise<MicroFanoutResult> {
  const plan = derivePlan(opts.testerId, opts.inputs, opts.severity);
  if (plan.length === 0) {
    return { foldedContext: "", records: [], foldedTargets: [] };
  }

  const cap = opts.concurrency ?? plan.length;
  const results = await runWithConcurrency(plan, cap, (job) => runWorker(job, opts));

  const records: MicroCallRecord[] = results.map((r) => r.record);
  const foldedTargets: string[] = [];
  const sections: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.summary) {
      foldedTargets.push(plan[i].target);
      sections.push(`### ${plan[i].target}\n${r.summary}`);
    }
  }

  const foldedContext = sections.length
    ? [`## Gathered Context`, ``, `Summaries of your INPUTS (gathered by read-side micro-agents):`, ``, ...sections, ``].join("\n")
    : "";

  return { foldedContext, records, foldedTargets };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd cli && npx tsc --noEmit`
Expected: clean. (If the SDK type bundle rejects `model`/`maxTurns` despite coreTypes.d.ts, the `as any` cast on `options` absorbs it — verified the runtime supports both.)

- [ ] **Step 3: Commit**

```bash
git add cli/src/lib/micro-agents/fanout.ts
git commit -m "[MYC] micro-agents: runMicroFanout — cheap read-only workers + cache + fold"
```

---

## Task 5: Re-export the new surface

**Files:**
- Modify: `cli/src/lib/micro-agents/index.ts`

- [ ] **Step 1: Read the current index**

Run: `cat cli/src/lib/micro-agents/index.ts`
Expected: existing re-exports of `spawn`/`registry`.

- [ ] **Step 2: Append the new re-exports (additive — keep existing lines)**

Add these lines to the file (do not remove existing exports):

```ts
export * from "./types.js";
export { derivePlan } from "./derive-plan.js";
export { rollupMetrics, scanReReads } from "./metrics.js";
export type { RollupInput } from "./metrics.js";
export { runMicroFanout } from "./fanout.js";
export type { MicroFanoutOpts } from "./fanout.js";
```

- [ ] **Step 3: Verify**

Run: `cd cli && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add cli/src/lib/micro-agents/index.ts
git commit -m "[MYC] micro-agents: re-export read-side v1 surface"
```

---

## Task 6: Wire fanout into the tester runner

**Files:**
- Modify: `cli/src/lib/audit/testers-runner.ts` (`RunTesterContext` :21, `buildTesterPrompt` :121/:144, `runTester` :238, before SDK query :286)

- [ ] **Step 1: Extend RunTesterContext (additive)**

In `cli/src/lib/audit/testers-runner.ts`, change the `RunTesterContext` interface (around line 21) to add optional micro fields. Replace:

```ts
export interface RunTesterContext {
  auditRunDir: string;
  cultivationDir: string;
  iteration: number;
}
```

with:

```ts
export interface RunTesterContext {
  auditRunDir: string;
  cultivationDir: string;
  iteration: number;
  microsEnabled?: boolean;                 // default true; --no-micros sets false
  contractHash?: string;                   // for micro cache keys (default "unfrozen")
  microStore?: import("../cache-network/store.js").CacheStoreWithMissRecording;
}
```

- [ ] **Step 2: Add the import and a return-record channel**

At the top of `testers-runner.ts`, add:

```ts
import { runMicroFanout } from "../micro-agents/fanout.js";
import { scanReReads } from "../micro-agents/metrics.js";
import type { MicroCallRecord } from "../micro-agents/types.js";
```

Then extend `TesterResult` consumption: `runTester` must return its micro records + re-read count so the pool can roll them up. Find the `TesterResult` interface in `cli/src/lib/audit/testers.ts` and add optional fields (additive):

```ts
  micro_records?: MicroCallRecord[];
  micro_folded_targets?: string[];
  micro_redundant_re_reads?: number;
```

(Import `MicroCallRecord` into `testers.ts` too: `import type { MicroCallRecord } from "../micro-agents/types.js";`)

- [ ] **Step 3: Make buildTesterPrompt accept folded context + flip step 1**

Change `buildTesterPrompt(def, ctx)` (line 121) signature to take an extra arg, and flip line 144. Replace the signature line:

```ts
function buildTesterPrompt(def: TesterDefExtended, ctx: RunTesterContext): string {
```

with:

```ts
function buildTesterPrompt(def: TesterDefExtended, ctx: RunTesterContext, foldedContext: string): string {
```

Replace the mission line at :144:

```ts
    `1. READ the cultivated artifacts listed in your INPUTS.`,
```

with:

```ts
    foldedContext
      ? `1. Your INPUTS are summarized below under "Gathered Context" — RELY on those summaries. Only re-READ a raw file if a summary is insufficient for a specific assertion.`
      : `1. READ the cultivated artifacts listed in your INPUTS.`,
```

And insert the folded block into the returned array — right before the `INPUTS (read-only artifacts...)` separator (around :191). Add as array elements:

```ts
    ...(foldedContext ? [foldedContext, ``] : []),
```

- [ ] **Step 4: Run fanout in runTester before the prompt is built**

In `runTester` (line 238), after `const extDef = ...` (around :248) and before `const prompt = buildTesterPrompt(...)` (around :273), insert:

```ts
  // ── Read-side micro fan-out (Spec §3) ──────────────────────────────
  const micrsEnabled = ctx.microsEnabled !== false; // default ON
  let microRecords: MicroCallRecord[] = [];
  let microFoldedTargets: string[] = [];
  let foldedContext = "";
  if (micrsEnabled) {
    const fan = await runMicroFanout({
      testerId: def.id,
      inputs: def.inputs,
      cultivationDir: ctx.cultivationDir,
      contractHash: ctx.contractHash ?? "unfrozen",
      store: ctx.microStore,
    });
    foldedContext = fan.foldedContext;
    microRecords = fan.records;
    microFoldedTargets = fan.foldedTargets;
  }
```

Then change the prompt build line (:273) from:

```ts
  const prompt = buildTesterPrompt(extDef, ctx);
```

to:

```ts
  const prompt = buildTesterPrompt(extDef, ctx, foldedContext);
```

- [ ] **Step 5: Scan re-reads + attach micro data to the result**

The function reads `stdout.log` content via the `logStdout` stream. To scan re-reads, accumulate stdout into a string in addition to the stream. At the top of `runTester` where `logStdout` is defined (around :262), add an accumulator:

```ts
  let stdoutBuffer = "";
  const logStdoutBuf = (line: string) => { stdoutBuffer += line + "\n"; logStdout(line); };
```

Replace the `logStdout(...)` calls inside the stream loop (lines ~302, ~304, ~317, ~321) with `logStdoutBuf(...)` so tool-use lines are captured.

Then, just before the final `return {` (around :374), compute re-reads and merge into the returned object's fields:

```ts
  const microReReads = micrsEnabled ? scanReReads(stdoutBuffer, microFoldedTargets) : 0;
```

In the returned object, add:

```ts
    micro_records: microRecords,
    micro_folded_targets: microFoldedTargets,
    micro_redundant_re_reads: microReReads,
```

- [ ] **Step 6: Verify it compiles**

Run: `cd cli && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Dry verification of prompt shape**

Run: `cd cli && node -e "process.exit(0)"` then visually confirm the edited block. (No runtime test here — Task 8 runs it end-to-end.)

- [ ] **Step 8: Commit**

```bash
git add cli/src/lib/audit/testers-runner.ts cli/src/lib/audit/testers.ts
git commit -m "[MYC] audit: tester runner consumes micro fan-out + folds context + re-read scan"
```

---

## Task 7: Pool — thread the flag, build the store, write micro-metrics.json

**Files:**
- Modify: `cli/src/lib/audit/testers-pool.ts` (`PoolContext` :23, `runTestersInPool` :43)

- [ ] **Step 1: Extend PoolContext (additive)**

Replace `PoolContext` (line 23):

```ts
export interface PoolContext {
  auditRunDir: string;
  cultivationDir: string;
  iteration: number;
  concurrency?: number;
}
```

with:

```ts
export interface PoolContext {
  auditRunDir: string;
  cultivationDir: string;
  iteration: number;
  concurrency?: number;
  microsEnabled?: boolean;     // default true; --no-micros sets false
  contractHash?: string;
}
```

- [ ] **Step 2: Add imports**

At the top of `testers-pool.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { makeCacheStore } from "../cache-network/store.js";
import { rollupMetrics } from "../micro-agents/metrics.js";
import type { MicroCallRecord } from "../micro-agents/types.js";
```

- [ ] **Step 3: Build a shared store, pass micro ctx, roll up metrics**

Replace the body of `runTestersInPool` (lines 43–66) with:

```ts
export async function runTestersInPool(
  testers: TesterDef[],
  ctx: PoolContext
): Promise<TesterResult[]> {
  const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
  const micrsEnabled = ctx.microsEnabled !== false;

  // One shared cache store for the whole pool → cross-tester dedup.
  const microStore = micrsEnabled
    ? makeCacheStore({ capacity: 512 })
    : undefined;

  const results = await runWithConcurrency(testers, concurrency, async (testerDef) => {
    const result = await runTester(testerDef, {
      auditRunDir: ctx.auditRunDir,
      cultivationDir: ctx.cultivationDir,
      iteration: ctx.iteration,
      microsEnabled: micrsEnabled,
      contractHash: ctx.contractHash,
      microStore,
    });

    if (result.finding !== null) {
      await appendFinding(ctx.auditRunDir, result.finding);
    }
    return result;
  });

  // ── Roll up micro metrics → audit/<ts>/micro-metrics.json (Spec §5) ──
  const allRecords: MicroCallRecord[] = [];
  const allFoldedTargets: string[] = [];
  let redundantReReads = 0;
  let summaryInputTokens = 0;
  let rawTargetBytes = 0;
  for (const r of results) {
    if (r.micro_records) {
      allRecords.push(...r.micro_records);
      // summary tokens consumed by the tester ≈ Σ worker output tokens that were folded.
      summaryInputTokens += r.micro_records.reduce((s, x) => s + x.output_tokens, 0);
      rawTargetBytes += r.micro_records.reduce((s, x) => s + x.raw_target_bytes, 0);
    }
    if (r.micro_folded_targets) allFoldedTargets.push(...r.micro_folded_targets);
    redundantReReads += r.micro_redundant_re_reads ?? 0;
  }

  const metrics = rollupMetrics({
    records: allRecords,
    micrsEnabled,
    foldedTargets: allFoldedTargets,
    redundantReReads,
    summaryInputTokens,
    rawTargetBytes,
  });

  try {
    const outPath = path.join(ctx.auditRunDir, "micro-metrics.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(metrics, null, 2), "utf-8");
  } catch (err) {
    console.error("[micro-agents] warning: failed to write micro-metrics.json:", err instanceof Error ? err.message : err);
  }

  return results;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd cli && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add cli/src/lib/audit/testers-pool.ts
git commit -m "[MYC] audit: pool builds shared micro cache store + writes micro-metrics.json"
```

---

## Task 8: CLI flag `--no-micros` + thread to the pool

**Files:**
- Modify: `cli/src/commands/audit-run.ts` (`.option` chain ~:36-77, `.action` :78)
- Modify: wherever `runTestersInPool` / orchestrator is invoked with `PoolContext` (trace from `audit-run.ts` `.action` → orchestrator). Likely `cli/src/lib/audit/orchestrator.ts`.

- [ ] **Step 1: Find where PoolContext is constructed**

Run: `grep -rn "runTestersInPool\|microsEnabled\|PoolContext\|contractHash" cli/src/lib/audit/orchestrator.ts cli/src/commands/audit-run.ts`
Expected: locate the call site that builds the pool context (in `orchestrator.ts`).

- [ ] **Step 2: Register the flag**

In `cli/src/commands/audit-run.ts`, in the `.option(...)` chain (near the existing `--no-serve` at :61), add:

```ts
    .option(
      "--no-micros",
      "Disable read-side micro-agent fan-out (baseline measurement)"
    )
```

- [ ] **Step 3: Pass it through the action → orchestrator**

In the `.action(async (opts) => {...})` (line 78), `opts.micros` is `false` when `--no-micros` is passed (Commander negation), `true`/`undefined` otherwise. Thread it into the orchestrator options object the action builds. Add to the mapped options:

```ts
      microsEnabled: opts.micros !== false,
```

Then in `orchestrator.ts`, accept `microsEnabled?: boolean` and `contractHash?: string` in its options type, and pass them into the `PoolContext` it constructs for `runTestersInPool`:

```ts
      microsEnabled: options.microsEnabled,
      contractHash: options.contractHash,
```

(If the orchestrator doesn't currently know the frozen contract hash, pass `undefined` — `runMicroFanout` defaults to `"unfrozen"`. Wiring the real hash is optional polish, not required for v1.)

- [ ] **Step 4: Verify it compiles + the flag is registered**

Run: `cd cli && npm run build && node dist/index.js audit-run --help`
Expected: `--no-micros` appears in the help output.

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/audit-run.ts cli/src/lib/audit/orchestrator.ts
git commit -m "[MYC] audit-run: --no-micros flag threaded to the tester pool"
```

---

## Task 9: End-to-end verification + the measurement

**Files:** none (verification only)

- [ ] **Step 1: Full type + unit pass**

Run: `cd cli && npx tsc --noEmit && npx vitest run src/lib/micro-agents/`
Expected: tsc clean; derive-plan (5) + metrics (4) tests PASS.

- [ ] **Step 2: Build**

Run: `cd cli && npm run build`
Expected: clean.

- [ ] **Step 3: Baseline run (micros OFF)**

Pick a small cultivation with `HYPHA-TEST-*` files. Run:
`mycelium audit-run --no-micros --no-serve` in that cultivation.
Then inspect: `cat <cultivation>/audit/<latest-ts>/micro-metrics.json`
Expected: `micros_enabled: false`, `total_calls: 0`. Note the tester `stdout.log` shows the testers reading raw INPUTS. Record their Opus input tokens from the `[RESULT]` lines (baseline).

- [ ] **Step 4: Micros-ON run**

Run: `mycelium audit-run --no-serve` in the same cultivation.
Then: `cat <cultivation>/audit/<latest-ts>/micro-metrics.json`
Expected: `micros_enabled: true`, `total_calls > 0`, all four metrics populated, `compression_ratio > 0`.

- [ ] **Step 5: Compute the verdict (Spec §5.5)**

Compare the two runs' tester Opus input tokens (from `[RESULT]` lines), plus the micros-ON `haiku_input_tokens`:
- **Net input-token delta** = (ON: tester Opus input + haiku input) − (OFF: tester Opus input).
- Read `re_read_rate` and `compression_ratio` from `micro-metrics.json`.
- Apply the gate table: delta<0 & low re-read → read-side pays (scope v2); delta≥0 & high re-read → fix steering, re-measure; delta≥0 & low re-read & poor compression → don't build v2.

- [ ] **Step 6: Verify the dashboard shows real micro state (optional polish)**

If `MicroState` was extended in a follow-up, confirm `mycelium dashboard serve` renders micro spheres from real records. (Not required for v1's measurement goal.)

- [ ] **Step 7: Final commit (verification notes)**

Append the measured verdict to the spec or a short `audit/<ts>/VERDICT.md`, then:

```bash
git add -A
git commit -m "[MYC] micro-agents: read-side v1 end-to-end verified + measurement verdict"
```

---

## Self-review checklist (run after writing, before execution)

- [ ] **Spec coverage:** derivePlan (§4.1)→T2 · workers+cache+fold (§4.2-4.3)→T4,T6 · metrics+re-read+compression (§5)→T3,T7 · `--no-micros` baseline (§5.4)→T8 · gate table (§5.5)→T9 · error isolation (§6: never-throw, plan_empty, work_failed)→T4 (try/catch + empty-plan guard). ✓
- [ ] **Placeholder scan:** every code step has full code; no TBD/TODO except the explicitly-optional contractHash wiring (T8 step 3) and optional dashboard polish (T9 step 6), both flagged as non-blocking. ✓
- [ ] **Type consistency:** `MicroSubJob`/`MicroCallRecord`/`MicroMetrics`/`MicroFanoutResult` defined T1, consumed T2/T3/T4/T6/T7 with matching names. `runMicroFanout`/`derivePlan`/`rollupMetrics`/`scanReReads` signatures match across tasks. `microsEnabled`/`contractHash`/`microStore` threaded consistently RunTesterContext→PoolContext→orchestrator. ✓

---

## Rule compliance (re-confirm at execution)

- #2 `cultivate.ts` untouched ✓ · #4 no new deps (reuses SDK/cache/concurrency) ✓ · #5 tests only on pure derive-plan + metrics ✓ · #9 only additive optional fields on contexts/TesterResult ✓ · #10 Upgrade interface untouched ✓
