// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium.model;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Lifecycle states of a mycelium agent node.
 *
 * Field note: Each state mirrors a real fungal lifecycle phase.
 * The transitions are not arbitrary — they encode the biological
 * constraint that growth must precede fruiting, and dormancy
 * is always a valid retreat.
 */
public enum AgentState {

    /** Spore has landed. Reading contracts, sensing the substrate. */
    GERMINATING("\uD83C\uDF31", "Initializing, reading contracts, understanding the organism"),

    /** Hyphae extending. Primary scope work underway. */
    GROWING("\uD83C\uDF3F", "Executing primary scope work"),

    /** Mycelium connected. Nutrients flowing to adjacent nodes. */
    FLOWING("\uD83D\uDD04", "Primary work done, flowing nutrients to other agents"),

    /** Fruiting body emerging. Producing deliverables. */
    FRUITING("\uD83C\uDF44", "Producing deliverables and outputs"),

    /** Metabolically quiet. Awaiting network signal. */
    DORMANT("\uD83D\uDCA4", "Idle, waiting for network signal");

    private final String sporeEmoji;
    private final String fieldNote;

    /**
     * Legal state transitions — encoded like hyphal branching rules.
     * A hypha can only extend in certain directions from each growth point.
     */
    private static final Map<AgentState, Set<AgentState>> ALLOWED_TRANSITIONS = Map.of(
            GERMINATING, EnumSet.of(GROWING, DORMANT),
            GROWING,     EnumSet.of(FLOWING, FRUITING, DORMANT),
            FLOWING,     EnumSet.of(GROWING, FRUITING, DORMANT),
            FRUITING,    EnumSet.of(DORMANT, GROWING),
            DORMANT,     EnumSet.of(GERMINATING, GROWING)
    );

    AgentState(String sporeEmoji, String fieldNote) {
        this.sporeEmoji = sporeEmoji;
        this.fieldNote = fieldNote;
    }

    public String emoji() {
        return sporeEmoji;
    }

    public String description() {
        return fieldNote;
    }

    /**
     * Validates whether a state transition is biologically legal.
     * Illegal transitions indicate a sick organism — something has
     * gone wrong with the signaling cascade.
     *
     * @param target the desired next state
     * @return true if the hypha can extend in that direction
     */
    public boolean canTransitionTo(AgentState target) {
        if (target == this) {
            // Staying in the same state is always valid — the organism is stable.
            return true;
        }
        return ALLOWED_TRANSITIONS.getOrDefault(this, EnumSet.noneOf(AgentState.class))
                .contains(target);
    }

    /**
     * Formats the state as a human-readable pulse fragment.
     * Looks like field notes pinned to a specimen board.
     */
    @Override
    public String toString() {
        return sporeEmoji + " " + name();
    }
}
