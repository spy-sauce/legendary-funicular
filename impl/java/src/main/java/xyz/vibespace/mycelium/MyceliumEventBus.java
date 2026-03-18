// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium;

import java.util.function.Consumer;

/**
 * The mycelium wire — the signaling network that connects all agent nodes.
 *
 * Field note: In a real fungal network, chemical signals propagate through
 * cytoplasmic streaming along interconnected hyphae. Our wire abstracts
 * the transport: in-process events for single-JVM organisms, Redis pub/sub
 * for distributed colonies.
 */
public interface MyceliumEventBus {

    /**
     * Event types carried on the wire — each is a distinct chemical signal.
     */
    enum EventType {
        /** Heartbeat from an agent node. */
        HEALTH_PULSE("mycelium.health"),

        /** An agent offering surplus capacity. */
        NUTRIENT_OFFER("mycelium.nutrient.offer"),

        /** An agent requesting help. */
        NUTRIENT_REQUEST("mycelium.nutrient.request"),

        /** Orchestrator broadcasting a contract change. */
        CONTRACT_UPDATE("mycelium.contract.update"),

        /** An agent has produced deliverables. */
        FRUIT_READY("mycelium.fruit.ready"),

        /** An agent is ready to merge. */
        MERGE_SIGNAL("mycelium.merge");

        private final String channelName;

        EventType(String channelName) {
            this.channelName = channelName;
        }

        /** The wire channel name for this event type. */
        public String channel() {
            return channelName;
        }
    }

    /**
     * Subscribe to a signal type on the wire.
     *
     * @param <T>       payload type
     * @param eventType the signal to listen for
     * @param payloadType class of the expected payload
     * @param receptor  callback invoked when the signal arrives
     */
    <T> void subscribe(EventType eventType, Class<T> payloadType, Consumer<T> receptor);

    /**
     * Broadcast a signal into the network.
     *
     * @param eventType the type of signal
     * @param payload   the signal payload
     */
    void publish(EventType eventType, Object payload);

    /**
     * Disconnect a receptor from the wire.
     *
     * @param eventType the signal type to stop listening for
     * @param receptor  the callback to remove
     */
    <T> void unsubscribe(EventType eventType, Consumer<T> receptor);
}
