<!-- Mycelium Framework — VibeSpace LLC — The network provides. -->

# Mycelium Java/Spring Boot Embedding Guide

> **This is an embedding library, not an orchestration replacement.**

The Java implementation lets you embed Mycelium agent nodes inside an existing Spring Boot service. These nodes participate in a larger organism that is still orchestrated by the TypeScript CLI (`mycelium cultivate`).

**Use this library when:**
- You have an existing Spring Boot service that should participate as a specialist node
- Your domain logic is already in Java and you want it to join a polyglot organism
- You need JVM-side agents to communicate via the Mycelium event bus

**Do NOT use this library when:**
- You want to orchestrate an entire organism from scratch — use the [CLI](../../cli/) instead
- You're building a new project with no existing Java code — start with the CLI
- You need to run `cultivate`, `harvest`, or `plant` commands — those are CLI-only

For CLI documentation, see [DEVELOPER_GUIDE.md](../../DEVELOPER_GUIDE.md). For the Python equivalent, see [impl/python/README.md](../python/README.md).

---

## Maven Coordinates

```xml
<dependency>
    <groupId>xyz.vibespace</groupId>
    <artifactId>mycelium-framework</artifactId>
    <version>1.0.0-SNAPSHOT</version>
</dependency>
```

**Requirements:**
- Java 17+
- Spring Boot 3.2+

---

## Quick Start (< 5 minutes)

### 1. Define an Agent

Create a class that extends `MyceliumAgent` and annotate it with `@MyceliumNode`:

```java
import xyz.vibespace.mycelium.MyceliumAgent;
import xyz.vibespace.mycelium.annotation.MyceliumNode;
import java.util.List;

@MyceliumNode(
    id = "payment-processor",
    scope = "payment-domain",
    capabilities = {"java", "stripe-api", "idempotency"}
)
public class PaymentAgent extends MyceliumAgent {

    public PaymentAgent() {
        super("payment-processor", "payment-domain",
              List.of("java", "stripe-api", "idempotency"));
    }

    @Override
    protected void doExecute() {
        // Your domain work here — grow in your lane
        // This is the GROWING phase
        processPaymentQueue();
    }

    @Override
    protected void doFlow(String targetHyphalId) {
        // Help another agent when your work is done
        // This is the FLOWING phase — be the nutrient
        sharePaymentContext(targetHyphalId);
    }

    @Override
    protected List<String> doFruit() {
        // Return deliverable identifiers
        // This is the FRUITING phase
        return List.of("payment-service-v2.jar", "idempotency-keys.json");
    }

    // Optional lifecycle hooks
    @Override
    protected void onGerminate() {
        // Called when the spore starts — load config, connect to Stripe
    }

    @Override
    protected void onDormant() {
        // Called when entering dormancy — release resources
    }
}
```

### 2. Wire the Orchestrator

The `MyceliumOrchestrator` coordinates JVM-side agents. It does **not** replace `mycelium cultivate` — it's an in-process coordinator for agents that participate in a larger organism.

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import xyz.vibespace.mycelium.*;

@Configuration
public class MyceliumConfig {

    @Bean
    public NutrientFlowService nutrientPump() {
        // Define the merge order for conflict resolution
        return new NutrientFlowService(List.of(
            "payment-processor",
            "notification-sender",
            "audit-logger"
        ));
    }

    @Bean
    public MyceliumOrchestrator orchestrator(
            MyceliumEventBus bus,
            NutrientFlowService pump) {
        return new MyceliumOrchestrator(bus, pump);
    }
}
```

### 3. Cultivate the In-Process Organism

```java
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;
import xyz.vibespace.mycelium.*;

@Service
public class OrganismLifecycle {

    private final MyceliumOrchestrator orchestrator;
    private final PaymentAgent paymentAgent;
    private final NotificationAgent notificationAgent;

    public OrganismLifecycle(
            MyceliumOrchestrator orchestrator,
            PaymentAgent paymentAgent,
            NotificationAgent notificationAgent) {
        this.orchestrator = orchestrator;
        this.paymentAgent = paymentAgent;
        this.notificationAgent = notificationAgent;
    }

    @PostConstruct
    public void start() {
        // Add agents to the colony
        orchestrator.addAgent(paymentAgent);
        orchestrator.addAgent(notificationAgent);

        // Optional: load and add contracts
        MyceliumContract paymentContract = MyceliumContract.loadFrom(
            getClass().getResourceAsStream("/contracts/payment-entity.json")
        );
        orchestrator.addContract(paymentContract);

        // Set harvest threshold (default is 0.8)
        orchestrator.setHarvestThreshold(0.85);

        // Cultivate — freezes contracts, wires agents, starts growth cycle
        orchestrator.cultivate();
    }
}
```

### 4. Observe and Harvest

```java
// Check organism health without interfering
MyceliumOrchestrator.OrganismHealth health = orchestrator.observe();

System.out.printf("Vitality: %.2f, Blocked: %d, Hungry: %d%n",
    health.healthScore(),
    health.blockedAgents().size(),
    health.unmatchedRequests().size()
);

// Harvest when ready (throws if below threshold)
if (health.healthScore() >= 0.85) {
    List<String> deliverables = orchestrator.harvest();
    deliverables.forEach(d -> System.out.println("Collected: " + d));
}
```

---

## Agent Lifecycle

Each agent progresses through these states:

```
DORMANT -> GERMINATING -> GROWING -> FLOWING -> FRUITING -> DORMANT
                            |           |
                            +-----------+  (can flow while growing)
```

| State | Description | Vitality Score |
|-------|-------------|----------------|
| `DORMANT` | Idle, waiting for signal | 0.3 |
| `GERMINATING` | Starting up, loading contracts | 0.5 |
| `GROWING` | Actively executing primary work | 0.8 |
| `FLOWING` | Helping other agents | 0.9 |
| `FRUITING` | Producing deliverables | 1.0 |

The orchestrator calculates organism vitality as the weighted average of all agent states. Harvest is only permitted when vitality exceeds the threshold.

---

## Event Bus

Two implementations ship out of the box:

### LocalEventBus (Default)

In-process, uses Spring `ApplicationEvents`. Best for single-JVM deployments:

```java
@Bean
public MyceliumEventBus eventBus(
        ApplicationEventPublisher publisher,
        ObjectMapper mapper) {
    return new LocalEventBus(publisher, mapper);
}
```

### RedisEventBus (Distributed)

For multi-JVM organisms. Add the dependency:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

Configure in `application.yml`:

```yaml
spring:
  data:
    redis:
      host: localhost
      port: 6379
```

Wire the bus:

```java
@Bean
public MyceliumEventBus eventBus(
        StringRedisTemplate redis,
        RedisMessageListenerContainer container,
        ObjectMapper mapper) {
    return new RedisEventBus(redis, container, mapper);
}
```

Agents on different JVMs will see each other's health pulses and can flow nutrients across process boundaries.

---

## Contracts

Contracts are frozen JSON schemas that define the chemical signals agents share. Load them from resources:

```java
MyceliumContract contract = MyceliumContract.loadFrom(
    getClass().getResourceAsStream("/contracts/user-entity.json")
);
orchestrator.addContract(contract);
```

Contracts are validated against the schema and frozen before execution begins. Once frozen, they cannot be modified — this is the "chemical vocabulary" all agents share.

For the frozen contract schema, see [NUTRIENTS.md](../../NUTRIENTS.md).

---

## Health Pulses

Agents broadcast health pulses to signal their state:

```java
// Inside your agent
HealthPulse pulse = buildPulse(
    new HealthPulse.Progress(3, 10, 30.0f),  // completed, total, percentage
    "Processing batch 3 of 10"
);
signal(pulse);
```

The orchestrator listens for these pulses to maintain a real-time view of organism health.

---

## Embedding vs Orchestration

| Capability | Java Embedding | CLI Orchestration |
|------------|----------------|-------------------|
| Define agents | Yes | Yes (via YAML) |
| Run `cultivate` | In-process only | Full organism |
| Run `harvest` | In-process only | Full organism |
| Spawn Claude sessions | No | Yes |
| DDP stage pipeline | No | Yes (via CI/CD) |
| Multi-language organism | Participates | Orchestrates |
| Contract freeze | Manual | Automatic |

**Key insight:** The Java `MyceliumOrchestrator` is a **participant coordinator**, not a **system orchestrator**. It manages JVM-side agents that form one part of a larger organism. The CLI remains the source of truth for:

- Spawning Claude Agent SDK sessions
- Managing the commit queue
- Running the DDP stage pipeline
- Cross-biome merge ordering

If your Java service is one node in a larger cultivation, the CLI calls `mycelium cultivate`, which spawns leaves. Your Java agents participate via the event bus (Redis for distributed, or direct calls for co-located).

---

## Integration with CLI Cultivation

When running under `mycelium cultivate`, your Spring Boot service should:

1. **Connect to the shared event bus** (typically Redis in CI/CD)
2. **Listen for cultivation signals** to know when to germinate
3. **Emit health pulses** so the CLI can track your vitality
4. **Emit fruit-ready signals** when your agents complete

Example integration:

```java
@EventListener
public void onCultivationStart(CultivationStartedEvent event) {
    // The CLI has started cultivation — begin local growth
    orchestrator.cultivate();
}

@EventListener
public void onHarvestRequest(HarvestRequestedEvent event) {
    // The CLI is harvesting — report our deliverables
    List<String> fruits = orchestrator.harvest();
    eventBus.publish(EventType.FRUIT_READY, Map.of(
        "agentId", "payment-processor",
        "fruits", fruits
    ));
}
```

---

## Project Structure

```
impl/java/
├── pom.xml
├── README.md                           # This file
└── src/main/java/xyz/vibespace/mycelium/
    ├── MyceliumAgent.java              # Abstract agent base class
    ├── MyceliumOrchestrator.java       # In-process coordinator
    ├── MyceliumContract.java           # Frozen contract holder
    ├── MyceliumEventBus.java           # Event bus interface
    ├── LocalEventBus.java              # Spring ApplicationEvents impl
    ├── RedisEventBus.java              # Redis pub/sub impl
    ├── NutrientFlowService.java        # Merge-order-aware flow router
    ├── HealthPulseService.java         # Pulse broadcasting
    ├── annotation/
    │   └── MyceliumNode.java           # @MyceliumNode annotation
    └── model/
        ├── AgentState.java             # Lifecycle states
        ├── HealthPulse.java            # Health signal payload
        ├── NutrientOffer.java          # Flow offer payload
        ├── NutrientRequest.java        # Flow request payload
        └── Urgency.java                # Request priority
```

---

## Further Reading

- [Main README](../../README.md) — Project overview
- [DEVELOPER_GUIDE.md](../../DEVELOPER_GUIDE.md) — Full CLI reference
- [NUTRIENTS.md](../../NUTRIENTS.md) — Frozen contracts for this organism
- [Python Embedding Guide](../python/README.md) — Asyncio equivalent
- [Mycelium Spec](../../spec/mycelium-spec.md) — Canonical specification

---

The network provides.
