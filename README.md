# 🍄 Mycelium

**A language-agnostic agentic execution framework.**

> Software systems should behave like living organisms, not org charts.

Mycelium is not a library. It's an ideology encoded as infrastructure. Agents are nodes in a living network — they sense what's around them, own their lane, and flow nutrients to wherever the network needs them.

Created by **Space Cowboy #9** — VibeSpace LLC

---

## Quick Start (< 5 minutes)

### Python
```bash
cd impl/python && pip install -e .
```
```python
from mycelium import MyceliumAgent, AgentState, MyceliumOrchestrator

class AuthAgent(MyceliumAgent):
    async def on_execute(self):
        # Your auth logic here — grow in your lane
        pass

    async def on_flow(self, target_id: str):
        # Help another agent — be the nutrient
        pass

    async def on_fruit(self):
        # Produce your deliverables
        return [{"type": "auth-service", "status": "ready"}]

# Cultivate the organism
orchestrator = MyceliumOrchestrator()
orchestrator.add_agent(AuthAgent(id="auth", scope="Authentication"))
await orchestrator.cultivate()
```

### Java (Spring Boot)
```xml
<dependency>
    <groupId>xyz.vibespace</groupId>
    <artifactId>mycelium-framework</artifactId>
    <version>1.0.0</version>
</dependency>
```
```java
@MyceliumNode(id = "auth", scope = "Authentication")
public class AuthAgent extends MyceliumAgent {
    @Override
    protected void doExecute() {
        // Grow in your lane
    }

    @Override
    protected void doFlow(String targetAgentId) {
        // Flow nutrients to where they're needed
    }

    @Override
    protected List<Deliverable> doFruit() {
        // Produce deliverables
        return List.of(new Deliverable("auth-service", "ready"));
    }
}
```

### TypeScript
```bash
npm install @vibespace/mycelium
```
```typescript
import { MyceliumAgent, AgentState, MyceliumOrchestrator } from '@vibespace/mycelium';

class AuthAgent extends MyceliumAgent {
  async onExecute(): Promise<void> {
    // Grow in your lane
  }

  async onFlow(targetId: string): Promise<void> {
    // Be the nutrient
  }

  async onFruit(): Promise<Deliverable[]> {
    return [{ type: 'auth-service', status: 'ready' }];
  }
}

const orchestrator = new MyceliumOrchestrator();
orchestrator.addAgent(new AuthAgent({ id: 'auth', scope: 'Authentication' }));
await orchestrator.cultivate();
```

---

## CLI

```bash
npm install -g @vibespace/mycelium-cli

mycelium init                    # Scaffold a new organism
mycelium agent create auth       # Grow a new agent node
mycelium contracts freeze        # Lock chemical signals before the sprint
mycelium cultivate               # Start the organism
mycelium network status          # Health check — see every node's state
mycelium network visualize       # ASCII art of the living network
mycelium flow                    # Trigger nutrient redistribution
mycelium harvest                 # Collect all deliverables
```

---

## Architecture

```
                    ┌─────────────────┐
                    │   Orchestrator   │  ← Root node (cultivates, doesn't micromanage)
                    │   (Root Node)    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │  Agent A   │ │  Agent B   │ │  Agent C   │
        │  🌿 GROWING │ │  🔄 FLOWING │ │  ⚠️ BLOCKED │
        └─────┬─────┘ └──────┬─────┘ └───────────┘
              │               │            ↑
              │               └────────────┘
              │            nutrient flow
              │         (B helps unblock C)
              │
        ┌─────┴─────┐
        │ Contracts  │  ← Chemical signals (frozen JSON schemas)
        │ 📜 FROZEN   │
        └───────────┘
```

### Agent Lifecycle

```
🌱 GERMINATING → 🌿 GROWING → 🔄 FLOWING → 🍄 FRUITING → 💤 DORMANT
                                                              ↓
                                                    (back to 🌱)
```

### The Five Laws

1. **Sense Before You Act** — Context is oxygen
2. **Flow Over Ownership** — The organism > your lane
3. **Contracts Are Chemical Signals** — Freeze them. Respect them.
4. **Health Is Collective** — Broadcast your state. Help without being asked.
5. **Ship The Organism, Not The Task** — One product, not six tasks

---

## Project Structure

```
mycelium/
├── MANIFESTO.md              # The philosophy
├── spec/
│   ├── mycelium-spec.md      # Canonical specification
│   └── contracts/             # JSON Schema chemical signals
├── impl/
│   ├── java/                  # Spring Boot implementation
│   ├── python/                # Python (asyncio) implementation
│   └── typescript/            # TypeScript/Node implementation
├── cli/                       # Universal CLI tool
├── templates/                 # Organism configuration templates
│   ├── bloom-7day.yaml        # 7-day build sprint example
│   └── generic-sprint.yaml    # Blank template
└── examples/
    └── bloom/                 # Reference execution plan
```

---

## How It Works

1. **Define contracts** — The chemical signals your agents share
2. **Freeze contracts** — Lock them before execution begins
3. **Create agents** — Each owns a scope and has capabilities
4. **Cultivate** — The orchestrator distributes contracts and starts the network
5. **Grow** — Agents execute their primary work
6. **Flow** — When an agent finishes, it flows nutrients to help others
7. **Harvest** — When the organism is healthy, collect all deliverables

The magic is in step 6: **no agent clocks out**. Resources flow to where they create the most value. The network self-heals. The organism ships as one.

---

## Philosophy

Read the full [Manifesto](./MANIFESTO.md).

> We are not an org chart. We are an organism.

---

## License

**Proprietary — All Rights Reserved.**
Copyright (c) 2026 VibeSpace LLC. Built in partnership with Anthropic.

See [LICENSE](./LICENSE) for full terms.

*The network provides — but only with permission.* 🍄
