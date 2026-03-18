// Mycelium Framework — VibeSpace LLC — The network provides.

/**
 * Root export — the spore dispersal point.
 *
 * Field note: import from here to inoculate your project
 * with the full mycelial toolkit.
 */

export {
  Agent,
  AgentState,
  InvalidTransitionError,
  stateGlyph,
  type Nutrient,
  type StateChangeEvent,
} from "./agent.js";

export {
  Orchestrator,
  type OrganismHealth,
} from "./orchestrator.js";

export {
  AgentContractSchema,
  ColonyContractSchema,
  CapabilitySchema,
  DependencySchema,
  LaneSchema,
  ContractViolationError,
  loadContract,
  validateContract,
  freezeContracts,
  type AgentContract,
  type ColonyContract,
} from "./contracts.js";

export {
  LocalEventBus,
  RedisEventBus,
  MyceliumEventType,
  type EventBus,
  type EventListener,
  type MyceliumEvent,
} from "./bus.js";

export {
  HealthPulseEmitter,
  formatPulse,
  type HealthPulse,
} from "./health.js";

export {
  NutrientMatcher,
  type NutrientRequest,
  type FlowMatch,
} from "./flow.js";
