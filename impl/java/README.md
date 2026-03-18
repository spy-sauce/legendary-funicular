<!-- Mycelium Framework — VibeSpace LLC — The network provides. -->

# Mycelium Framework — Java/Spring Boot

Agentic execution framework for coordinating autonomous agent nodes through a biological signaling model.

## Quick Start (< 5 minutes)

### 1. Add the dependency

```xml
<dependency>
    <groupId>xyz.vibespace</groupId>
    <artifactId>mycelium-framework</artifactId>
    <version>1.0.0-SNAPSHOT</version>
</dependency>
```

### 2. Define an agent

```java
@MyceliumNode(id = "auth-agent", scope = "authentication",
    capabilities = {"java", "spring-security", "jwt"})
public class AuthAgent extends MyceliumAgent {

    public AuthAgent() {
        super("auth-agent", "authentication",
              List.of("java", "spring-security", "jwt"));
    }

    @Override
    protected void doExecute() {
        // Your domain work here
    }

    @Override
    protected void doFlow(String targetHyphalId) {
        // Help another agent when your work is done
    }

    @Override
    protected List<String> doFruit() {
        // Return deliverable identifiers
        return List.of("auth-module-v1.jar");
    }
}
```

### 3. Wire the orchestrator

```java
@Configuration
public class MyceliumConfig {

    @Bean
    public NutrientFlowService nutrientPump() {
        return new NutrientFlowService(List.of("auth-agent", "data-agent"));
    }

    @Bean
    public MyceliumOrchestrator orchestrator(MyceliumEventBus bus,
                                             NutrientFlowService pump) {
        return new MyceliumOrchestrator(bus, pump);
    }
}
```

### 4. Cultivate

```java
@PostConstruct
public void start() {
    orchestrator.addAgent(authAgent);
    orchestrator.addAgent(dataAgent);
    orchestrator.cultivate();
}
```

### 5. Observe and harvest

```java
OrganismHealth health = orchestrator.observe();
if (health.healthScore() >= 0.8) {
    List<String> deliverables = orchestrator.harvest();
}
```

## Event Bus

Two implementations ship out of the box:

- **LocalEventBus** — in-process, Spring ApplicationEvents. Default for single-JVM.
- **RedisEventBus** — distributed via Redis pub/sub. Add `spring-boot-starter-data-redis` and configure connection.

## Contracts

Place contract JSON files in your resources and load them:

```java
MyceliumContract contract = MyceliumContract.loadFrom(
    getClass().getResourceAsStream("/contracts/user-entity.json"));
orchestrator.addContract(contract);
```

Contracts are validated against `contract.schema.json` and frozen before execution begins.

## The network provides.
