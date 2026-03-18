// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * In-process event bus — for single-JVM organisms.
 *
 * Field note: This is the simplest mycelium topology: all hyphae share
 * a single cytoplasm. Signals propagate instantly through direct method calls.
 * Suitable for small organisms (dev/test) or monolithic deployments.
 *
 * Uses Spring ApplicationEvents under the hood, but wraps them in
 * the Mycelium signal vocabulary.
 */
@Component
public class LocalEventBus implements MyceliumEventBus {

    private static final Logger fieldLog = Logger.getLogger(LocalEventBus.class.getName());

    private final ApplicationEventPublisher springPulse;
    private final ObjectMapper enzyme;

    /**
     * Registry of signal receptors — each event type maps to a list of consumers.
     * ConcurrentHashMap for thread-safe hyphal branching.
     */
    private final Map<EventType, List<ReceptorBinding<?>>> receptorRegistry = new ConcurrentHashMap<>();

    public LocalEventBus(ApplicationEventPublisher springPulse, ObjectMapper enzyme) {
        this.springPulse = springPulse;
        this.enzyme = enzyme;
    }

    @Override
    public <T> void subscribe(EventType eventType, Class<T> payloadType, Consumer<T> receptor) {
        receptorRegistry
                .computeIfAbsent(eventType, k -> new CopyOnWriteArrayList<>())
                .add(new ReceptorBinding<>(payloadType, receptor));
        fieldLog.fine(() -> String.format(
                "Receptor bound to channel %s (type: %s)", eventType.channel(), payloadType.getSimpleName()));
    }

    @Override
    public void publish(EventType eventType, Object payload) {
        fieldLog.fine(() -> String.format(
                "Signal on channel %s: %s", eventType.channel(), payload.getClass().getSimpleName()));

        // Propagate through Spring's event system for integration with other Spring components
        springPulse.publishEvent(new MyceliumSignalEvent(this, eventType, payload));

        // Also dispatch directly to registered receptors — faster for internal wiring
        List<ReceptorBinding<?>> receptors = receptorRegistry.get(eventType);
        if (receptors != null) {
            for (ReceptorBinding<?> binding : receptors) {
                dispatchToReceptor(binding, payload);
            }
        }
    }

    @Override
    public <T> void unsubscribe(EventType eventType, Consumer<T> receptor) {
        List<ReceptorBinding<?>> receptors = receptorRegistry.get(eventType);
        if (receptors != null) {
            receptors.removeIf(binding -> binding.receptor == receptor);
        }
    }

    /**
     * Dispatch a signal to a typed receptor, performing type coercion if needed.
     * The enzyme (ObjectMapper) converts between compatible types.
     */
    @SuppressWarnings("unchecked")
    private <T> void dispatchToReceptor(ReceptorBinding<T> binding, Object payload) {
        try {
            T typedPayload;
            if (binding.payloadType.isInstance(payload)) {
                typedPayload = binding.payloadType.cast(payload);
            } else {
                // Use the enzyme to convert — like a transporter protein reshaping a molecule
                typedPayload = enzyme.convertValue(payload, binding.payloadType);
            }
            binding.receptor.accept(typedPayload);
        } catch (Exception toxin) {
            fieldLog.warning(() -> String.format(
                    "Receptor failed to process signal on %s: %s",
                    binding.payloadType.getSimpleName(), toxin.getMessage()));
        }
    }

    /**
     * A receptor binding — pairs a type expectation with a callback.
     * Like a receptor protein on a cell membrane: specific shape, specific response.
     */
    private record ReceptorBinding<T>(Class<T> payloadType, Consumer<T> receptor) {}

    /**
     * Spring ApplicationEvent wrapper for mycelium signals.
     * Bridges the mycelium wire into Spring's native event system.
     */
    public static class MyceliumSignalEvent extends org.springframework.context.ApplicationEvent {
        private final EventType eventType;
        private final Object payload;

        public MyceliumSignalEvent(Object source, EventType eventType, Object payload) {
            super(source);
            this.eventType = eventType;
            this.payload = payload;
        }

        public EventType eventType() { return eventType; }
        public Object payload() { return payload; }
    }
}
