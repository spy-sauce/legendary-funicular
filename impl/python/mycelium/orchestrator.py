# Mycelium Framework — VibeSpace LLC — The network provides.

"""
orchestrator.py — The root node of the mycelium network.

In nature, the oldest and largest hyphal node coordinates the entire
organism. It distributes chemical signals, monitors the health of every
tendril, resolves conflicts over territory, and decides when conditions
are right for fruiting. This is that node.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from .agent import AgentState, BaseAgent
from .bus import EventBus, EventType
from .health import HealthPulseEmitter

logger = logging.getLogger("mycelium.orchestrator")


@dataclass
class OrganismHealth:
    """
    A snapshot of the entire organism's vitality.

    Field notes: taken during periodic observation sweeps. A healthy
    network shows diverse states with no prolonged blockages.
    The health_score is a normalized reading — below 0.5 and the
    organism is in serious trouble.
    """

    agent_states: dict[str, str] = field(default_factory=dict)
    blocked_agents: list[str] = field(default_factory=list)
    unmatched_requests: list[dict[str, Any]] = field(default_factory=list)
    health_score: float = 1.0


class Orchestrator:
    """
    Root node — the oldest hypha that coordinates the organism.

    Responsibilities observed in field studies:
      - Distribute contracts (chemical signals) to the appropriate hyphae
      - Monitor organism-wide health through periodic observation
      - Resolve territorial conflicts between competing agents
      - Trigger fruiting when the organism is mature and healthy enough

    Specimen notes:
        The orchestrator never does metabolic work itself. It only
        coordinates. A root node that tries to do everything starves
        the network.
    """

    def __init__(
        self,
        *,
        agents: list[BaseAgent] | None = None,
        contracts: list[dict[str, Any]] | None = None,
        merge_order: list[str] | None = None,
        event_bus: EventBus | None = None,
        health_threshold: float = 0.8,
    ) -> None:
        self._agents: list[BaseAgent] = agents or []
        self._contracts: list[dict[str, Any]] = contracts or []
        self._merge_order: list[str] = merge_order or []
        self._event_bus: EventBus | None = event_bus
        self._health_threshold: float = health_threshold
        self._pulse_emitters: list[HealthPulseEmitter] = []
        self._unmatched_requests: list[dict[str, Any]] = []
        self._monitoring: bool = False
        self._monitor_task: asyncio.Task[None] | None = None

    # -- Observable properties ------------------------------------------------

    @property
    def agents(self) -> list[BaseAgent]:
        """All hyphae registered in this organism."""
        return list(self._agents)

    @property
    def contracts(self) -> list[dict[str, Any]]:
        """Chemical signals (contracts) held by the root node."""
        return list(self._contracts)

    @property
    def merge_order(self) -> list[str]:
        """The sequence in which agents merge their fruits into the whole."""
        return list(self._merge_order)

    # -- Agent management -----------------------------------------------------

    def register_agent(self, agent: BaseAgent) -> None:
        """
        Graft a new hypha onto the network.

        Field notes: newly grafted hyphae must be set to DORMANT before
        they can germinate. The organism accepts them, but they must
        prove viability.
        """
        if agent.id in {a.id for a in self._agents}:
            logger.warning("Hypha %s already grafted — ignoring duplicate", agent.id)
            return
        self._agents.append(agent)
        if agent.id not in self._merge_order:
            self._merge_order.append(agent.id)
        logger.info("Grafted hypha %s onto the network", agent.id)

    # -- Lifecycle orchestration ----------------------------------------------

    async def cultivate(self) -> None:
        """
        Begin the growth cycle — distribute contracts and germinate all agents.

        Field notes: cultivation involves three phases:
          1. Distribute contracts to agents based on ownership
          2. Set every agent to GERMINATING
          3. Start the health-monitoring mycelial pulse

        After cultivation, the organism is alive and sensing its environment.
        """
        logger.info("Cultivation beginning — distributing contracts to %d hyphae", len(self._agents))

        # Phase 1: nutrient distribution — each contract flows to its owner
        for contract in self._contracts:
            owner_id = contract.get("owner", "")
            for agent in self._agents:
                if agent.id == owner_id:
                    await agent.absorb(contract)
                    logger.debug("Fed contract %s to hypha %s", contract.get("name"), agent.id)
                    break
            else:
                logger.warning(
                    "Contract %s has no matching hypha (owner: %s)",
                    contract.get("name"),
                    owner_id,
                )

        # Phase 2: germination — wake every spore
        for agent in self._agents:
            if agent.state == AgentState.DORMANT:
                agent.germinate()
                logger.debug("Germinated hypha %s", agent.id)

        # Phase 3: begin health monitoring
        await self._start_monitoring()
        logger.info("Cultivation complete — organism is alive")

    async def observe(self) -> OrganismHealth:
        """
        Perform an observation sweep of the entire organism.

        Returns an OrganismHealth snapshot. The mycologist peers through
        the substrate and records what they see.
        """
        agent_states: dict[str, str] = {}
        blocked_agents: list[str] = []

        for agent in self._agents:
            agent_states[agent.id] = agent.state.value
            try:
                pulse = await agent.signal()
                blockers = pulse.get("blockers", [])
                if blockers:
                    blocked_agents.append(agent.id)
            except Exception:
                # Silent agent — assumed dead or degraded
                blocked_agents.append(agent.id)
                logger.warning("Hypha %s failed to pulse during observation", agent.id)

        # Compute health score: ratio of non-blocked, non-dormant agents
        total = len(self._agents)
        if total == 0:
            score = 0.0
        else:
            active_healthy = sum(
                1
                for a in self._agents
                if a.id not in blocked_agents and a.state != AgentState.DORMANT
            )
            score = active_healthy / total

        return OrganismHealth(
            agent_states=agent_states,
            blocked_agents=blocked_agents,
            unmatched_requests=list(self._unmatched_requests),
            health_score=score,
        )

    async def resolve(self, conflict: dict[str, Any]) -> dict[str, Any]:
        """
        Resolve a territorial conflict between hyphae.

        Field notes: in nature, competing hyphae form barrage zones.
        The orchestrator mediates by examining merge_order priority —
        earlier agents in the order have territorial precedence.

        Args:
            conflict: A dict describing the conflict with keys
                      'agent_a', 'agent_b', 'resource'.

        Returns:
            Resolution dict with 'winner', 'loser', and 'reason'.
        """
        agent_a_id: str = conflict.get("agent_a", "")
        agent_b_id: str = conflict.get("agent_b", "")

        # Merge order determines territorial precedence
        a_position = (
            self._merge_order.index(agent_a_id) if agent_a_id in self._merge_order else float("inf")
        )
        b_position = (
            self._merge_order.index(agent_b_id) if agent_b_id in self._merge_order else float("inf")
        )

        if a_position <= b_position:
            winner, loser = agent_a_id, agent_b_id
        else:
            winner, loser = agent_b_id, agent_a_id

        resolution = {
            "winner": winner,
            "loser": loser,
            "resource": conflict.get("resource", "unknown"),
            "reason": "merge_order_precedence",
        }

        if self._event_bus:
            await self._event_bus.publish(EventType.CONTRACT_UPDATE, resolution)

        logger.info("Conflict resolved: %s over %s (merge-order precedence)", winner, loser)
        return resolution

    async def harvest(self) -> list[Any]:
        """
        Harvest the fruiting bodies — collect deliverables from the organism.

        Field notes: harvesting is only safe when the organism is healthy.
        Premature harvest damages the mycelium and produces incomplete fruits.
        The health_score must exceed the configured threshold.

        Returns:
            A list of fruits (deliverables) from agents in FRUITING state.

        Raises:
            RuntimeError: If organism health is below threshold.
        """
        health = await self.observe()
        if health.health_score < self._health_threshold:
            raise RuntimeError(
                f"Organism too weak to harvest — health {health.health_score:.2f} "
                f"below threshold {self._health_threshold:.2f}. "
                f"Blocked hyphae: {health.blocked_agents}"
            )

        fruits: list[Any] = []
        # Harvest in merge order for deterministic output
        ordered_agents = sorted(
            self._agents,
            key=lambda a: (
                self._merge_order.index(a.id) if a.id in self._merge_order else len(self._merge_order)
            ),
        )

        for agent in ordered_agents:
            if agent.state == AgentState.FRUITING:
                try:
                    product = await agent.fruit()
                    fruits.append({"agent_id": agent.id, "scope": agent.scope, "fruit": product})
                    logger.info("Harvested fruit from hypha %s", agent.id)
                except Exception as exc:
                    logger.error("Failed to harvest from %s: %s", agent.id, exc)

        if self._event_bus:
            await self._event_bus.publish(
                EventType.FRUIT_READY,
                {"count": len(fruits), "agents": [f["agent_id"] for f in fruits]},
            )

        logger.info("Harvest complete — %d fruits collected", len(fruits))
        return fruits

    # -- Internal monitoring --------------------------------------------------

    async def _start_monitoring(self) -> None:
        """Spin up the health-monitoring coroutine."""
        if self._monitoring:
            return
        self._monitoring = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def _monitor_loop(self) -> None:
        """
        Periodic observation loop — the organism's autonomic nervous system.

        Runs until monitoring is disabled. Emits health observations
        to the event bus so the whole network stays informed.
        """
        while self._monitoring:
            try:
                health = await self.observe()
                if self._event_bus:
                    await self._event_bus.publish(
                        EventType.HEALTH_PULSE,
                        {
                            "source": "orchestrator",
                            "health_score": health.health_score,
                            "blocked": health.blocked_agents,
                        },
                    )
                if health.health_score < 0.5:
                    logger.warning(
                        "Organism critically unhealthy — score %.2f", health.health_score
                    )
            except Exception as exc:
                logger.error("Monitoring sweep failed: %s", exc)
            await asyncio.sleep(30)

    async def shutdown(self) -> None:
        """Gracefully shut down the organism — enter full dormancy."""
        self._monitoring = False
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        logger.info("Organism entering dormancy — all monitoring ceased")
