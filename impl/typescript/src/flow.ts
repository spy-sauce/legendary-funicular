// Mycelium Framework — VibeSpace LLC — The network provides.

import type { Agent } from "./agent.js";
import { AgentState } from "./agent.js";

/**
 * A pending nutrient request — a chemotropic gradient broadcast
 * by a hypha that needs a specific substrate to continue growth.
 */
export interface NutrientRequest {
  /** The requesting hypha's identifier. */
  readonly requesterId: string;
  /** Nutrient types the requester can absorb. */
  readonly requiredCapabilities: ReadonlySet<string>;
  /** Urgency coefficient — 0.0 (can wait) to 1.0 (immediate starvation). */
  readonly urgency: number;
  /** Merge lane of the requester — used for proximity scoring. */
  readonly lane: number;
  /** Timestamp of the original request — stale requests decay in priority. */
  readonly timestamp: number;
}

/**
 * Result of a nutrient matching operation — the chosen translocation path.
 */
export interface FlowMatch {
  /** The donor agent that will supply nutrients. */
  readonly donorId: string;
  /** The recipient agent that requested nutrients. */
  readonly recipientId: string;
  /** Composite affinity score — higher means better symbiotic fit. */
  readonly score: number;
  /** Breakdown of individual scoring components for field-note logging. */
  readonly breakdown: {
    readonly urgency: number;
    readonly capabilityOverlap: number;
    readonly proximity: number;
  };
}

/**
 * Nutrient flow matching algorithm.
 *
 * Field note: in real mycorrhizal networks, nutrient translocation
 * follows source-sink gradients. Our algorithm approximates this
 * by scoring potential donor-recipient pairs on three axes:
 *
 *   score = urgency × capability_overlap × proximity_in_merge_order
 *
 * The highest-scoring pair wins — nutrients flow along the steepest gradient.
 */
export class NutrientMatcher {
  /**
   * Maximum lane distance used for proximity normalization.
   * Colonies with more lanes spread over a wider substrate.
   */
  private readonly maxLaneDistance: number;

  constructor(config: { maxLaneDistance?: number } = {}) {
    this.maxLaneDistance = config.maxLaneDistance ?? 10;
  }

  /**
   * Find the best recipient for a flowing agent's nutrients.
   *
   * Observation: the algorithm is O(n) in the number of pending requests —
   * a single pass through the gradient field, like a hyphal tip
   * sensing the strongest chemotropic signal.
   *
   * @param donor - The agent offering nutrients (must be in FLOWING state).
   * @param pendingRequests - All outstanding nutrient requests in the colony.
   * @returns The best match, or null if no compatible recipient exists.
   */
  match(donor: Agent, pendingRequests: readonly NutrientRequest[]): FlowMatch | null {
    if (donor.state !== AgentState.FLOWING) {
      return null; // Only flowing hyphae can donate — cytoplasm must be streaming.
    }

    let bestMatch: FlowMatch | null = null;
    let bestScore = -Infinity;

    for (const request of pendingRequests) {
      // A hypha cannot feed itself — that would be a metabolic short-circuit.
      if (request.requesterId === donor.id) continue;

      const breakdown = this.scoreCandidate(donor, request);
      const score = breakdown.urgency * breakdown.capabilityOverlap * breakdown.proximity;

      // Zero overlap means incompatible nutrient types — skip.
      if (breakdown.capabilityOverlap === 0) continue;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          donorId: donor.id,
          recipientId: request.requesterId,
          score,
          breakdown,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Score a single donor-request pair across the three gradient axes.
   */
  private scoreCandidate(
    donor: Agent,
    request: NutrientRequest,
  ): FlowMatch["breakdown"] {
    // ── Urgency ─────────────────────────────────────────
    // Direct pass-through: the requester's self-reported starvation level.
    const urgency = Math.max(0, Math.min(1, request.urgency));

    // ── Capability overlap ──────────────────────────────
    // Jaccard similarity between donor capabilities and request requirements.
    // Field note: a perfect overlap of 1.0 means the donor synthesizes
    // exactly what the recipient needs — ideal mutualism.
    const overlap = this.jaccardSimilarity(donor.capabilities, request.requiredCapabilities);

    // ── Proximity in merge order ────────────────────────
    // Closer lanes mean shorter translocation distance.
    // Normalized to [0, 1] — adjacent lanes score highest.
    const laneDistance = Math.abs(donor.lane - request.lane);
    const proximity = 1 - Math.min(laneDistance / this.maxLaneDistance, 1);

    return { urgency, capabilityOverlap: overlap, proximity };
  }

  /**
   * Jaccard similarity coefficient between two sets.
   * |A ∩ B| / |A ∪ B| — a classic ecological community similarity metric.
   */
  private jaccardSimilarity(setA: ReadonlySet<string>, setB: ReadonlySet<string>): number {
    if (setA.size === 0 && setB.size === 0) return 0;

    let intersectionSize = 0;
    for (const element of setA) {
      if (setB.has(element)) intersectionSize++;
    }

    const unionSize = setA.size + setB.size - intersectionSize;
    return unionSize === 0 ? 0 : intersectionSize / unionSize;
  }
}
