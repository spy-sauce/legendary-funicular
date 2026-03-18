// Mycelium Framework — VibeSpace LLC — The network provides.

import { EventEmitter } from "node:events";

/**
 * Life-cycle states of a mycelial agent, mirroring the stages
 * of fungal development from spore germination through fruiting body formation.
 */
export enum AgentState {
  /** Spore has landed; agent is initializing its internal structures. */
  GERMINATING = "GERMINATING",
  /** Hyphae extending; agent is acquiring resources and building connections. */
  GROWING = "GROWING",
  /** Cytoplasmic streaming active; agent is transferring nutrients to peers. */
  FLOWING = "FLOWING",
  /** Primordia forming; agent is producing its output artifact. */
  FRUITING = "FRUITING",
  /** Metabolic activity suspended; agent awaits reactivation signal. */
  DORMANT = "DORMANT",
}

/** Field-notebook glyphs for each developmental stage. */
export const stateGlyph: Record<AgentState, string> = {
  [AgentState.GERMINATING]: "🌱",
  [AgentState.GROWING]: "🌿",
  [AgentState.FLOWING]: "💧",
  [AgentState.FRUITING]: "🍄",
  [AgentState.DORMANT]: "💤",
};

/**
 * Permitted state transitions — only biologically plausible paths.
 * A dormant spore may re-germinate; a fruiting body may go dormant.
 */
const validTransitions: Record<AgentState, ReadonlySet<AgentState>> = {
  [AgentState.GERMINATING]: new Set([AgentState.GROWING, AgentState.DORMANT]),
  [AgentState.GROWING]: new Set([AgentState.FLOWING, AgentState.DORMANT]),
  [AgentState.FLOWING]: new Set([AgentState.FRUITING, AgentState.GROWING, AgentState.DORMANT]),
  [AgentState.FRUITING]: new Set([AgentState.DORMANT]),
  [AgentState.DORMANT]: new Set([AgentState.GERMINATING]),
};

/** Nutrient packet exchanged between agents during cytoplasmic flow. */
export interface Nutrient<T = unknown> {
  readonly sourceId: string;
  readonly targetId: string;
  readonly substrate: T;
  readonly timestamp: number;
}

/** Signal emitted on the internal hypha when state changes occur. */
export interface StateChangeEvent {
  readonly agentId: string;
  readonly previous: AgentState;
  readonly current: AgentState;
  readonly timestamp: number;
}

/**
 * Abstract base for every organism in the mycelial network.
 *
 * Observation: each agent behaves like a single hyphal tip —
 * it senses its micro-environment, extends toward nutrients,
 * and occasionally produces a fruiting body (deliverable artifact).
 */
export abstract class Agent<TInput = unknown, TOutput = unknown> {
  /** Unique hypha identifier within the colony. */
  readonly id: string;

  /** Ecological niche this agent occupies (e.g., "code-gen", "review"). */
  readonly scope: string;

  /** Merge lane — determines position in the substrate flow graph. */
  readonly lane: number;

  /** Nutrient types this hypha can metabolize. */
  readonly capabilities: ReadonlySet<string>;

  /** Other hyphae whose exudates this agent requires before germinating. */
  readonly dependencies: ReadonlySet<string>;

  /** Internal signaling channel — like a septal pore between compartments. */
  protected readonly hypha = new EventEmitter();

  private _state: AgentState = AgentState.DORMANT;

  constructor(config: {
    id: string;
    scope: string;
    lane: number;
    capabilities: Iterable<string>;
    dependencies?: Iterable<string>;
  }) {
    this.id = config.id;
    this.scope = config.scope;
    this.lane = config.lane;
    this.capabilities = new Set(config.capabilities);
    this.dependencies = new Set(config.dependencies ?? []);
  }

  // ── Accessors ─────────────────────────────────────────────

  get state(): AgentState {
    return this._state;
  }

  get glyph(): string {
    return stateGlyph[this._state];
  }

  // ── State transitions ─────────────────────────────────────

  /**
   * Validated state transition — rejects biologically impossible jumps.
   * Specimen note: attempting DORMANT → FRUITING throws; a spore cannot
   * fruit without first germinating, growing, and flowing.
   */
  protected transitionTo(next: AgentState): void {
    const allowed = validTransitions[this._state];
    if (!allowed.has(next)) {
      throw new InvalidTransitionError(this.id, this._state, next);
    }
    const previous = this._state;
    this._state = next;
    const event: StateChangeEvent = {
      agentId: this.id,
      previous,
      current: next,
      timestamp: Date.now(),
    };
    this.hypha.emit("state-change", event);
  }

  // ── Concrete life-cycle methods ───────────────────────────

  /**
   * Chemotaxis — sense the local substrate gradient before committing
   * to a growth direction. Returns true if conditions favour extension.
   */
  async sense(environment: Record<string, unknown>): Promise<boolean> {
    // Subclasses may override; default: always extend.
    void environment;
    return true;
  }

  /**
   * Primary metabolic cycle. Germinate → grow → execute core logic.
   */
  async execute(input: TInput): Promise<void> {
    this.transitionTo(AgentState.GERMINATING);
    this.transitionTo(AgentState.GROWING);
    await this.onExecute(input);
  }

  /**
   * Cytoplasmic streaming — push nutrients toward a neighbouring hypha.
   */
  async flow(targetId: string, substrate: TInput): Promise<Nutrient<TInput>> {
    this.transitionTo(AgentState.FLOWING);
    await this.onFlow(targetId);
    const nutrient: Nutrient<TInput> = {
      sourceId: this.id,
      targetId,
      substrate,
      timestamp: Date.now(),
    };
    this.hypha.emit("nutrient-flow", nutrient);
    return nutrient;
  }

  /**
   * Emit a chemical signal detectable by nearby hyphae.
   */
  signal(name: string, payload?: unknown): void {
    this.hypha.emit("signal", { agentId: this.id, name, payload, timestamp: Date.now() });
  }

  /**
   * Absorb a nutrient packet delivered from another agent.
   */
  absorb(nutrient: Nutrient): void {
    this.hypha.emit("absorb", nutrient);
  }

  /**
   * Form the fruiting body — produce the final deliverable artifact.
   */
  async fruit(): Promise<TOutput> {
    this.transitionTo(AgentState.FRUITING);
    const output = await this.onFruit();
    this.transitionTo(AgentState.DORMANT);
    return output;
  }

  /**
   * Subscribe to internal hypha events (state-change, nutrient-flow, signal).
   */
  on(event: string, listener: (...args: unknown[]) => void): this {
    this.hypha.on(event, listener);
    return this;
  }

  // ── Abstract methods — define the organism's unique metabolism ──

  /** Core processing logic — what this hypha actually *does*. */
  protected abstract onExecute(input: TInput): Promise<void>;

  /** Preparation hook before streaming nutrients to `targetId`. */
  protected abstract onFlow(targetId: string): Promise<void>;

  /** Synthesise and return the fruiting body. */
  protected abstract onFruit(): Promise<TOutput>;
}

/**
 * Thrown when an agent attempts a biologically impossible state transition.
 * Field note: like finding a fruiting body on an ungerminated spore — suspicious.
 */
export class InvalidTransitionError extends Error {
  constructor(
    readonly agentId: string,
    readonly from: AgentState,
    readonly to: AgentState,
  ) {
    super(
      `Agent "${agentId}" cannot transition from ${stateGlyph[from]} ${from} to ${stateGlyph[to]} ${to}`,
    );
    this.name = "InvalidTransitionError";
  }
}
