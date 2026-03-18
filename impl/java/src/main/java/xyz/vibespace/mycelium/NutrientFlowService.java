// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium;

import xyz.vibespace.mycelium.model.NutrientRequest;
import xyz.vibespace.mycelium.model.Urgency;

import java.util.*;
import java.util.logging.Logger;

/**
 * The nutrient flow algorithm — the circulatory system of the organism.
 *
 * Field note: In a real mycelium network, nutrients flow along concentration
 * gradients — from regions of abundance to regions of scarcity. The network
 * doesn't need a central pump; the gradient IS the algorithm.
 *
 * Our digital version scores each pending request against the flowing agent's
 * capabilities using three factors: urgency, capability overlap, and proximity
 * in merge order. The highest score wins.
 */
public class NutrientFlowService {

    private static final Logger fieldLog = Logger.getLogger(NutrientFlowService.class.getName());

    /**
     * Scoring weights — calibrated to the spec.
     *
     * Field note: These weights determine how the organism prioritizes need.
     * Urgency dominates because a critical node dying hurts the whole colony.
     * Capability overlap ensures nutrients actually reach where they can be
     * metabolized. Proximity ensures merge order coherence.
     */
    private static final double URGENCY_WEIGHT = 0.5;
    private static final double CAPABILITY_OVERLAP_WEIGHT = 0.3;
    private static final double PROXIMITY_WEIGHT = 0.2;

    /** Merge order — determines proximity scoring between agents. */
    private final List<String> mergeSequence;

    public NutrientFlowService(List<String> mergeSequence) {
        this.mergeSequence = mergeSequence != null ? List.copyOf(mergeSequence) : List.of();
    }

    /**
     * Match a flowing agent to the best pending nutrient request.
     *
     * Scores each request by:
     *   score = urgency_weight * urgency_score
     *         + capability_weight * capability_overlap_score
     *         + proximity_weight * proximity_score
     *
     * @param flowingAgent the agent offering nutrients (has capabilities and an id)
     * @param pendingRequests all unresolved nutrient requests in the network
     * @return the best matching request, or empty if no viable match exists
     */
    public Optional<NutrientRequest> match(MyceliumAgent flowingAgent,
                                           List<NutrientRequest> pendingRequests) {
        if (pendingRequests == null || pendingRequests.isEmpty()) {
            fieldLog.fine(() -> String.format(
                    "[%s] No pending requests — the network is well-fed", flowingAgent.id()));
            return Optional.empty();
        }

        List<String> donorEnzymes = flowingAgent.capabilities();
        String donorId = flowingAgent.id();

        NutrientRequest bestMatch = null;
        double bestScore = -1.0;

        for (NutrientRequest request : pendingRequests) {
            if (request.resolved()) continue;

            // Skip self-requests — a hypha can't feed itself
            if (request.agentId().equals(donorId)) continue;

            double score = scoreRequest(donorId, donorEnzymes, request);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = request;
            }
        }

        if (bestMatch == null || bestScore <= 0.0) {
            fieldLog.fine(() -> String.format(
                    "[%s] No viable match found among %d requests — entering dormancy gradient",
                    flowingAgent.id(), pendingRequests.size()));
            return Optional.empty();
        }

        final NutrientRequest chosen = bestMatch;
        final double chosenScore = bestScore;
        fieldLog.info(() -> String.format(
                "[%s] Best nutrient match: %s (score: %.3f, urgency: %s)",
                flowingAgent.id(), chosen.agentId(), chosenScore, chosen.urgency()));

        return Optional.of(bestMatch);
    }

    /**
     * Score a single request against the donor's capabilities.
     *
     * Field note: The scoring function mimics chemical affinity —
     * how well a nutrient molecule fits a receptor protein.
     */
    double scoreRequest(String donorId, List<String> donorEnzymes, NutrientRequest request) {
        double urgencyScore = computeUrgencyScore(request.urgency());
        double overlapScore = computeCapabilityOverlap(donorEnzymes, request.capabilities());
        double proximityScore = computeProximity(donorId, request.agentId());

        return (URGENCY_WEIGHT * urgencyScore)
             + (CAPABILITY_OVERLAP_WEIGHT * overlapScore)
             + (PROXIMITY_WEIGHT * proximityScore);
    }

    /**
     * Urgency score: normalized weight from the Urgency enum.
     * Critical = 1.0, low = 0.25.
     */
    private double computeUrgencyScore(Urgency urgency) {
        if (urgency == null) return Urgency.normal.weight();
        return urgency.weight();
    }

    /**
     * Capability overlap: Jaccard similarity between donor enzymes and request needs.
     *
     * Field note: Like enzyme-substrate specificity — the more enzymes match
     * the substrate's requirements, the faster the reaction.
     */
    private double computeCapabilityOverlap(List<String> donorEnzymes, List<String> requestedEnzymes) {
        if (donorEnzymes == null || donorEnzymes.isEmpty()
                || requestedEnzymes == null || requestedEnzymes.isEmpty()) {
            // No capability information — assume partial compatibility (0.5)
            // rather than zero, because the agent might still help
            return 0.5;
        }

        Set<String> donorSet = new HashSet<>(donorEnzymes);
        Set<String> requestSet = new HashSet<>(requestedEnzymes);

        // Intersection — the enzymes we can actually provide
        Set<String> intersection = new HashSet<>(donorSet);
        intersection.retainAll(requestSet);

        // Union — all enzymes mentioned by either party
        Set<String> union = new HashSet<>(donorSet);
        union.addAll(requestSet);

        return union.isEmpty() ? 0.0 : (double) intersection.size() / union.size();
    }

    /**
     * Proximity in merge order: closer agents in the merge sequence score higher.
     *
     * Field note: In physical mycelium, nutrients flow preferentially to nearby
     * nodes because the transport cost is lower. Merge order proximity is our
     * analog — agents that merge close together in the sequence share more
     * integration surface area.
     */
    private double computeProximity(String donorId, String requesterId) {
        if (mergeSequence.isEmpty()) {
            // No merge order defined — all agents are equidistant
            return 0.5;
        }

        int donorIndex = mergeSequence.indexOf(donorId);
        int requesterIndex = mergeSequence.indexOf(requesterId);

        if (donorIndex < 0 || requesterIndex < 0) {
            // One or both agents aren't in the merge sequence — neutral proximity
            return 0.5;
        }

        int distance = Math.abs(donorIndex - requesterIndex);
        int maxDistance = mergeSequence.size() - 1;

        if (maxDistance == 0) return 1.0;

        // Invert distance: closer = higher score
        return 1.0 - ((double) distance / maxDistance);
    }
}
