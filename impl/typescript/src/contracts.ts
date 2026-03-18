// Mycelium Framework — VibeSpace LLC — The network provides.

import { readFile } from "node:fs/promises";
import { z } from "zod";

// ── Zod schemas — encoding the symbiotic agreements ─────────
//
// Field note: contracts are the chemical language of the colony.
// Each schema below mirrors the canonical contract.schema.json but
// adds runtime validation that JSON Schema alone cannot enforce.

/** A single capability token — what a hypha can metabolize. */
export const CapabilitySchema = z.string().min(1).describe("Nutrient type this agent can process");

/** Dependency reference — an agent id that must fruit before this one germinates. */
export const DependencySchema = z.string().min(1).describe("Agent id of a required upstream hypha");

/** Merge-lane position — determines flow priority in the substrate graph. */
export const LaneSchema = z.number().int().nonneg().describe("Position in the merge order");

/**
 * Agent contract — the full symbiotic specification for one hypha.
 * Observation: this is the genome of a single organism in the colony.
 */
export const AgentContractSchema = z.object({
  id: z.string().min(1).describe("Unique hypha identifier"),
  scope: z.string().min(1).describe("Ecological niche"),
  lane: LaneSchema,
  capabilities: z.array(CapabilitySchema).min(1),
  dependencies: z.array(DependencySchema).default([]),
  healthInterval: z
    .number()
    .int()
    .positive()
    .default(30_000)
    .describe("Milliseconds between health pulses"),
  metadata: z.record(z.unknown()).optional().describe("Arbitrary exudate data"),
});

/** Inferred TypeScript type — the decoded genome. */
export type AgentContract = z.infer<typeof AgentContractSchema>;

/**
 * Colony contract — the full ecosystem specification.
 * Contains all agents, their relationships, and global colony parameters.
 */
export const ColonyContractSchema = z.object({
  name: z.string().min(1).describe("Colony designation"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).describe("Semantic version"),
  agents: z.array(AgentContractSchema).min(1),
  harvestThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.8)
    .describe("Fraction of agents that must fruit before harvest"),
  mergeOrder: z
    .array(z.string())
    .optional()
    .describe("Explicit lane ordering; inferred from lane numbers if omitted"),
  environment: z
    .record(z.string())
    .optional()
    .describe("Substrate conditions — environment variables for the colony"),
});

export type ColonyContract = z.infer<typeof ColonyContractSchema>;

// ── Contract loading ────────────────────────────────────────

/**
 * Read a contract from the filesystem and validate it against the colony schema.
 *
 * Specimen note: contracts are typically stored as JSON or YAML
 * in the project root. This loader handles JSON; YAML support
 * can be grafted on via a pre-processor.
 */
export async function loadContract(filePath: string): Promise<ColonyContract> {
  const raw = await readFile(filePath, "utf-8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new ContractViolationError(
      `Failed to parse contract at ${filePath} — substrate appears malformed`,
      { cause },
    );
  }

  return validateContract(parsed);
}

/**
 * Validate an unknown blob against the colony contract schema.
 * Returns the typed contract or throws ContractViolationError.
 */
export function validateContract(data: unknown): ColonyContract {
  const result = ColonyContractSchema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    throw new ContractViolationError(
      `Colony contract validation failed — symbiotic agreements broken:\n${issues}`,
    );
  }

  // Cross-reference: every dependency must reference an existing agent id.
  const knownIds = new Set(result.data.agents.map((a) => a.id));
  for (const agent of result.data.agents) {
    for (const dep of agent.dependencies) {
      if (!knownIds.has(dep)) {
        throw new ContractViolationError(
          `Agent "${agent.id}" depends on "${dep}", but no such hypha exists in the colony`,
        );
      }
    }
  }

  // Cycle detection — a hypha cannot depend on its own downstream exudates.
  detectCycles(result.data.agents);

  return result.data;
}

/**
 * Freeze all contracts in a colony — no further mutations allowed.
 * Like the chitinous cell wall hardening after growth ceases.
 */
export function freezeContracts(colony: ColonyContract): Readonly<ColonyContract> {
  const frozen = {
    ...colony,
    agents: colony.agents.map((a) => Object.freeze({ ...a })),
  };
  return Object.freeze(frozen);
}

// ── Cycle detection ─────────────────────────────────────────

/**
 * Topological analysis — detect circular dependencies.
 * Field note: circular nutrient flows would starve the entire colony.
 */
function detectCycles(agents: readonly AgentContract[]): void {
  const graph = new Map<string, readonly string[]>();
  for (const agent of agents) {
    graph.set(agent.id, agent.dependencies);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string, path: string[]): void {
    if (inStack.has(nodeId)) {
      const cycle = [...path.slice(path.indexOf(nodeId)), nodeId].join(" → ");
      throw new ContractViolationError(
        `Circular dependency detected — nutrient loop will starve the colony: ${cycle}`,
      );
    }
    if (visited.has(nodeId)) return;

    inStack.add(nodeId);
    path.push(nodeId);

    for (const dep of graph.get(nodeId) ?? []) {
      dfs(dep, path);
    }

    path.pop();
    inStack.delete(nodeId);
    visited.add(nodeId);
  }

  for (const nodeId of graph.keys()) {
    dfs(nodeId, []);
  }
}

// ── Error types ─────────────────────────────────────────────

/**
 * Thrown when a contract fails validation — the symbiotic agreement is broken.
 * Field note: like discovering a parasitic fungus masquerading as mycorrhiza.
 */
export class ContractViolationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ContractViolationError";
  }
}
