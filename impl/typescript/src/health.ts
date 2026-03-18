// Mycelium Framework — VibeSpace LLC — The network provides.

import { AgentState, stateGlyph } from "./agent.js";

/**
 * Health pulse — periodic bioluminescent signal emitted by each hypha.
 *
 * Field note: in Panellus stipticus, bioluminescence intensity correlates
 * with metabolic activity. We mirror this: brighter pulse = healthier agent.
 */
export interface HealthPulse {
  /** Emitting hypha identifier. */
  readonly agentId: string;
  /** Current developmental stage. */
  readonly state: AgentState;
  /** ISO-8601 timestamp of emission. */
  readonly timestamp: string;
  /** Metabolic load — 0.0 (idle) to 1.0 (saturated). */
  readonly load: number;
  /** Count of nutrients successfully absorbed since last pulse. */
  readonly nutrientsAbsorbed: number;
  /** Count of nutrients flowed to downstream hyphae since last pulse. */
  readonly nutrientsFlowed: number;
  /** Free-form diagnostics — like spore print color notes. */
  readonly notes?: string;
}

/**
 * Configurable health-pulse emitter.
 *
 * Attach to any agent; it will periodically sample the agent's vitals
 * and invoke the registered callback. Observation: the interval mimics
 * the circadian rhythm of bioluminescent fungi.
 */
export class HealthPulseEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private absorbed = 0;
  private flowed = 0;

  constructor(
    /** Agent id — which hypha this emitter is grafted onto. */
    private readonly agentId: string,
    /** Sampling interval in milliseconds — the bioluminescent cycle period. */
    private readonly intervalMs: number = 30_000,
    /** Callback invoked with each pulse — the observer's collection function. */
    private readonly onPulse: (pulse: HealthPulse) => void | Promise<void> = () => {},
  ) {}

  /**
   * Begin emitting pulses. Requires a state-sampling function
   * since the emitter is decoupled from the agent instance.
   */
  start(sampleState: () => { state: AgentState; load: number }): void {
    if (this.timer) return; // Already luminescing.

    this.timer = setInterval(() => {
      const { state, load } = sampleState();
      const pulse: HealthPulse = {
        agentId: this.agentId,
        state,
        timestamp: new Date().toISOString(),
        load: Math.min(1, Math.max(0, load)),
        nutrientsAbsorbed: this.absorbed,
        nutrientsFlowed: this.flowed,
      };

      // Reset counters — each pulse reports a delta window.
      this.absorbed = 0;
      this.flowed = 0;

      void Promise.resolve(this.onPulse(pulse)).catch((err: unknown) => {
        console.error(`[mycelium] health pulse error for ${this.agentId}:`, err);
      });
    }, this.intervalMs);
  }

  /** Cease bioluminescence — enter metabolic quiescence. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Record a nutrient absorption event. */
  recordAbsorption(count = 1): void {
    this.absorbed += count;
  }

  /** Record a nutrient flow event. */
  recordFlow(count = 1): void {
    this.flowed += count;
  }

  /** Is the emitter currently active? */
  get isLuminescing(): boolean {
    return this.timer !== null;
  }
}

// ── Formatting ──────────────────────────────────────────────

/**
 * Render a health pulse as a human-readable field-note entry.
 *
 * Sample output:
 *   🍄 agent-review | FRUITING | load: 0.42 | absorbed: 7 | flowed: 3
 */
export function formatPulse(pulse: HealthPulse): string {
  const glyph = stateGlyph[pulse.state];
  const load = (pulse.load * 100).toFixed(0).padStart(3);
  const parts = [
    `${glyph} ${pulse.agentId}`,
    pulse.state.padEnd(12),
    `load: ${load}%`,
    `absorbed: ${pulse.nutrientsAbsorbed}`,
    `flowed: ${pulse.nutrientsFlowed}`,
  ];

  if (pulse.notes) {
    parts.push(`notes: ${pulse.notes}`);
  }

  return parts.join(" | ");
}
