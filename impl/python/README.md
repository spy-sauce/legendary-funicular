# Mycelium Framework — VibeSpace LLC — The network provides.

## Inject Mycelium into any Python project in under 5 minutes

### 1. Install

```bash
pip install -e path/to/impl/python
```

Or add to your `requirements.txt`:

```
mycelium-framework @ file:///path/to/impl/python
```

### 2. Define an agent

```python
from mycelium import BaseAgent, AgentState
from typing import Any


class AuthAgent(BaseAgent):
    """A hypha responsible for the authentication substrate."""

    async def sense(self) -> dict[str, Any]:
        return {"contracts_absorbed": len(self._absorbed_contracts)}

    async def execute(self) -> Any:
        self._transition(AgentState.GROWING)
        # ... do metabolic work ...
        self._transition(AgentState.FRUITING)
        return {"status": "growth complete"}

    async def flow(self, target_agent: BaseAgent) -> dict[str, Any]:
        self._transition(AgentState.FLOWING)
        return {"flowed_to": target_agent.id, "capabilities": self.capabilities}

    async def signal(self) -> dict[str, Any]:
        return {"health": "healthy", "completed": 3, "total": 5, "percentage": 60.0}

    async def absorb(self, contract: dict[str, Any]) -> None:
        self._absorbed_contracts.append(contract)

    async def fruit(self) -> Any:
        return {"artifact": "auth-module", "files": ["auth.py", "tokens.py"]}
```

### 3. Run the organism

```python
import asyncio
from mycelium import Orchestrator, LocalEventBus, load_contracts_from_directory

async def main():
    bus = LocalEventBus()
    await bus.start()

    auth = AuthAgent(agent_id="auth", scope="authentication", capabilities=["python", "jwt"])
    api = ApiAgent(agent_id="api", scope="endpoints", capabilities=["python", "rest"])

    contracts = load_contracts_from_directory("spec/contracts/")

    organism = Orchestrator(
        agents=[auth, api],
        contracts=contracts,
        merge_order=["auth", "api"],
        event_bus=bus,
    )

    await organism.cultivate()
    # ... agents grow and flow nutrients ...
    fruits = await organism.harvest()
    await organism.shutdown()
    await bus.stop()

asyncio.run(main())
```

### 4. Monitor health

```python
from mycelium import HealthPulseEmitter

emitter = HealthPulseEmitter(agent=auth, event_bus=bus, interval_seconds=10.0)
await emitter.start()
# Logs: [AGENT-auth:authentication] 🌿 Building login flow | available for flow | network healthy
```

### 5. Match nutrient flow

```python
from mycelium import NutrientMatcher

matcher = NutrientMatcher(merge_order=["auth", "api", "frontend"])
best = matcher.match(
    agent_capabilities={"python", "jwt"},
    agent_id="auth",
    pending_requests=[...],
)
```

The network provides.
