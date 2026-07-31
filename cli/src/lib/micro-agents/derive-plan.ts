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
