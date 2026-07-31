// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Micro-agent spawn — deterministic MICRO factory per leaf.
//
// Contract: NUTRIENTS.md §2 (MicroState), §4 (MicroAgent fan-out)
// Sub-agent: cache.micros.spawn
//
// Spawns 2-4 micros per leaf using a seeded xorshift32 PRNG. The seed is
// derived from sha256(leafId)[0..4] as an unsigned 32-bit big-endian int.
// Routing is 70% cheap / 30% full for non-critical severity, 50/50 for critical.
//
// This is a pure function — same leafId always produces the same output.

import { createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Types — per NUTRIENTS.md §2 + §4
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Options for spawning micros — per NUTRIENTS §4.
 */
export interface MicroSpawnOpts {
  leafId: string;
  severity?: "critical" | "major" | "minor";
}

// ─────────────────────────────────────────────────────────────────────────────
// xorshift32 PRNG — inline implementation, no external deps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * xorshift32 state holder. Mutable within a single spawnMicros call,
 * but not module-level (each call creates its own Xorshift32 instance).
 */
class Xorshift32 {
  private state: number;

  /**
   * Create a new xorshift32 PRNG with the given seed.
   * Seed of 0 is replaced with 1 (xorshift requires non-zero state).
   */
  constructor(seed: number) {
    // Ensure unsigned 32-bit and non-zero
    this.state = (seed >>> 0) || 1;
  }

  /**
   * Generate the next pseudo-random 32-bit unsigned integer.
   * Standard xorshift32 algorithm: x ^= x << 13; x ^= x >>> 17; x ^= x << 5
   */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0; // keep unsigned
    return this.state;
  }

  /**
   * Generate a uniform random integer in [min, max) range.
   */
  nextInt(min: number, max: number): number {
    const range = max - min;
    // Use modulo for uniform distribution (good enough for small ranges)
    return min + (this.next() % range);
  }

  /**
   * Generate a uniform random float in [0, 1) range.
   */
  nextFloat(): number {
    return this.next() / 0x100000000;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed derivation — sha256(leafId) first 4 bytes as unsigned 32-bit big-endian
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a 32-bit seed from a leafId using sha256.
 * Takes the first 4 bytes of the hash and interprets as big-endian unsigned int.
 */
function deriveSeed(leafId: string): number {
  const hash = createHash("sha256").update(leafId).digest();
  // Read first 4 bytes as unsigned 32-bit big-endian
  return hash.readUInt32BE(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawn function — cache.micros.spawn
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spawn 2-4 micro-agents for a leaf with deterministic routing.
 *
 * Per NUTRIENTS §4:
 * - Seed from sha256(leafId)[0..4] as unsigned 32-bit big-endian
 * - Count: PRNG → uniform integer in [2, 5) — i.e., 2, 3, or 4
 * - Routing: 70% cheap / 30% full for non-critical; 50/50 for critical
 *
 * This is a pure function: same leafId (+ severity) always returns deep-equal output.
 *
 * @param opts - Spawn options with leafId and optional severity
 * @returns Array of MicroState objects, 2-4 elements
 */
export function spawnMicros(opts: MicroSpawnOpts): MicroState[] {
  const { leafId, severity } = opts;

  // Derive seed and create PRNG
  const seed = deriveSeed(leafId);
  const rng = new Xorshift32(seed);

  // Determine micro count: uniform in [2, 5) — i.e., 2, 3, or 4
  const count = rng.nextInt(2, 5);

  // Determine cheap threshold based on severity
  // Per NUTRIENTS §4: 70% cheap / 30% full for non-critical; 50/50 for critical
  const cheapThreshold = severity === "critical" ? 0.5 : 0.7;

  // Spawn micros
  const micros: MicroState[] = [];
  for (let idx = 0; idx < count; idx++) {
    // Each routing draw advances the PRNG once
    const roll = rng.nextFloat();
    const routing: MicroState["routing"] = roll < cheapThreshold ? "cheap" : "full";

    micros.push({
      idx,
      routing,
      last_call_was_hit: false,
      fire_count: 0,
    });
  }

  return micros;
}
