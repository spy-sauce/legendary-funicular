// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium.model;

/**
 * Urgency levels for nutrient signals.
 *
 * Field note: In biological systems, signal intensity determines response speed.
 * A faint chemical gradient triggers slow redistribution; a sharp spike triggers
 * emergency rerouting. These levels mirror that continuum.
 */
public enum Urgency {

    /** Background redistribution — no rush, just optimizing. */
    low(0.25),

    /** Standard nutrient flow — healthy organism housekeeping. */
    normal(0.5),

    /** Elevated need — a region is showing signs of stress. */
    high(0.75),

    /** Emergency — tissue death imminent without immediate flow. */
    critical(1.0);

    private final double weight;

    Urgency(double weight) {
        this.weight = weight;
    }

    /**
     * Numeric weight for scoring calculations in the nutrient flow algorithm.
     * Higher weight means the signal propagates faster through the network.
     */
    public double weight() {
        return weight;
    }
}
