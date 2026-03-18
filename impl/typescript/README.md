# @vibespace/mycelium

Agentic execution framework for TypeScript/Node. The network provides.

## Inject into your project in under 5 minutes

### 1. Install

```bash
npm install @vibespace/mycelium
# or
pnpm add @vibespace/mycelium
```

### 2. Define a colony contract

Create `mycelium.contract.json` in your project root:

```json
{
  "name": "my-colony",
  "version": "1.0.0",
  "harvestThreshold": 0.8,
  "agents": [
    {
      "id": "gatherer",
      "scope": "data-ingest",
      "lane": 0,
      "capabilities": ["fetch", "parse"],
      "dependencies": []
    },
    {
      "id": "transformer",
      "scope": "processing",
      "lane": 1,
      "capabilities": ["transform", "validate"],
      "dependencies": ["gatherer"]
    },
    {
      "id": "emitter",
      "scope": "output",
      "lane": 2,
      "capabilities": ["serialize", "publish"],
      "dependencies": ["transformer"]
    }
  ]
}
```

### 3. Implement your agents

```typescript
import { Agent, AgentState } from "@vibespace/mycelium";

class GathererAgent extends Agent<string, Record<string, unknown>> {
  protected async onExecute(input: string): Promise<void> {
    // Absorb nutrients from the substrate (your data source).
    const data = await fetch(input).then((r) => r.json());
    this.signal("substrate-ready", data);
  }

  protected async onFlow(targetId: string): Promise<void> {
    // Prepare nutrients for translocation to the next hypha.
    console.log(`Streaming nutrients toward ${targetId}`);
  }

  protected async onFruit(): Promise<Record<string, unknown>> {
    // Produce the fruiting body — your output artifact.
    return { gathered: true };
  }
}
```

### 4. Wire up the orchestrator

```typescript
import {
  Orchestrator,
  LocalEventBus,
  loadContract,
} from "@vibespace/mycelium";

const contract = await loadContract("./mycelium.contract.json");
const bus = new LocalEventBus();

const orchestrator = new Orchestrator({ contract, bus });

// Register your agent instances.
orchestrator.register(
  new GathererAgent({
    id: "gatherer",
    scope: "data-ingest",
    lane: 0,
    capabilities: ["fetch", "parse"],
  }),
);

// Cultivate the colony.
await orchestrator.cultivate();

// Observe health at any time.
console.log(orchestrator.formatHealth());

// Resolve nutrient flows.
const matches = orchestrator.resolve();

// Harvest when ready.
const harvested = await orchestrator.harvest();
```

### 5. Scale with Redis (optional)

Swap `LocalEventBus` for `RedisEventBus` to distribute your colony across multiple processes or hosts:

```typescript
import { RedisEventBus } from "@vibespace/mycelium";

const bus = new RedisEventBus({
  redisUrl: "redis://localhost:6379",
  channelPrefix: "mycelium:prod:",
});
```

No other code changes required. The network provides.
