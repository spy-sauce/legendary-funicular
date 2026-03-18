# Mycelium Framework — VibeSpace LLC — The network provides.

"""
bus.py — The mycelial network's signal transport layer.

In a real fungal network, chemical signals travel through cytoplasmic
streaming along hyphal tubes. Our event bus is the digital equivalent:
messages flow between agents through either local queues (a single
petri dish) or Redis streams (a distributed forest floor).

Two backends, one protocol. The organism doesn't care how the
signals travel — only that they arrive.
"""

from __future__ import annotations

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Callable, Coroutine

logger = logging.getLogger("mycelium.bus")

# Type alias for event handler coroutines
EventHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class EventType(Enum):
    """
    Signal types observed in the mycelium network.

    Field notes: each type corresponds to a distinct chemical signal
    class. Mixing them up would be like confusing a mating pheromone
    with a toxin warning — catastrophic.
    """

    HEALTH_PULSE = "HEALTH_PULSE"
    NUTRIENT_OFFER = "NUTRIENT_OFFER"
    NUTRIENT_REQUEST = "NUTRIENT_REQUEST"
    CONTRACT_UPDATE = "CONTRACT_UPDATE"
    FRUIT_READY = "FRUIT_READY"
    MERGE_SIGNAL = "MERGE_SIGNAL"


class EventBus(ABC):
    """
    Abstract interface for signal transport in the network.

    Every bus implementation must support publish/subscribe semantics.
    Signals are typed (EventType) and carry an arbitrary payload dict.
    """

    @abstractmethod
    async def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """
        Register a handler for a specific signal type.

        The handler coroutine will be invoked every time a matching
        signal flows through the network.
        """

    @abstractmethod
    async def publish(self, event_type: EventType, payload: dict[str, Any]) -> None:
        """
        Emit a signal into the network.

        The signal propagates to all subscribed handlers for the
        given event type.
        """

    @abstractmethod
    async def unsubscribe(self, event_type: EventType, handler: EventHandler | None = None) -> None:
        """
        Remove a handler (or all handlers) for a signal type.

        Pass a specific handler to remove just that one, or None to
        clear all subscriptions for the event type.
        """


class LocalEventBus(EventBus):
    """
    In-process signal transport — a single petri dish.

    Uses asyncio queues and direct handler invocation. Suitable for
    single-organism experiments where all hyphae share the same
    process space.

    Field notes: fast and simple, but signals cannot cross process
    boundaries. Use RedisEventBus for distributed colonies.
    """

    def __init__(self) -> None:
        self._subscribers: dict[EventType, list[EventHandler]] = {
            event_type: [] for event_type in EventType
        }
        self._queue: asyncio.Queue[tuple[EventType, dict[str, Any]]] = asyncio.Queue()
        self._running: bool = False
        self._dispatch_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Begin processing the signal queue."""
        if self._running:
            return
        self._running = True
        self._dispatch_task = asyncio.create_task(self._dispatch_loop())
        logger.info("Local event bus started — petri dish is active")

    async def stop(self) -> None:
        """Drain the queue and stop processing."""
        self._running = False
        if self._dispatch_task and not self._dispatch_task.done():
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass
        logger.info("Local event bus stopped")

    async def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Attach a receptor to a specific signal channel."""
        if handler not in self._subscribers[event_type]:
            self._subscribers[event_type].append(handler)
            logger.debug("Subscribed handler to %s", event_type.value)

    async def publish(self, event_type: EventType, payload: dict[str, Any]) -> None:
        """
        Inject a signal into the local substrate.

        If the dispatch loop is running, signals are queued. Otherwise,
        handlers are invoked directly (synchronous fallback for simple
        use cases).
        """
        if self._running:
            await self._queue.put((event_type, payload))
        else:
            # Direct dispatch — no queue, immediate delivery
            await self._invoke_handlers(event_type, payload)

    async def unsubscribe(self, event_type: EventType, handler: EventHandler | None = None) -> None:
        """Detach a receptor (or all receptors) from a signal channel."""
        if handler is None:
            self._subscribers[event_type] = []
            logger.debug("Cleared all subscribers for %s", event_type.value)
        elif handler in self._subscribers[event_type]:
            self._subscribers[event_type].remove(handler)
            logger.debug("Removed subscriber from %s", event_type.value)

    async def _dispatch_loop(self) -> None:
        """
        Continuous signal processing loop.

        Field notes: cytoplasmic streaming never stops in a healthy
        hypha. This loop is the digital equivalent — it pulls signals
        off the queue and delivers them to subscribed receptors.
        """
        while self._running:
            try:
                event_type, payload = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                await self._invoke_handlers(event_type, payload)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def _invoke_handlers(self, event_type: EventType, payload: dict[str, Any]) -> None:
        """Fan out a signal to all subscribed receptors."""
        for handler in self._subscribers[event_type]:
            try:
                await handler(payload)
            except Exception as exc:
                logger.error(
                    "Handler for %s raised an exception: %s", event_type.value, exc
                )


class RedisEventBus(EventBus):
    """
    Distributed signal transport — the forest floor.

    Uses Redis pub/sub for cross-process (and cross-machine) signal
    propagation. Suitable for distributed colonies where hyphae live
    in separate containers, machines, or data centers.

    Field notes: signals travel further but with higher latency.
    The trade-off is reach: a distributed organism can span continents.
    """

    def __init__(self, redis_url: str = "redis://localhost:6379") -> None:
        self._redis_url: str = redis_url
        self._subscribers: dict[EventType, list[EventHandler]] = {
            event_type: [] for event_type in EventType
        }
        self._redis: Any = None
        self._pubsub: Any = None
        self._listener_task: asyncio.Task[None] | None = None
        self._running: bool = False
        self._channel_prefix: str = "mycelium:"

    async def connect(self) -> None:
        """
        Establish connection to the Redis substrate.

        Field notes: the Redis instance is the shared soil medium.
        All hyphae in the colony must connect to the same instance
        (or cluster) to exchange signals.
        """
        import aioredis

        self._redis = await aioredis.from_url(self._redis_url)
        self._pubsub = self._redis.pubsub()
        self._running = True
        self._listener_task = asyncio.create_task(self._listen_loop())
        logger.info("Redis event bus connected to %s", self._redis_url)

    async def disconnect(self) -> None:
        """Sever the connection to the Redis substrate."""
        self._running = False
        if self._listener_task and not self._listener_task.done():
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self._pubsub:
            await self._pubsub.unsubscribe()
            await self._pubsub.close()
        if self._redis:
            await self._redis.close()
        logger.info("Redis event bus disconnected")

    async def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Subscribe to a signal channel on the Redis substrate."""
        channel = f"{self._channel_prefix}{event_type.value}"
        if handler not in self._subscribers[event_type]:
            self._subscribers[event_type].append(handler)
        if self._pubsub:
            await self._pubsub.subscribe(channel)
            logger.debug("Subscribed to Redis channel %s", channel)

    async def publish(self, event_type: EventType, payload: dict[str, Any]) -> None:
        """Broadcast a signal across the distributed substrate."""
        if not self._redis:
            raise RuntimeError("Redis event bus not connected — call connect() first")
        channel = f"{self._channel_prefix}{event_type.value}"
        message = json.dumps(payload)
        await self._redis.publish(channel, message)
        logger.debug("Published %s to Redis channel %s", event_type.value, channel)

    async def unsubscribe(self, event_type: EventType, handler: EventHandler | None = None) -> None:
        """Unsubscribe from a signal channel on the Redis substrate."""
        channel = f"{self._channel_prefix}{event_type.value}"
        if handler is None:
            self._subscribers[event_type] = []
        elif handler in self._subscribers[event_type]:
            self._subscribers[event_type].remove(handler)
        # Unsubscribe from Redis channel only if no handlers remain
        if not self._subscribers[event_type] and self._pubsub:
            await self._pubsub.unsubscribe(channel)
            logger.debug("Unsubscribed from Redis channel %s", channel)

    async def _listen_loop(self) -> None:
        """
        Continuous listener for Redis pub/sub messages.

        Field notes: this is the long-distance signal receptor.
        It converts Redis messages back into local handler invocations.
        """
        if not self._pubsub:
            return
        while self._running:
            try:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message["type"] == "message":
                    channel: str = message["channel"]
                    if isinstance(channel, bytes):
                        channel = channel.decode("utf-8")
                    # Strip prefix to recover EventType
                    event_name = channel.removeprefix(self._channel_prefix)
                    try:
                        event_type = EventType(event_name)
                    except ValueError:
                        logger.warning("Unknown signal type on channel %s", channel)
                        continue
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    payload: dict[str, Any] = json.loads(data)
                    for handler in self._subscribers[event_type]:
                        try:
                            await handler(payload)
                        except Exception as exc:
                            logger.error(
                                "Handler for %s raised: %s", event_type.value, exc
                            )
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Redis listener error: %s", exc)
                await asyncio.sleep(1)
