// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

/**
 * A cry for nutrients from a struggling node.
 *
 * Field note: When a hyphal tip encounters depleted substrate, it releases
 * chemical signals that redirect nutrient flow from healthier regions of the
 * network. This record is that signal — a plea encoded as data.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NutrientRequest(
        /** Always NUTRIENT_REQUEST — identifies the signal type on the wire. */
        String type,

        /** The agent emitting the distress signal. */
        String agentId,

        /** When the signal was released into the network. */
        Instant timestamp,

        /** What kind of nutrients are needed — skill tags. */
        List<String> capabilities,

        /** How urgently the node needs help. */
        Urgency urgency,

        /** The domain where help is needed. */
        String scope,

        /** Human-readable description — the mycologist's annotation. */
        String description,

        /** Rough estimate of metabolic cost (e.g., "2 hours", "quick fix"). */
        String estimatedEffort,

        /** Specific agent this request is directed at, or null for broadcast. */
        String targetAgent,

        /** Whether another node has already answered the call. */
        boolean resolved,

        /** Which agent answered, if resolved. */
        String resolvedBy,

        /** When the nutrient delivery completed. */
        Instant resolvedAt
) {
    /** Canonical type identifier — the chemical signature of a request. */
    public static final String TYPE = "NUTRIENT_REQUEST";

    /**
     * Creates a broadcast request — no specific target, released into the general network.
     * Like a diffuse chemical gradient rather than a directed signal.
     */
    public static NutrientRequest broadcast(String agentId, List<String> capabilities,
                                            Urgency urgency, String scope, String description) {
        return new NutrientRequest(
                TYPE, agentId, Instant.now(), capabilities, urgency,
                scope, description, null, null, false, null, null
        );
    }

    /**
     * Marks this request as resolved — the nutrients arrived.
     * Returns a new immutable record with resolution metadata.
     */
    public NutrientRequest resolveWith(String resolvingAgentId) {
        return new NutrientRequest(
                type, agentId, timestamp, capabilities, urgency,
                scope, description, estimatedEffort, targetAgent,
                true, resolvingAgentId, Instant.now()
        );
    }
}
