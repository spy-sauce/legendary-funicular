// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

/**
 * An offer of surplus nutrients from a thriving node.
 *
 * Field note: Healthy mycelium doesn't hoard — when a region has excess nutrients,
 * it actively transports them to where they're needed. This record represents
 * a node saying "I have capacity, point me at the weak spots."
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NutrientOffer(
        /** Always NUTRIENT_OFFER — identifies the signal type on the wire. */
        String type,

        /** The generous agent offering its surplus. */
        String agentId,

        /** When the offer was broadcast. */
        Instant timestamp,

        /** What nutrients this agent can provide — skill tags. */
        List<String> capabilities,

        /** How urgently this offer should be matched (usually low/normal). */
        Urgency urgency,

        /** The domain where help is offered. */
        String scope,

        /** Human-readable description — what the agent can do. */
        String description,

        /** How much capacity is available (e.g., "4 hours", "full sprint"). */
        String estimatedEffort,

        /** Specific agent this offer targets, or null for general availability. */
        String targetAgent,

        /** Whether this offer has been claimed. */
        boolean resolved,

        /** Which agent consumed the nutrients. */
        String resolvedBy,

        /** When the offer was claimed. */
        Instant resolvedAt
) {
    /** Canonical type identifier — the chemical signature of an offer. */
    public static final String TYPE = "NUTRIENT_OFFER";

    /**
     * Creates a general availability signal — the agent is done with primary work
     * and ready to flow nutrients anywhere in the organism.
     */
    public static NutrientOffer available(String agentId, List<String> capabilities,
                                          String scope, String description) {
        return new NutrientOffer(
                TYPE, agentId, Instant.now(), capabilities, Urgency.normal,
                scope, description, null, null, false, null, null
        );
    }

    /**
     * Marks this offer as claimed — nutrients are flowing to the consumer.
     */
    public NutrientOffer claimBy(String consumingAgentId) {
        return new NutrientOffer(
                type, agentId, timestamp, capabilities, urgency,
                scope, description, estimatedEffort, targetAgent,
                true, consumingAgentId, Instant.now()
        );
    }
}
