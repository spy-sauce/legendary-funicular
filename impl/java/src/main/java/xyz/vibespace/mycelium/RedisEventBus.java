// Mycelium Framework — VibeSpace LLC — The network provides.
package xyz.vibespace.mycelium;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * Distributed event bus backed by Redis pub/sub — for multi-JVM organisms.
 *
 * Field note: When the organism grows beyond a single host, the hyphae must
 * communicate across physical boundaries. Redis acts as the shared substrate —
 * signals diffuse through its channels like nutrients through soil water.
 *
 * This implementation is optional. Only activated when spring-data-redis
 * is on the classpath and redis connection is configured.
 */
public class RedisEventBus implements MyceliumEventBus {

    private static final Logger fieldLog = Logger.getLogger(RedisEventBus.class.getName());

    private final StringRedisTemplate redisSubstrate;
    private final RedisMessageListenerContainer listenerContainer;
    private final ObjectMapper enzyme;

    /** Receptors indexed by event type — mirrors the local bus registry. */
    private final Map<EventType, List<ReceptorBinding<?>>> receptorRegistry = new ConcurrentHashMap<>();

    /** Active Redis listeners so we can detach them on unsubscribe. */
    private final Map<EventType, MessageListener> activeListeners = new ConcurrentHashMap<>();

    public RedisEventBus(StringRedisTemplate redisSubstrate,
                         RedisMessageListenerContainer listenerContainer,
                         ObjectMapper enzyme) {
        this.redisSubstrate = redisSubstrate;
        this.listenerContainer = listenerContainer;
        this.enzyme = enzyme;
    }

    @Override
    public <T> void subscribe(EventType eventType, Class<T> payloadType, Consumer<T> receptor) {
        receptorRegistry
                .computeIfAbsent(eventType, k -> new CopyOnWriteArrayList<>())
                .add(new ReceptorBinding<>(payloadType, receptor));

        // Ensure a Redis listener exists for this channel
        activeListeners.computeIfAbsent(eventType, type -> {
            MessageListener hyphalListener = (message, pattern) ->
                    onRedisSignal(type, message);

            listenerContainer.addMessageListener(
                    hyphalListener,
                    new ChannelTopic(type.channel())
            );

            fieldLog.info(() -> String.format(
                    "Redis receptor attached to channel: %s", type.channel()));
            return hyphalListener;
        });
    }

    @Override
    public void publish(EventType eventType, Object payload) {
        try {
            String serializedSignal = enzyme.writeValueAsString(payload);
            redisSubstrate.convertAndSend(eventType.channel(), serializedSignal);
            fieldLog.fine(() -> String.format(
                    "Signal broadcast on Redis channel %s (%d bytes)",
                    eventType.channel(), serializedSignal.length()));
        } catch (JsonProcessingException toxin) {
            fieldLog.severe(() -> String.format(
                    "Failed to serialize signal for channel %s: %s",
                    eventType.channel(), toxin.getMessage()));
        }
    }

    @Override
    public <T> void unsubscribe(EventType eventType, Consumer<T> receptor) {
        List<ReceptorBinding<?>> receptors = receptorRegistry.get(eventType);
        if (receptors != null) {
            receptors.removeIf(binding -> binding.receptor == receptor);

            // If no more receptors, detach from Redis entirely
            if (receptors.isEmpty()) {
                MessageListener listener = activeListeners.remove(eventType);
                if (listener != null) {
                    listenerContainer.removeMessageListener(listener);
                    fieldLog.info(() -> String.format(
                            "Redis receptor detached from channel: %s", eventType.channel()));
                }
            }
        }
    }

    /**
     * Process a signal arriving from the Redis substrate.
     * Deserializes and routes to all matching receptors.
     */
    private void onRedisSignal(EventType eventType, Message message) {
        List<ReceptorBinding<?>> receptors = receptorRegistry.get(eventType);
        if (receptors == null || receptors.isEmpty()) {
            return;
        }

        String rawSignal = new String(message.getBody());
        for (ReceptorBinding<?> binding : receptors) {
            dispatchToReceptor(binding, rawSignal);
        }
    }

    @SuppressWarnings("unchecked")
    private <T> void dispatchToReceptor(ReceptorBinding<T> binding, String rawSignal) {
        try {
            T typedPayload = enzyme.readValue(rawSignal, binding.payloadType);
            binding.receptor.accept(typedPayload);
        } catch (JsonProcessingException toxin) {
            fieldLog.warning(() -> String.format(
                    "Receptor could not metabolize signal (expected %s): %s",
                    binding.payloadType.getSimpleName(), toxin.getMessage()));
        }
    }

    private record ReceptorBinding<T>(Class<T> payloadType, Consumer<T> receptor) {}
}
