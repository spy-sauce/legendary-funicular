// Mycelium Framework — VibeSpace LLC — The network provides.

import { Agent, AgentState, stateGlyph } from "./agent.js";
import type { ColonyContract } from "./contracts.js";
import { freezeContracts, validateContract } from "./contracts.js";
import type { EventBus, MyceliumEvent } from "./bus.js";
import { MyceliumEventType } from "./bus.js";
import { NutrientMatcher, type FlowMatch, type NutrientRequest } from "./flow.js";
import { HealthPulseEmitter, formatPulse, type HealthPulse } from "./health.js";

/**
 * Diagnostic snapshot of the entire colony's vitality.
 * Returned by observe() — the mycologist's field report.
 */
export interface OrganismHealth {
  /** Colony name from the contract. */
  readonly colonyName: string;
  /** Fraction of agents currently in FRUITING or DORMANT (post-fruit) state. */
  readonly fruitingRatio: number;
  /** Per-agent state summary. */
  readonly agents: ReadonlyArray<{
    readonly id: string;
    readonly state: AgentState;
    readonly glyph: string;
    readonly lane: number;
  }>;
  /** Timestamp of the observation. */
  readonly observedAt: string;
  /** Whether the colony has reached the harvest threshold. */
  readonly harvestReady: boolean;
}

/**
 * The Orchestrator — root node of the mycelial network.
 *
 * Field note: this is the "fairy ring" coordinator. It does not itself
 * metabolize substrates; instead it cultivates the colony, observes
 * organism health, resolves nutrient flow conflicts, and triggers
 * harvest when enough fruiting bodies have matured.
 *
 * Think of it as the mycologist tending the agar plates.
 */
export class Orchestrator {
  /** Registry of all living hyphae, keyed by agent id. */
  private readonly agents = new Map<string, Agent>();

  /** The frozen symbiotic contract governing this colony. */
  private readonly contract: Readonly<ColonyContract>;

  /** Explicit merge order — determines flow priority. */
  private readonly mergeOrder: readonly string[];

  /** Fraction of agents that must fruit before harvest is triggered. */
  private readonly harvestThreshold: number;

  /** Colony-wide signaling network. */
  private readonly bus: EventBus;

  /** Nutrient flow algorithm instance. */
  private readonly matcher: NutrientMatcher;

  /** Health pulse emitters, one per agent. */
  private readonly pulseEmitters = new Map<string, HealthPulseEmitter>();

  /** Pending nutrient requests awaiting donor matching. */
  private readonly pendingRequests: NutrientRequest[] = [];

  /** Agents that have successfully fruited in this cultivation cycle. */
  private readonly fruited = new Set<string>();

  constructor(config: {
    contract: ColonyContract | unknown;
    bus: EventBus;
    maxLaneDistance?: number;
  }) {
    // Validate and freeze — no mutations after the colony is inoculated.
    const validated = config.contract instanceof Object && "name" in (config.contract as Record<string, unknown>)
      ? validateContract(config.contract)
      : validateContract(config.contract);
    this.contract = freezeContracts(validated);

    this.bus = config.bus;
    this.harvestThreshold = this.contract.harvestThreshold;
    this.mergeOrder = this.contract.mergeOrder ?? this.contract.agents
      .slice()
      .sort((a, b) => a.lane - b.lane)
      .map((a) => a.id);

    this.matcher = new NutrientMatcher({
      maxLaneDistance: config.maxLaneDistance ?? Math.max(10, this.contract.agents.length),
    });

    // Subscribe to colony-wide events.
    void this.bus.subscribe(MyceliumEventType.NUTRIENT_REQUEST, (event: MyceliumEvent) => {
      this.pendingRequests.push(event.payload as NutrientRequest);
    });

    void this.bus.subscribe(MyceliumEventType.FRUIT_READY, (event: MyceliumEvent) => {
      const { agentId } = event.payload as { agentId: string };
      this.fruited.add(agentId);
    });
  }

  // ── Agent registration ────────────────────────────────────

  /**
   * Inoculate the colony with a living agent instance.
   * The agent must correspond to a contract entry.
   */
  register(agent: Agent): void {
    const spec = this.contract.agents.find((a) => a.id === agent.id);
    if (!spec) {
      throw new Error(
        `Agent "${agent.id}" has no contract entry — cannot graft unrecognized hypha onto the colony`,
      );
    }
    this.agents.set(agent.id, agent);
  }

  // ── Life-cycle commands ───────────────────────────────────

  /**
   * Cultivate the colony — initialize all agents and begin the growth cycle.
   *
   * Observation: agents are activated in merge-order, respecting
   * dependency chains. A hypha will not germinate until all its
   * upstream dependencies have at least reached GROWING state.
   */
  async cultivate(): Promise<void> {
    // Activate in merge order.
    for (const agentId of this.mergeOrder) {
      const agent = this.agents.get(agentId);
      if (!agent) continue; // Contract entry without a registered instance — skip.

      const spec = this.contract.agents.find((a) => a.id === agentId);

      // Wire up health pulse emitter.
      const emitter = new HealthPulseEmitter(
        agentId,
        spec?.healthInterval ?? 30_000,
        async (pulse: HealthPulse) => {
          await this.bus.publish({
            type: MyceliumEventType.HEALTH_PULSE,
            sourceId: agentId,
            payload: pulse,
            timestamp: Date.now(),
          });
        },
      );

      emitter.start(() => ({
        state: agent.state,
        load: 0.5, // Agents can override with real metrics.
      }));

      this.pulseEmitters.set(agentId, emitter);
    }

    // Broadcast cultivation signal.
    await this.bus.publish({
      type: MyceliumEventType.MERGE_SIGNAL,
      sourceId: "orchestrator",
      payload: { phase: "cultivate", mergeOrder: this.mergeOrder },
      timestamp: Date.now(),
    });
  }

  /**
   * Observe the colony — produce a diagnostic health snapshot.
   *
   * Field note: this is the equivalent of lifting the agar plate lid
   * and examining colony morphology under the microscope.
   */
  observe(): OrganismHealth {
    const agentStates = Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      state: a.state,
      glyph: stateGlyph[a.state],
      lane: a.lane,
    }));

    const total = this.agents.size;
    const fruitedCount = this.fruited.size;
    const fruitingRatio = total === 0 ? 0 : fruitedCount / total;

    return {
      colonyName: this.contract.name,
      fruitingRatio,
      agents: agentStates,
      observedAt: new Date().toISOString(),
      harvestReady: fruitingRatio >= this.harvestThreshold,
    };
  }

  /**
   * Resolve pending nutrient flow requests — match donors to recipients.
   *
   * Returns the set of matches made in this resolution pass.
   * Field note: like watching time-lapse footage of nutrient translocation
   * through fluorescein-tagged hyphae.
   */
  resolve(): readonly FlowMatch[] {
    const matches: FlowMatch[] = [];

    // Iterate over flowing agents and attempt to match each.
    for (const agent of this.agents.values()) {
      if (agent.state !== AgentState.FLOWING) continue;

      const match = this.matcher.match(agent, this.pendingRequests);
      if (match) {
        matches.push(match);

        // Remove the fulfilled request from the pending pool.
        const idx = this.pendingRequests.findIndex(
          (r) => r.requesterId === match.recipientId,
        );
        if (idx !== -1) {
          this.pendingRequests.splice(idx, 1);
        }
      }
    }

    return matches;
  }

  /**
   * Harvest the colony — collect all fruiting bodies if the threshold is met.
   *
   * Returns the ids of agents whose fruit was collected, or null
   * if the colony has not yet reached the harvest threshold.
   *
   * Observation: premature harvest yields nothing — patience is
   * the mycologist's greatest virtue.
   */
  async harvest(): Promise<readonly string[] | null> {
    const health = this.observe();
    if (!health.harvestReady) return null;

    const harvested = [...this.fruited];

    // Stop all pulse emitters — the growth cycle is complete.
    for (const emitter of this.pulseEmitters.values()) {
      emitter.stop();
    }

    // Broadcast harvest signal.
    await this.bus.publish({
      type: MyceliumEventType.MERGE_SIGNAL,
      sourceId: "orchestrator",
      payload: { phase: "harvest", harvested },
      timestamp: Date.now(),
    });

    return harvested;
  }

  // ── Diagnostics ───────────────────────────────────────────

  /**
   * Render the colony health as a formatted field-note entry.
   */
  formatHealth(): string {
    const health = this.observe();
    const lines = [
      `Colony: ${health.colonyName}`,
      `Observed: ${health.observedAt}`,
      `Fruiting: ${(health.fruitingRatio * 100).toFixed(0)}% (threshold: ${(this.harvestThreshold * 100).toFixed(0)}%)`,
      `Harvest ready: ${health.harvestReady ? "yes" : "no"}`,
      "",
      "Agents:",
      ...health.agents.map(
        (a) => `  ${a.glyph} ${a.id.padEnd(24)} lane ${a.lane}  ${a.state}`,
      ),
    ];
    return lines.join("\n");
  }

  /** Number of registered agents. */
  get colonySize(): number {
    return this.agents.size;
  }

  /** The frozen contract governing this colony. */
  get colonyContract(): Readonly<ColonyContract> {
    return this.contract;
  }
}
