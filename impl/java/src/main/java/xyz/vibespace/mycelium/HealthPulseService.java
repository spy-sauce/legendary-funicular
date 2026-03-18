// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium;

import xyz.vibespace.mycelium.model.HealthPulse;

import java.util.List;
import java.util.concurrent.*;
import java.util.logging.Logger;

/**
 * Scheduled health pulse broadcaster — the organism's pacemaker.
 *
 * Field note: In a living mycelium network, each hyphal tip continuously
 * releases chemical signals indicating its status. If a tip goes silent,
 * the network assumes it has necrotized and reroutes around it. This service
 * ensures our digital hyphae keep pulsing.
 *
 * Default interval: 30 seconds (configurable via constructor or property).
 */
public class HealthPulseService {

    private static final Logger fieldLog = Logger.getLogger(HealthPulseService.class.getName());

    /** Default pulse interval in seconds — matches the spec's recommendation. */
    private static final long DEFAULT_PULSE_INTERVAL_SECONDS = 30;

    private final MyceliumEventBus signalNetwork;
    private final List<MyceliumAgent> colony;
    private final long pulseIntervalSeconds;

    private final ScheduledExecutorService pacemaker;
    private volatile ScheduledFuture<?> heartbeat;

    public HealthPulseService(MyceliumEventBus signalNetwork, List<MyceliumAgent> colony) {
        this(signalNetwork, colony, DEFAULT_PULSE_INTERVAL_SECONDS);
    }

    public HealthPulseService(MyceliumEventBus signalNetwork,
                              List<MyceliumAgent> colony,
                              long pulseIntervalSeconds) {
        this.signalNetwork = signalNetwork;
        this.colony = colony;
        this.pulseIntervalSeconds = pulseIntervalSeconds;

        // Single-threaded — the pacemaker is one rhythm, not a cacophony
        this.pacemaker = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread pacemakerThread = new Thread(r, "mycelium-pacemaker");
            pacemakerThread.setDaemon(true);
            return pacemakerThread;
        });
    }

    /**
     * Start the pacemaker — begin broadcasting health pulses.
     *
     * Each pulse cycle iterates over all agents in the colony, builds a
     * HealthPulse from their current vital signs, logs it in the human-readable
     * format, and broadcasts it on the wire.
     */
    public void startPulsing() {
        if (heartbeat != null && !heartbeat.isCancelled()) {
            fieldLog.warning("Pacemaker already running — ignoring duplicate start request");
            return;
        }

        fieldLog.info(() -> String.format(
                "Pacemaker starting: %d agents, %ds interval",
                colony.size(), pulseIntervalSeconds));

        heartbeat = pacemaker.scheduleAtFixedRate(
                this::emitPulses,
                0,
                pulseIntervalSeconds,
                TimeUnit.SECONDS
        );
    }

    /**
     * Stop the pacemaker — silence the organism's heartbeat.
     * Use with caution: silent agents are assumed dead.
     */
    public void stopPulsing() {
        if (heartbeat != null) {
            heartbeat.cancel(false);
            fieldLog.info("Pacemaker stopped. The organism holds its breath.");
        }
    }

    /**
     * Shut down the pacemaker entirely — organism decommissioning.
     */
    public void shutdown() {
        stopPulsing();
        pacemaker.shutdown();
        try {
            if (!pacemaker.awaitTermination(5, TimeUnit.SECONDS)) {
                pacemaker.shutdownNow();
            }
        } catch (InterruptedException e) {
            pacemaker.shutdownNow();
            Thread.currentThread().interrupt();
        }
        fieldLog.info("Pacemaker decommissioned.");
    }

    /**
     * Single pulse cycle — emit a health signal for every agent in the colony.
     */
    private void emitPulses() {
        for (MyceliumAgent hypha : colony) {
            try {
                HealthPulse pulse = hypha.buildPulse(
                        HealthPulse.Progress.of(0, 1, hypha.state().description()),
                        hypha.state().description()
                );

                // Log in the human-readable format — the mycologist's field journal
                fieldLog.info(pulse.toHumanReadable());

                // Broadcast on the wire
                signalNetwork.publish(MyceliumEventBus.EventType.HEALTH_PULSE, pulse);

            } catch (Exception toxin) {
                // A failed pulse is alarming but shouldn't crash the pacemaker.
                // Log as degraded and continue — the show must go on.
                fieldLog.warning(() -> String.format(
                        "[%s] Failed to emit pulse: %s — marking as degraded",
                        hypha.id(), toxin.getMessage()));
            }
        }
    }

    /**
     * Force an immediate pulse outside the normal schedule.
     * Useful after state transitions or conflict resolution.
     */
    public void emitImmediatePulse(MyceliumAgent hypha, String fieldNote) {
        HealthPulse pulse = hypha.buildPulse(
                HealthPulse.Progress.of(0, 1, fieldNote),
                fieldNote
        );
        fieldLog.info(pulse.toHumanReadable());
        signalNetwork.publish(MyceliumEventBus.EventType.HEALTH_PULSE, pulse);
    }

    public long pulseIntervalSeconds() {
        return pulseIntervalSeconds;
    }

    public boolean isPulsing() {
        return heartbeat != null && !heartbeat.isCancelled() && !heartbeat.isDone();
    }
}
