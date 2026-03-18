// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium;

import xyz.vibespace.mycelium.model.*;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.logging.Logger;
import java.util.stream.Collectors;

/**
 * The root node of the mycelium network — the orchestrator.
 *
 * Field note: In a forest, the oldest tree (the "mother tree") connects to
 * hundreds of younger trees through mycorrhizal networks, directing nutrient
 * flow where it's most needed. This class is our mother tree. It doesn't
 * micromanage individual hyphae — it cultivates the conditions for growth.
 */
public class MyceliumOrchestrator {

    private static final Logger fieldLog = Logger.getLogger(MyceliumOrchestrator.class.getName());

    // -- Colony state --
    private final List<MyceliumAgent> colony = new CopyOnWriteArrayList<>();
    private volatile List<MyceliumContract> chemicalSignals = new CopyOnWriteArrayList<>();
    private final List<String> mergeSequence = new CopyOnWriteArrayList<>();

    /** Minimum organism health required before harvest. Default 0.8 — the spec's threshold. */
    private volatile double harvestThreshold = 0.8;

    private final MyceliumEventBus signalNetwork;
    private final NutrientFlowService nutrientPump;

    public MyceliumOrchestrator(MyceliumEventBus signalNetwork, NutrientFlowService nutrientPump) {
        this.signalNetwork = signalNetwork;
        this.nutrientPump = nutrientPump;
    }

    /**
     * Cultivate the organism — initialize the network for a growth cycle.
     *
     * Distributes contracts to all agents, sets initial states to GERMINATING,
     * wires up health pulse listeners, and kicks off the growth cycle.
     *
     * Field note: Like preparing a petri dish — sterilize, inoculate, incubate.
     */
    public void cultivate() {
        fieldLog.info(() -> String.format(
                "Cultivating organism: %d agents, %d contracts, merge depth %d",
                colony.size(), chemicalSignals.size(), mergeSequence.size()));

        // Freeze all contracts before distributing — crystallize the chemical vocabulary
        chemicalSignals = MyceliumContract.freezeContracts(new ArrayList<>(chemicalSignals));

        // Wire each agent to the signaling network and feed it contracts
        for (MyceliumAgent hypha : colony) {
            hypha.setSignalNetwork(signalNetwork);

            for (MyceliumContract signal : chemicalSignals) {
                hypha.absorb(signal);
            }

            // All spores begin by germinating
            hypha.germinate();
        }

        // Listen for health pulses — the mother tree monitors the forest
        signalNetwork.subscribe(
                MyceliumEventBus.EventType.HEALTH_PULSE,
                HealthPulse.class,
                this::onHealthPulse
        );

        // Listen for fruit signals — harvest readiness
        signalNetwork.subscribe(
                MyceliumEventBus.EventType.FRUIT_READY,
                Map.class,
                this::onFruitReady
        );

        fieldLog.info("Organism cultivated. Growth cycle beginning.");
    }

    /**
     * Observe organism health without micromanaging.
     *
     * Returns an aggregate health snapshot: agent states, blocked nodes,
     * unmatched nutrient requests, and an overall vitality score.
     *
     * Field note: The mycologist peers through the microscope but doesn't
     * poke the hyphae. Observation only.
     */
    public OrganismHealth observe() {
        Map<String, AgentState> agentVitals = colony.stream()
                .collect(Collectors.toMap(MyceliumAgent::id, MyceliumAgent::state));

        List<String> blockedHyphae = colony.stream()
                .filter(agent -> !agent.dependencies().isEmpty())
                .filter(agent -> agent.dependencies().stream()
                        .anyMatch(depId -> colony.stream()
                                .filter(a -> a.id().equals(depId))
                                .anyMatch(a -> a.state() != AgentState.FRUITING
                                        && a.state() != AgentState.DORMANT)))
                .map(MyceliumAgent::id)
                .toList();

        // Calculate organism vitality score (0.0 - 1.0)
        double vitalityScore = calculateVitality(agentVitals);

        // Identify unmatched nutrient requests — hungry nodes
        List<String> hungryNodes = colony.stream()
                .filter(agent -> agent.state() == AgentState.GROWING)
                .filter(agent -> !agent.dependencies().isEmpty())
                .map(agent -> agent.id() + " needs: " + String.join(", ", agent.dependencies()))
                .toList();

        fieldLog.info(() -> String.format(
                "Organism observation: vitality=%.2f, blocked=%d, hungry=%d",
                vitalityScore, blockedHyphae.size(), hungryNodes.size()));

        return new OrganismHealth(agentVitals, blockedHyphae, hungryNodes, vitalityScore);
    }

    /**
     * Resolve a conflict in the organism — the mother tree redirects resources.
     *
     * @param conflict description of the blockage or conflict
     * @return resolution action taken
     */
    public Resolution resolve(Conflict conflict) {
        fieldLog.info(() -> String.format(
                "Resolving conflict: %s (type: %s)", conflict.description(), conflict.type()));

        return switch (conflict.type()) {
            case BLOCKED_AGENT -> resolveBlockedAgent(conflict);
            case MERGE_CONFLICT -> resolveMergeConflict(conflict);
            case NUTRIENT_STARVATION -> resolveStarvation(conflict);
        };
    }

    /**
     * Harvest — collect all FRUIT_READY deliverables from the organism.
     *
     * Only callable when the organism health score exceeds the harvest threshold.
     * Premature harvest kills the organism.
     *
     * @return list of all deliverables from fruiting agents
     * @throws PrematureHarvestException if the organism isn't ready
     */
    public List<String> harvest() {
        OrganismHealth health = observe();

        if (health.healthScore() < harvestThreshold) {
            throw new PrematureHarvestException(String.format(
                    "Organism vitality %.2f is below harvest threshold %.2f — "
                    + "premature harvest would kill the network.",
                    health.healthScore(), harvestThreshold));
        }

        fieldLog.info(() -> String.format(
                "Harvesting organism (vitality: %.2f)", health.healthScore()));

        List<String> allFruit = new ArrayList<>();
        for (MyceliumAgent hypha : colony) {
            if (hypha.state() == AgentState.GROWING || hypha.state() == AgentState.FLOWING) {
                List<String> sporocarps = hypha.fruit();
                allFruit.addAll(sporocarps);
            }
        }

        fieldLog.info(() -> String.format(
                "Harvest complete: %d deliverables collected", allFruit.size()));
        return Collections.unmodifiableList(allFruit);
    }

    // -- Colony management --

    public void addAgent(MyceliumAgent hypha) {
        colony.add(hypha);
    }

    public void addContract(MyceliumContract signal) {
        chemicalSignals.add(signal);
    }

    public void setMergeOrder(List<String> sequence) {
        mergeSequence.clear();
        mergeSequence.addAll(sequence);
    }

    public void setHarvestThreshold(double threshold) {
        this.harvestThreshold = threshold;
    }

    public List<MyceliumAgent> agents() {
        return Collections.unmodifiableList(colony);
    }

    public List<MyceliumContract> contracts() {
        return Collections.unmodifiableList(chemicalSignals);
    }

    public List<String> mergeOrder() {
        return Collections.unmodifiableList(mergeSequence);
    }

    // -- Internal signal handlers --

    private void onHealthPulse(HealthPulse pulse) {
        fieldLog.fine(() -> pulse.toHumanReadable());
    }

    @SuppressWarnings("unchecked")
    private void onFruitReady(Map<?, ?> fruitSignal) {
        String agentId = String.valueOf(fruitSignal.get("agentId"));
        fieldLog.info(() -> String.format("Fruit ready signal from agent: %s", agentId));
    }

    // -- Vitality calculation --

    /**
     * Calculate organism vitality score.
     *
     * Field note: A healthy organism has most nodes actively growing or fruiting.
     * Dormant nodes are neutral. Blocked nodes drag the score down.
     * The formula weights each state by its contribution to organism fitness.
     */
    private double calculateVitality(Map<String, AgentState> agentVitals) {
        if (agentVitals.isEmpty()) return 0.0;

        double totalFitness = 0.0;
        for (AgentState state : agentVitals.values()) {
            totalFitness += switch (state) {
                case FRUITING -> 1.0;      // producing — peak fitness
                case GROWING -> 0.8;       // actively working — healthy
                case FLOWING -> 0.9;       // helping others — altruistic fitness
                case GERMINATING -> 0.5;   // starting up — potential
                case DORMANT -> 0.3;       // idle — low but not zero
            };
        }

        return totalFitness / agentVitals.size();
    }

    // -- Conflict resolution strategies --

    private Resolution resolveBlockedAgent(Conflict conflict) {
        // Find a FLOWING agent with matching capabilities and redirect
        Optional<MyceliumAgent> rescuer = colony.stream()
                .filter(a -> a.state() == AgentState.FLOWING || a.state() == AgentState.DORMANT)
                .filter(a -> !Collections.disjoint(a.capabilities(), conflict.requiredCapabilities()))
                .findFirst();

        if (rescuer.isPresent()) {
            rescuer.get().flow(conflict.targetAgentId());
            return new Resolution(Resolution.Type.NUTRIENT_REDIRECTED,
                    String.format("Redirected %s to assist %s",
                            rescuer.get().id(), conflict.targetAgentId()));
        }

        return new Resolution(Resolution.Type.UNRESOLVED,
                "No available agents with matching capabilities");
    }

    private Resolution resolveMergeConflict(Conflict conflict) {
        // Merge conflicts are resolved by merge order — earlier in sequence wins
        return new Resolution(Resolution.Type.MERGE_ORDER_APPLIED,
                String.format("Merge order applied: %s", mergeSequence));
    }

    private Resolution resolveStarvation(Conflict conflict) {
        // Force the most idle agent to flow nutrients
        Optional<MyceliumAgent> idleNode = colony.stream()
                .filter(a -> a.state() == AgentState.DORMANT)
                .findFirst();

        if (idleNode.isPresent()) {
            idleNode.get().flow(conflict.targetAgentId());
            return new Resolution(Resolution.Type.NUTRIENT_REDIRECTED,
                    String.format("Woke dormant agent %s to feed %s",
                            idleNode.get().id(), conflict.targetAgentId()));
        }

        return new Resolution(Resolution.Type.UNRESOLVED,
                "All agents are occupied — organism under maximum load");
    }

    // -- Inner types --

    /** Aggregate health of the organism — the mycologist's lab report. */
    public record OrganismHealth(
            Map<String, AgentState> agentStates,
            List<String> blockedAgents,
            List<String> unmatchedRequests,
            double healthScore
    ) {}

    /** A conflict in the organism — something blocking healthy growth. */
    public record Conflict(
            ConflictType type,
            String description,
            String targetAgentId,
            List<String> requiredCapabilities
    ) {
        public enum ConflictType { BLOCKED_AGENT, MERGE_CONFLICT, NUTRIENT_STARVATION }
    }

    /** Resolution of a conflict — the mother tree's prescription. */
    public record Resolution(Type type, String description) {
        public enum Type { NUTRIENT_REDIRECTED, MERGE_ORDER_APPLIED, STATE_FORCED, UNRESOLVED }
    }

    /** Thrown when someone tries to harvest before the organism is ready. */
    public static class PrematureHarvestException extends RuntimeException {
        public PrematureHarvestException(String message) {
            super(message);
        }
    }
}
