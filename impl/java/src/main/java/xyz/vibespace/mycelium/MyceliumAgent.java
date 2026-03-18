// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium;

import xyz.vibespace.mycelium.model.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.logging.Logger;

/**
 * Abstract agent node in the mycelium network.
 *
 * Field note: Each agent is a hyphal tip — the growing point of the organism.
 * It senses its environment, extends into substrate, and communicates with
 * the network through chemical signals. Subclasses define the specific
 * metabolic activity (what the hypha actually does when it grows).
 *
 * Lifecycle: GERMINATING -> GROWING -> FLOWING -> FRUITING -> DORMANT
 * At any point, a node may retreat to DORMANT if the substrate is hostile.
 */
public abstract class MyceliumAgent {

    private static final Logger fieldLog = Logger.getLogger(MyceliumAgent.class.getName());

    // -- Organism identity (the cell's DNA) --
    private final String hyphalId;
    private final String substrate;          // scope — what this agent colonizes
    private volatile String growthLane;      // lane — current direction of extension
    private volatile AgentState sporeState;  // current lifecycle phase
    private final List<String> enzymes;      // capabilities — what nutrients we can process
    private final List<String> symbioses;    // dependencies — other nodes we need

    // -- Network connections --
    private MyceliumEventBus signalNetwork;
    private final List<MyceliumContract> absorbedContracts = new CopyOnWriteArrayList<>();

    protected MyceliumAgent(String hyphalId, String substrate, List<String> enzymes) {
        this.hyphalId = hyphalId;
        this.substrate = substrate;
        this.growthLane = substrate; // default lane is the full scope
        this.sporeState = AgentState.DORMANT;
        this.enzymes = List.copyOf(enzymes);
        this.symbioses = new CopyOnWriteArrayList<>();
    }

    // -- Abstract methods (subclass-specific metabolism) --

    /**
     * The primary metabolic process — what this hypha does when it grows.
     * Implementations contain the actual domain work.
     */
    protected abstract void doExecute();

    /**
     * Flow nutrients to another agent. Called when this node has finished
     * its primary work and is helping a neighbor.
     *
     * @param targetHyphalId the agent receiving nutrients
     */
    protected abstract void doFlow(String targetHyphalId);

    /**
     * Produce the fruiting body — generate deliverables.
     * Called during the FRUITING phase.
     *
     * @return list of artifact paths or identifiers produced
     */
    protected abstract List<String> doFruit();

    // -- Concrete interface methods (the Agent Interface from the spec) --

    /**
     * Sense the network — observe adjacent nodes and organism health.
     * Returns a snapshot of the visible network state.
     *
     * Field note: Real hyphae sense their environment through chemoreception.
     * We sense ours through the event bus.
     */
    public NetworkState sense() {
        fieldLog.fine(() -> String.format("[%s] Sensing network from %s substrate...", hyphalId, substrate));
        // In a full implementation, this queries the orchestrator or event bus
        // for current organism state. For now, return local knowledge.
        return new NetworkState(hyphalId, sporeState, List.copyOf(absorbedContracts));
    }

    /**
     * Execute primary scope work with lifecycle state management.
     * Wraps the subclass doExecute() with proper state transitions.
     *
     * Field note: The hypha extends into fresh substrate. If it hits rock, it stops.
     */
    public final void execute() {
        transitionTo(AgentState.GROWING);
        onGrow();
        try {
            doExecute();
        } catch (Exception toxin) {
            fieldLog.severe(() -> String.format(
                    "[%s] Toxin encountered during growth: %s", hyphalId, toxin.getMessage()));
            throw toxin;
        }
    }

    /**
     * Flow nutrients to another agent.
     * Transitions to FLOWING state and delegates to subclass.
     *
     * @param targetHyphalId the agent that needs nutrients
     */
    public final void flow(String targetHyphalId) {
        transitionTo(AgentState.FLOWING);
        onFlow();
        fieldLog.info(() -> String.format(
                "[%s] Nutrient flow initiated -> %s", hyphalId, targetHyphalId));
        doFlow(targetHyphalId);
    }

    /**
     * Broadcast a health pulse to the network.
     * Silent agents are assumed dead — this keeps us alive.
     *
     * @param pulse the health signal to broadcast
     */
    public void signal(HealthPulse pulse) {
        if (signalNetwork != null) {
            signalNetwork.publish(MyceliumEventBus.EventType.HEALTH_PULSE, pulse);
        }
        fieldLog.fine(() -> pulse.toHumanReadable());
    }

    /**
     * Absorb a contract — ingest a chemical signal from the network.
     * Validates and incorporates the contract into working context.
     *
     * @param contract the shared contract to absorb
     */
    public void absorb(MyceliumContract contract) {
        fieldLog.info(() -> String.format(
                "[%s] Absorbing contract: %s v%s", hyphalId, contract.name(), contract.version()));
        absorbedContracts.add(contract);
    }

    /**
     * Produce deliverables — the fruiting phase.
     * Transitions to FRUITING and delegates to subclass.
     *
     * @return list of deliverable identifiers
     */
    public final List<String> fruit() {
        transitionTo(AgentState.FRUITING);
        onFruit();
        List<String> sporocarps = doFruit();
        fieldLog.info(() -> String.format(
                "[%s] Fruiting complete — %d deliverables produced", hyphalId, sporocarps.size()));
        return Collections.unmodifiableList(sporocarps);
    }

    /**
     * Germinate — begin the lifecycle from dormancy.
     * Reads contracts, initializes state, prepares for growth.
     */
    public final void germinate() {
        transitionTo(AgentState.GERMINATING);
        onGerminate();
        fieldLog.info(() -> String.format(
                "[%s] Spore germinating on substrate: %s", hyphalId, substrate));
    }

    /**
     * Enter dormancy — metabolic shutdown until the next signal.
     */
    public final void dormant() {
        transitionTo(AgentState.DORMANT);
        onDormant();
        fieldLog.info(() -> String.format("[%s] Entering dormancy", hyphalId));
    }

    // -- State management --

    /**
     * Transition to a new state with validation.
     * Illegal transitions are rejected — the organism protects itself.
     *
     * @param target desired state
     * @throws IllegalStateTransitionException if the transition is biologically invalid
     */
    protected void transitionTo(AgentState target) {
        if (!sporeState.canTransitionTo(target)) {
            throw new IllegalStateTransitionException(String.format(
                    "Agent %s cannot transition from %s to %s — the organism rejects this path.",
                    hyphalId, sporeState, target));
        }
        AgentState previous = this.sporeState;
        this.sporeState = target;
        fieldLog.fine(() -> String.format(
                "[%s] State transition: %s -> %s", hyphalId, previous, target));
    }

    /**
     * Build a health pulse reflecting current vital signs.
     */
    public HealthPulse buildPulse(HealthPulse.Progress growth, String fieldNote) {
        return HealthPulse.builder()
                .agentId(hyphalId)
                .scope(substrate)
                .state(sporeState)
                .timestamp(Instant.now())
                .progress(growth)
                .health(HealthPulse.HealthStatus.healthy)
                .flowStatus(new HealthPulse.FlowStatus(
                        sporeState == AgentState.FLOWING || sporeState == AgentState.DORMANT,
                        null,
                        enzymes
                ))
                .message(fieldNote)
                .build();
    }

    // -- Lifecycle hooks (override for custom behavior at phase boundaries) --

    /** Called when germination begins. Override to perform setup. */
    protected void onGerminate() {}

    /** Called when growth phase begins. Override to prepare workspace. */
    protected void onGrow() {}

    /** Called when flowing phase begins. Override to advertise availability. */
    protected void onFlow() {}

    /** Called when fruiting phase begins. Override to prepare outputs. */
    protected void onFruit() {}

    /** Called when entering dormancy. Override to persist state. */
    protected void onDormant() {}

    // -- Accessors (reading the cell's membrane markers) --

    public String id() { return hyphalId; }
    public String scope() { return substrate; }
    public String lane() { return growthLane; }
    public AgentState state() { return sporeState; }
    public List<String> capabilities() { return enzymes; }
    public List<String> dependencies() { return Collections.unmodifiableList(symbioses); }

    public void setLane(String growthLane) { this.growthLane = growthLane; }
    public void setSignalNetwork(MyceliumEventBus signalNetwork) { this.signalNetwork = signalNetwork; }
    public void addDependency(String agentId) { this.symbioses.add(agentId); }

    // -- Inner types --

    /** A snapshot of the network as perceived by this agent. */
    public record NetworkState(
            String observerAgentId,
            AgentState observerState,
            List<MyceliumContract> knownContracts
    ) {}

    /** Thrown when the organism rejects an invalid state transition. */
    public static class IllegalStateTransitionException extends RuntimeException {
        public IllegalStateTransitionException(String message) {
            super(message);
        }
    }
}
