# Mycelium Python Embedding Guide

> **The CLI orchestrates. Python embeds.**

This guide is for developers who want to **embed Mycelium agents inside an existing Python service** — not replace the TypeScript CLI orchestrator. If your goal is to run a full cultivation pipeline from scratch, see the [main CLI documentation](../../README.md).

---

## When to Use Python Embedding

| Scenario | Use Python | Use CLI |
|----------|------------|---------|
| Add an agent to an existing FastAPI/Django service | Yes | No |
| Run a full `plant -> cultivate -> harvest` pipeline | No | Yes |
| Participate as a leaf in a larger organism | Yes | No |
| Orchestrate 50+ concurrent Claude sessions | No | Yes |
| Integrate with Python-native ML pipelines | Yes | No |
| CI/CD automation with DDP stages | No | Yes |

**Rule of thumb:** If you're building *a service that happens to have agents*, use Python embedding. If you're building *an organism that happens to produce a service*, use the CLI.

---

## Installation

### From local source (recommended during development)

```bash
pip install -e /path/to/mycelium/impl/python
```

### Add to `requirements.txt`

```
mycelium-framework @ file:///path/to/mycelium/impl/python
```

### Dependencies

The package requires Python 3.10+ and installs:
- `jsonschema>=4.20.0` — contract validation
- `aioredis>=2.0.0` — distributed event bus (optional, for multi-process setups)
- `pyyaml>=6.0` — configuration parsing

---

## Core Concepts

### The Agent Lifecycle

Every agent is a **hypha** (fungal thread) in the mycelium network. Agents follow a strict lifecycle:

```
DORMANT -> GERMINATING -> GROWING -> FLOWING -> FRUITING -> DORMANT
                              \          /
                               `-> DORMANT (stress/failure)
```

State transitions are enforced — you cannot skip stages. See [NUTRIENTS.md §3](../../NUTRIENTS.md#3-upgrade-module-shape) for the canonical lifecycle hooks.

### Event Bus

Agents communicate through an event bus — the "chemical signal transport layer" of the organism. Two implementations:

| Bus | Use Case |
|-----|----------|
| `LocalEventBus` | Single process, all agents in one Python runtime |
| `RedisEventBus` | Distributed, agents across containers/machines |

---

## Minimal Example: Embedding a Single Agent

```python
import asyncio
from mycelium import BaseAgent, AgentState, LocalEventBus
from typing import Any


class DataProcessorAgent(BaseAgent):
    """
    A hypha that processes incoming data batches.
    Embeds inside an existing data pipeline service.
    """

    async def sense(self) -> dict[str, Any]:
        """Probe the environment — what contracts are available?"""
        return {
            "contracts_absorbed": len(self._absorbed_contracts),
            "state": self.state.value,
        }

    async def execute(self) -> Any:
        """
        Primary metabolic work — process the data.
        Transition through lifecycle stages as you go.
        """
        self._transition(AgentState.GROWING)

        # ... your data processing logic here ...
        result = {"records_processed": 1000, "errors": 0}

        self._transition(AgentState.FRUITING)
        return result

    async def flow(self, target_agent: BaseAgent) -> dict[str, Any]:
        """
        Offer capabilities to another agent.
        Called when the network needs nutrient redistribution.
        """
        self._transition(AgentState.FLOWING)
        return {
            "flowed_to": target_agent.id,
            "capabilities": self.capabilities,
        }

    async def signal(self) -> dict[str, Any]:
        """
        Health pulse — the heartbeat of this hypha.
        Silent agents are assumed dead by the orchestrator.
        """
        return {
            "health": "healthy",
            "state": self.state.value,
        }

    async def absorb(self, contract: dict[str, Any]) -> None:
        """Absorb a contract (work assignment) from the substrate."""
        self._absorbed_contracts.append(contract)

    async def fruit(self) -> Any:
        """
        Produce deliverables — only valid in FRUITING state.
        This is what gets harvested.
        """
        return {
            "artifact": "processed-data",
            "location": "/output/batch-001.parquet",
        }


async def main():
    # Create the local event bus (single-process signal transport)
    bus = LocalEventBus()
    await bus.start()

    # Instantiate your agent
    agent = DataProcessorAgent(
        agent_id="data-processor",
        scope="batch data processing",
        capabilities=["python", "pandas", "parquet"],
    )

    # Lifecycle: germinate -> execute -> fruit
    agent.germinate()
    await agent.execute()
    result = await agent.fruit()

    print(f"Harvested: {result}")

    await bus.stop()


if __name__ == "__main__":
    asyncio.run(main())
```

---

## Multi-Agent Setup with Orchestrator

For coordinating multiple embedded agents within a single Python process:

```python
import asyncio
from mycelium import (
    BaseAgent,
    AgentState,
    Orchestrator,
    LocalEventBus,
    load_contracts_from_directory,
)
from typing import Any


class AuthAgent(BaseAgent):
    """Handles authentication substrate."""

    async def sense(self) -> dict[str, Any]:
        return {"contracts": len(self._absorbed_contracts)}

    async def execute(self) -> Any:
        self._transition(AgentState.GROWING)
        # ... auth logic ...
        self._transition(AgentState.FRUITING)
        return {"status": "authenticated"}

    async def flow(self, target: BaseAgent) -> dict[str, Any]:
        return {"token": "jwt-example", "target": target.id}

    async def signal(self) -> dict[str, Any]:
        return {"health": "ok"}

    async def absorb(self, contract: dict[str, Any]) -> None:
        self._absorbed_contracts.append(contract)

    async def fruit(self) -> Any:
        return {"service": "auth", "files": ["auth.py"]}


class ApiAgent(BaseAgent):
    """Handles API endpoints."""

    async def sense(self) -> dict[str, Any]:
        return {"contracts": len(self._absorbed_contracts)}

    async def execute(self) -> Any:
        self._transition(AgentState.GROWING)
        # ... API logic ...
        self._transition(AgentState.FRUITING)
        return {"endpoints": 5}

    async def flow(self, target: BaseAgent) -> dict[str, Any]:
        return {"routes": ["/users", "/auth"], "target": target.id}

    async def signal(self) -> dict[str, Any]:
        return {"health": "ok"}

    async def absorb(self, contract: dict[str, Any]) -> None:
        self._absorbed_contracts.append(contract)

    async def fruit(self) -> Any:
        return {"service": "api", "files": ["routes.py"]}


async def run_organism():
    bus = LocalEventBus()
    await bus.start()

    # Create agents
    auth = AuthAgent(agent_id="auth", scope="authentication", capabilities=["jwt"])
    api = ApiAgent(agent_id="api", scope="endpoints", capabilities=["rest"])

    # Load contracts from spec directory (if available)
    # contracts = load_contracts_from_directory("spec/contracts/")
    contracts = []  # Or define inline

    # Create orchestrator — the root node
    organism = Orchestrator(
        agents=[auth, api],
        contracts=contracts,
        merge_order=["auth", "api"],  # Auth merges before API
        event_bus=bus,
        health_threshold=0.8,
    )

    # Run the lifecycle
    await organism.cultivate()  # Distribute contracts, germinate agents

    # Execute each agent (in a real system, this would be event-driven)
    for agent in organism.agents:
        await agent.execute()

    # Harvest when healthy
    fruits = await organism.harvest()
    print(f"Harvested {len(fruits)} fruits")

    await organism.shutdown()
    await bus.stop()


if __name__ == "__main__":
    asyncio.run(run_organism())
```

---

## Event Bus Patterns

### LocalEventBus — Single Process

```python
from mycelium import LocalEventBus, EventType

bus = LocalEventBus()
await bus.start()

# Subscribe to health pulses
async def on_health(payload: dict):
    print(f"Health update: {payload}")

await bus.subscribe(EventType.HEALTH_PULSE, on_health)

# Publish an event
await bus.publish(EventType.HEALTH_PULSE, {"agent": "auth", "score": 0.95})

await bus.stop()
```

### RedisEventBus — Distributed (Future)

```python
from mycelium import RedisEventBus

bus = RedisEventBus(redis_url="redis://localhost:6379")
await bus.connect()

# Same subscribe/publish API as LocalEventBus
await bus.subscribe(EventType.NUTRIENT_OFFER, handler)
await bus.publish(EventType.NUTRIENT_REQUEST, {"from": "api", "need": "auth"})

await bus.disconnect()
```

**Note:** `RedisEventBus` requires a running Redis instance and the `aioredis` package.

---

## Event Types

The bus supports these signal types (see [NUTRIENTS.md §1](../../NUTRIENTS.md#1-event-log---the-canonical-telemetry-wire) for the full event schema):

| EventType | Purpose |
|-----------|---------|
| `HEALTH_PULSE` | Periodic agent health broadcast |
| `NUTRIENT_OFFER` | Agent offers capabilities to the network |
| `NUTRIENT_REQUEST` | Agent requests help from the network |
| `CONTRACT_UPDATE` | Contract was absorbed or modified |
| `FRUIT_READY` | Agent has produced deliverables |
| `MERGE_SIGNAL` | Coordination signal for merge-order |

---

## Health Monitoring

The `HealthPulseEmitter` broadcasts agent state at regular intervals:

```python
from mycelium import HealthPulseEmitter

emitter = HealthPulseEmitter(
    agent=my_agent,
    event_bus=bus,
    interval_seconds=10.0,
)
await emitter.start()

# Logs: [AGENT-my-agent:my-scope] GROWING | available for flow | network healthy

await emitter.stop()
```

---

## Nutrient Flow Matching

When agents need to redistribute work, `NutrientMatcher` finds the best target:

```python
from mycelium import NutrientMatcher

matcher = NutrientMatcher(merge_order=["auth", "api", "frontend"])

best_match = matcher.match(
    agent_capabilities={"python", "jwt"},
    agent_id="auth",
    pending_requests=[
        {"from": "api", "needs": ["jwt"]},
        {"from": "frontend", "needs": ["react"]},
    ],
)
# Returns the request from "api" since auth can fulfill "jwt"
```

---

## Integration with CLI Orchestration

When the TypeScript CLI runs `mycelium cultivate`, it spawns Claude Agent SDK sessions that may call into Python services. Your embedded agent can participate by:

1. **Exposing an HTTP endpoint** that the CLI-spawned agent calls
2. **Writing to the shared event log** at `.mycelium/events/<run_id>.jsonl`
3. **Reading `sporenet/state.json`** to understand organism state

The event log format is defined in [NUTRIENTS.md §1](../../NUTRIENTS.md#1-event-log---the-canonical-telemetry-wire).

---

## What NOT to Use This For

Do **not** use Python embedding if:

- You want to orchestrate a full cultivation run — use `mycelium cultivate`
- You need the DDP pipeline stages — use the CLI + GitHub Actions
- You need 50+ concurrent Claude sessions — the CLI handles this
- You want the dashboard at `/` — run `mycelium sporenet serve`

The Python SDK is a **participant**, not a **coordinator**. The CLI is the coordinator.

---

## API Reference

### BaseAgent

| Method | Purpose |
|--------|---------|
| `sense()` | Probe environment, return state dict |
| `execute()` | Primary work, transition through GROWING |
| `flow(target)` | Offer capabilities to another agent |
| `signal()` | Health pulse, return status dict |
| `absorb(contract)` | Accept a contract assignment |
| `fruit()` | Produce deliverables (FRUITING state only) |
| `germinate()` | Start lifecycle from DORMANT |

### Orchestrator

| Method | Purpose |
|--------|---------|
| `cultivate()` | Distribute contracts, germinate agents |
| `observe()` | Snapshot organism health |
| `resolve(conflict)` | Mediate territorial conflicts |
| `harvest()` | Collect fruits from FRUITING agents |
| `shutdown()` | Enter dormancy, stop monitoring |

### EventBus (LocalEventBus / RedisEventBus)

| Method | Purpose |
|--------|---------|
| `start()` / `connect()` | Initialize the bus |
| `subscribe(type, handler)` | Register event handler |
| `publish(type, payload)` | Emit event to network |
| `unsubscribe(type, handler)` | Remove handler |
| `stop()` / `disconnect()` | Shutdown the bus |

---

## File Structure

```
impl/python/
├── pyproject.toml          # Package metadata, dependencies
├── README.md               # This guide
└── mycelium/
    ├── __init__.py         # Public exports
    ├── agent.py            # BaseAgent, AgentState, lifecycle
    ├── bus.py              # LocalEventBus, RedisEventBus
    ├── contracts.py        # Contract loading and validation
    ├── flow.py             # NutrientMatcher
    ├── health.py           # HealthPulseEmitter
    ├── orchestrator.py     # Orchestrator (in-process coordination)
    └── adapters/
        └── claude_code.py  # Claude Code adapter for CLI integration
```

---

## Related Documentation

- [Main README](../../README.md) — Framework overview
- [DEVELOPER_GUIDE.md](../../DEVELOPER_GUIDE.md) — Full developer reference
- [NUTRIENTS.md](../../NUTRIENTS.md) — Frozen contracts and event schemas
- [Java Embedding Guide](../java/README.md) — Spring Boot embedding

---

*The network provides.* 🍄
