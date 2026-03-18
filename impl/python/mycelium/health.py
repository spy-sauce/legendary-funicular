# Mycelium Framework — VibeSpace LLC — The network provides.

"""
health.py — The organism's pulse.

Every living hypha emits a rhythmic health signal — a chemical pulse
that tells the network "I am alive, I am here, this is what I'm doing."
A hypha that goes silent is presumed dead. The network routes around it.

The pulse format is designed to be read by both machines and mycologists
standing in the field with a notebook.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .agent import AgentState, BaseAgent
from .bus import EventBus, EventType

logger = logging.getLogger("mycelium.health")


@dataclass
class HealthPulse:
    """
    A single heartbeat from a hyphal node.

    Matches the health-signal.schema.json specification. Each field
    is a vital sign — together they paint a picture of the hypha's
    condition.

    Field notes:
        - agentId: who is pulsing
        - scope: what territory they claim
        - state: developmental stage (see AgentState)
        - progress: how far along their metabolic work
        - health: self-assessed vitality
        - blockers: what's preventing growth
        - flowStatus: nutrient transport availability
        - message: free-form field notes from the hypha
    """

    agent_id: str
    scope: str
    state: AgentState
    timestamp: str = ""
    completed: int = 0
    total: int = 0
    percentage: float = 0.0
    current_task: str = ""
    health: str = "healthy"
    blockers: list[dict[str, Any]] = field(default_factory=list)
    flow_available: bool = True
    flowing_to: str | None = None
    capabilities: list[str] = field(default_factory=list)
    message: str = ""

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize to the schema-compliant dictionary form.

        This is the signal that actually travels through the substrate.
        """
        pulse: dict[str, Any] = {
            "agentId": self.agent_id,
            "scope": self.scope,
            "state": self.state.value,
            "timestamp": self.timestamp,
            "progress": {
                "completed": self.completed,
                "total": self.total,
                "percentage": self.percentage,
                "currentTask": self.current_task,
            },
            "health": self.health,
            "blockers": self.blockers,
            "flowStatus": {
                "available": self.flow_available,
                "capabilities": self.capabilities,
            },
            "message": self.message,
        }
        if self.flowing_to:
            pulse["flowStatus"]["flowingTo"] = self.flowing_to
        return pulse


def format_pulse(pulse: HealthPulse) -> str:
    """
    Render a health pulse as a human-readable log line.

    Format: [AGENT-{id}:{SCOPE}] {emoji} {msg} | {flow} | network {health}

    Field notes: this is the format you'd see in a mycologist's logbook.
    Concise, scannable, and informative at a glance.

    Example:
        [AGENT-hypha-a1b2:auth] 🌿 Building login flow | flowing to hypha-c3d4 | network healthy
    """
    state_emoji = pulse.state.emoji

    # Flow status description
    if pulse.flowing_to:
        flow_desc = f"flowing to {pulse.flowing_to}"
    elif pulse.flow_available:
        flow_desc = "available for flow"
    else:
        flow_desc = "no flow"

    msg = pulse.message or pulse.current_task or pulse.state.value.lower()

    return (
        f"[AGENT-{pulse.agent_id}:{pulse.scope}] "
        f"{state_emoji} {msg} | {flow_desc} | network {pulse.health}"
    )


class HealthPulseEmitter:
    """
    Periodic pulse emitter — keeps a hypha's heartbeat visible to the network.

    Attach one emitter per agent. It wakes at a configurable interval,
    collects the agent's vital signs, formats a pulse, and broadcasts
    it on the event bus.

    Field notes: the default interval is 30 seconds. Faster pulses
    mean quicker detection of dead hyphae but more substrate traffic.
    Tune based on organism size.
    """

    def __init__(
        self,
        agent: BaseAgent,
        event_bus: EventBus,
        interval_seconds: float = 30.0,
    ) -> None:
        self._agent: BaseAgent = agent
        self._event_bus: EventBus = event_bus
        self._interval: float = interval_seconds
        self._running: bool = False
        self._task: asyncio.Task[None] | None = None

    @property
    def agent_id(self) -> str:
        """The hypha this emitter is attached to."""
        return self._agent.id

    @property
    def running(self) -> bool:
        """Whether the emitter is actively pulsing."""
        return self._running

    async def start(self) -> None:
        """Begin emitting periodic health pulses."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._pulse_loop())
        logger.info("Pulse emitter started for hypha %s (interval: %.1fs)", self._agent.id, self._interval)

    async def stop(self) -> None:
        """Cease pulsing — the hypha goes silent."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Pulse emitter stopped for hypha %s", self._agent.id)

    async def emit_once(self) -> HealthPulse:
        """
        Emit a single pulse — useful for on-demand health checks.

        Collects vital signs from the agent, formats the pulse,
        publishes it to the bus, and returns the pulse object.
        """
        # Gather vital signs from the agent
        try:
            signal_data = await self._agent.signal()
        except Exception:
            signal_data = {}

        pulse = HealthPulse(
            agent_id=self._agent.id,
            scope=self._agent.scope,
            state=self._agent.state,
            completed=signal_data.get("completed", 0),
            total=signal_data.get("total", 0),
            percentage=signal_data.get("percentage", 0.0),
            current_task=signal_data.get("currentTask", ""),
            health=signal_data.get("health", "healthy"),
            blockers=signal_data.get("blockers", []),
            flow_available=signal_data.get("flowAvailable", True),
            flowing_to=signal_data.get("flowingTo"),
            capabilities=self._agent.capabilities,
            message=signal_data.get("message", ""),
        )

        # Broadcast the pulse
        await self._event_bus.publish(EventType.HEALTH_PULSE, pulse.to_dict())

        # Log the human-readable format
        logger.info(format_pulse(pulse))

        return pulse

    async def _pulse_loop(self) -> None:
        """
        The heartbeat loop — rhythmic and relentless.

        Field notes: a healthy hypha pulses like clockwork. Irregular
        pulses suggest stress. Missing pulses mean death.
        """
        while self._running:
            try:
                await self.emit_once()
            except Exception as exc:
                logger.error("Pulse emission failed for %s: %s", self._agent.id, exc)
            await asyncio.sleep(self._interval)
