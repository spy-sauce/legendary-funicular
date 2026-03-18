// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonPOJOBuilder;

import java.time.Instant;
import java.util.List;

/**
 * The heartbeat of an agent node — a health pulse broadcast across the mycelium wire.
 *
 * Field note: In a real mycelium network, each hyphal tip sends chemical signals
 * indicating whether it has found nutrients or encountered toxins. This pulse
 * is our digital equivalent. Silent agents are assumed dead.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonDeserialize(builder = HealthPulse.Builder.class)
public final class HealthPulse {

    private final String agentId;
    private final String scope;
    private final AgentState state;
    private final Instant timestamp;
    private final Progress progress;
    private final HealthStatus health;
    private final List<Blocker> blockers;
    private final FlowStatus flowStatus;
    private final String message;

    private HealthPulse(Builder builder) {
        this.agentId = builder.agentId;
        this.scope = builder.scope;
        this.state = builder.state;
        this.timestamp = builder.timestamp;
        this.progress = builder.progress;
        this.health = builder.health;
        this.blockers = builder.blockers;
        this.flowStatus = builder.flowStatus;
        this.message = builder.message;
    }

    // -- Accessors (the organism's vital signs) --

    public String agentId() { return agentId; }
    public String scope() { return scope; }
    public AgentState state() { return state; }
    public Instant timestamp() { return timestamp; }
    public Progress progress() { return progress; }
    public HealthStatus health() { return health; }
    public List<Blocker> blockers() { return blockers; }
    public FlowStatus flowStatus() { return flowStatus; }
    public String message() { return message; }

    /**
     * Formats this pulse in the canonical human-readable format.
     * Reads like a mycologist's field log entry.
     */
    public String toHumanReadable() {
        String flowFragment = flowStatus != null && flowStatus.flowingTo() != null
                ? "flowing-to:" + flowStatus.flowingTo()
                : flowStatus != null && flowStatus.available() ? "available" : "busy";

        String healthFragment = health != null ? health.name().toLowerCase() : "unknown";

        return String.format("[AGENT-%s:%s] %s %s | %s | network %s",
                agentId, scope, state.emoji(), message != null ? message : state.description(),
                flowFragment, healthFragment);
    }

    public static Builder builder() {
        return new Builder();
    }

    // -- Nested structures (sub-cellular components) --

    /** Growth progress — how much of the substrate has been colonized. */
    public record Progress(
            int completed,
            int total,
            double percentage,
            String currentTask
    ) {
        /** Convenience: calculate percentage from completed/total. */
        public static Progress of(int completed, int total, String currentTask) {
            double pct = total > 0 ? (completed * 100.0) / total : 0.0;
            return new Progress(completed, total, pct, currentTask);
        }
    }

    /** A blocker — like a toxin encountered by the hyphal tip. */
    public record Blocker(
            String description,
            String blockedBy,
            BlockerSeverity severity,
            Instant since
    ) {}

    /** Blocker severity — soft blocks can be routed around, hard blocks halt growth. */
    public enum BlockerSeverity { soft, hard }

    /** Self-reported health classification. */
    public enum HealthStatus { healthy, degraded, critical, dead }

    /** Current nutrient flow posture. */
    public record FlowStatus(
            boolean available,
            String flowingTo,
            List<String> capabilities
    ) {}

    // -- Builder (assembling the pulse packet) --

    @JsonPOJOBuilder(withPrefix = "")
    public static final class Builder {
        private String agentId;
        private String scope;
        private AgentState state;
        private Instant timestamp;
        private Progress progress;
        private HealthStatus health = HealthStatus.healthy;
        private List<Blocker> blockers = List.of();
        private FlowStatus flowStatus;
        private String message;

        private Builder() {}

        public Builder agentId(String agentId) { this.agentId = agentId; return this; }
        public Builder scope(String scope) { this.scope = scope; return this; }
        public Builder state(AgentState state) { this.state = state; return this; }
        public Builder timestamp(Instant timestamp) { this.timestamp = timestamp; return this; }
        public Builder progress(Progress progress) { this.progress = progress; return this; }
        public Builder health(HealthStatus health) { this.health = health; return this; }
        public Builder blockers(List<Blocker> blockers) { this.blockers = blockers; return this; }
        public Builder flowStatus(FlowStatus flowStatus) { this.flowStatus = flowStatus; return this; }
        public Builder message(String message) { this.message = message; return this; }

        public HealthPulse build() {
            if (agentId == null || scope == null || state == null || progress == null) {
                throw new IllegalStateException(
                        "A health pulse without agentId, scope, state, or progress is like a spore without a nucleus — inviable.");
            }
            if (timestamp == null) {
                timestamp = Instant.now();
            }
            return new HealthPulse(this);
        }
    }
}
