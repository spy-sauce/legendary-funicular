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
