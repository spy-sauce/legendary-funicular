# Mycelium Framework Specification v1.0

> Mycelium Framework — VibeSpace LLC — The network provides.

## Overview

This document is the canonical specification for the Mycelium agentic execution
framework. Every implementation — regardless of language or infrastructure —
MUST satisfy the interfaces and protocols defined here.

Mycelium is not a library. It's an ideology encoded as infrastructure.

---

## 1. Core Philosophy

See [MANIFESTO.md](../MANIFESTO.md) for the full philosophy. The spec encodes
the manifesto into executable abstractions.

---

## 2. Agent Interface

Every Mycelium agent MUST implement the following interface:

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier for this agent node |
| `scope` | `string` | What this agent owns — its domain |
| `lane` | `string` | Current work assignment within scope |
| `state` | `AgentState` | Current lifecycle state |
| `capabilities` | `string[]` | What this agent can offer as nutrients |
| `dependencies` | `string[]` | Agent IDs this agent is blocked by |

### AgentState Enum

```
GERMINATING  — Initializing, reading contracts, understanding the organism
GROWING      — Executing primary scope work
FLOWING      — Primary work done, flowing nutrients to other agents
FRUITING     — Producing deliverables / outputs
DORMANT      — Idle, waiting for network signal
```

### Methods

#### `sense() → NetworkState`
Observe the state of adjacent nodes and the whole organism. Returns a snapshot
of the network including all agent states, pending nutrient requests, and
organism health score.

#### `execute() → void`
Do the work in your lane. This is the agent's primary function — whatever
scope-specific work it was created to do.

#### `flow(targetAgent: AgentId) → void`
Contribute to another agent's work when your lane is clear. The nutrient flow
algorithm determines the best target, but the agent can also volunteer.

#### `signal(healthPulse: HealthPulse) → void`
Broadcast your state to the network continuously. This is not optional.
Silent agents are assumed dead.

#### `absorb(contract: Contract) → void`
Ingest a shared contract (chemical signal). The agent validates the contract
against the schema and incorporates it into its working context.

#### `fruit() → Deliverable[]`
Produce deliverables. Called when the agent transitions to FRUITING state.
Returns a list of artifacts the agent has produced.

---

## 3. Orchestrator Interface (Root Node)

The orchestrator is the root node of the mycelium network. It does not
micromanage — it cultivates.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `agents` | `Agent[]` | All nodes in the network |
| `contracts` | `Contract[]` | Frozen shared contracts (chemical signals) |
| `mergeOrder` | `string[]` | Deterministic sequence for integration |

### Methods

#### `cultivate() → void`
Initialize the network: distribute contracts to all agents, set initial states
to GERMINATING, start the health pulse listeners, and begin the growth cycle.

#### `observe() → OrganismHealth`
Monitor organism health without micromanaging. Returns aggregate health:
- Number of agents in each state
- Blocked agents and their blockers
- Nutrient requests without offers
- Overall organism health score (0.0 - 1.0)

#### `resolve(conflict: Conflict) → Resolution`
Handle merge conflicts or blocked agents. The orchestrator can:
- Reassign nutrients (tell a FLOWING agent where to help)
- Approve contract updates
- Force state transitions for stuck agents

#### `harvest() → Deliverable[]`
Collect all FRUIT_READY deliverables from the network. Only callable when
the organism health score is above the harvest threshold (default: 0.8).

---

## 4. Network Protocol — The Mycelium Wire

All agents communicate through a pub/sub event mesh. The transport is
implementation-specific (in-process events, Redis Streams, Kafka, etc.)
but the message format is universal.

### Event Types

| Event | Payload Schema | Direction |
|-------|---------------|-----------|
| `HEALTH_PULSE` | `health-signal.schema.json` | Agent → Network |
| `NUTRIENT_OFFER` | `nutrient-request.schema.json` | Agent → Network |
| `NUTRIENT_REQUEST` | `nutrient-request.schema.json` | Agent → Network |
| `CONTRACT_UPDATE` | `contract.schema.json` | Orchestrator → Network |
| `FRUIT_READY` | `{ agentId, deliverables[] }` | Agent → Orchestrator |
| `MERGE_SIGNAL` | `{ agentId, branch, order }` | Agent → Orchestrator |

### Health Pulse Format

Every agent MUST emit a health pulse at a configurable interval (default: 30s).
The pulse follows this human-readable format for logging:

```
[AGENT-{id}:{SCOPE}] {state_emoji} {status_message} | {flow_status} | network {health}
```

State emojis:
- GERMINATING: 🌱
- GROWING: 🌿
- FLOWING: 🔄
- FRUITING: 🍄
- DORMANT: 💤

### Nutrient Flow Algorithm

When an agent transitions to FLOWING state, the network executes:

1. Collect all pending NUTRIENT_REQUEST events
2. Match the flowing agent's capabilities against request requirements
3. Score matches by: urgency × capability_overlap × proximity_in_merge_order
4. Assign the highest-scoring match
5. If no matches, the agent enters DORMANT

---

## 5. Shared Contracts

Contracts are JSON documents validated against `contract.schema.json`. They
represent the agreed-upon interfaces between agents — the chemical signals.

### Contract Lifecycle

1. **Draft** — Contracts are proposed during planning
2. **Frozen** — Before execution begins, all contracts are frozen via `mycelium contracts freeze`
3. **Active** — During execution, contracts are read-only references
4. **Updated** — Rare. Requires orchestrator approval and triggers CONTRACT_UPDATE event

### Contract Structure

```json
{
  "$schema": "contract.schema.json",
  "name": "user-entity",
  "version": "1.0.0",
  "owner": "auth-agent",
  "consumers": ["identity-agent", "card-agent"],
  "frozen": true,
  "definition": { ... }
}
```

---

## 6. Configuration

Every Mycelium project has a `mycelium.yaml` at its root:

```yaml
organism:
  name: "project-name"
  ship_target: "7 days"
  health_pulse_interval: 30  # seconds
  harvest_threshold: 0.8     # minimum health to harvest

contracts:
  - path/to/contract1.json
  - path/to/contract2.json

agents:
  - id: agent-1
    scope: "Domain A"
    branch: feat/domain-a
    blocked_by: []
    blocks: [agent-2]
    capabilities: ["java", "spring-boot", "postgres"]

merge_order:
  - agent-1
  - agent-2

timeline:
  parallel_phases:
    - hours: "0-4"
      active: [agent-1, agent-2]
```

---

## 7. Compliance

An implementation is Mycelium-compliant when:

- [ ] All Agent Interface methods are implemented
- [ ] All Orchestrator Interface methods are implemented
- [ ] Health pulses are emitted at the configured interval
- [ ] Contracts are validated against the JSON schemas
- [ ] The nutrient flow algorithm is implemented
- [ ] Events follow the defined schemas
- [ ] The CLI can interact with the implementation
- [ ] The organism can be cultivated, observed, and harvested

---

*Mycelium Framework — VibeSpace LLC*
*The network provides.* 🍄
