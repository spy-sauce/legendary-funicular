# Mycelium Framework — VibeSpace LLC — The network provides.

"""
agent.py — The fundamental hyphal unit.

Every agent is a single hypha in the mycelium network: it senses its
environment, absorbs nutrients (contracts), grows toward light (goals),
and occasionally fruits when conditions are right. A hypha that stops
signaling is assumed dead by the organism.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any


class AgentState(Enum):
    """
    Lifecycle stages of a hyphal node, mirroring fungal development.

    Field notes: spore → germination → vegetative growth → nutrient transport
    → fruiting body formation → dormancy. The circle of life underground.
    """

    GERMINATING = "GERMINATING"
    GROWING = "GROWING"
    FLOWING = "FLOWING"
    FRUITING = "FRUITING"
    DORMANT = "DORMANT"

    @property
    def emoji(self) -> str:
        """Visual marker for field observation logs."""
        _emoji_map: dict[AgentState, str] = {
            AgentState.GERMINATING: "\U0001f331",   # seedling
            AgentState.GROWING: "\U0001f33f",        # herb
            AgentState.FLOWING: "\U0001f30a",        # wave
            AgentState.FRUITING: "\U0001f344",       # mushroom
            AgentState.DORMANT: "\U0001f319",        # crescent moon
        }
        return _emoji_map[self]


# -- Transition table --------------------------------------------------------
# Observed in the wild: hyphae follow strict developmental pathways.
# Jumping stages kills the organism. Any state may collapse to DORMANT
# (environmental stress, nutrient deprivation, or planned senescence).

_LEGAL_TRANSITIONS: dict[AgentState, set[AgentState]] = {
    AgentState.GERMINATING: {AgentState.GROWING, AgentState.DORMANT},
    AgentState.GROWING: {AgentState.FLOWING, AgentState.FRUITING, AgentState.DORMANT},
    AgentState.FLOWING: {AgentState.FRUITING, AgentState.GROWING, AgentState.DORMANT},
    AgentState.FRUITING: {AgentState.DORMANT},
    AgentState.DORMANT: {AgentState.GERMINATING},
}


class IllegalTransitionError(Exception):
    """Raised when a hypha attempts to skip a developmental stage."""


class BaseAgent(ABC):
    """
    Abstract base class for all hyphal agents in the network.

    Each agent maintains its own state, knows its position in the organism,
    and communicates through chemical signals (events) on the bus.

    Specimen notes:
        - `scope` is the territory this hypha has claimed
        - `lane` is the mycelial cord it travels along (merge lane)
        - `capabilities` are the enzymes it can secrete
        - `dependencies` are the nutrients it requires from neighbors
    """

    def __init__(
        self,
        *,
        agent_id: str | None = None,
        scope: str = "",
        lane: str = "main",
        capabilities: list[str] | None = None,
        dependencies: list[str] | None = None,
    ) -> None:
        self._id: str = agent_id or f"hypha-{uuid.uuid4().hex[:8]}"
        self._scope: str = scope
        self._lane: str = lane
        self._state: AgentState = AgentState.DORMANT
        self._capabilities: list[str] = capabilities or []
        self._dependencies: list[str] = dependencies or []
        self._absorbed_contracts: list[dict[str, Any]] = []

    # -- Observable properties ------------------------------------------------

    @property
    def id(self) -> str:
        """Unique identifier — the genetic fingerprint of this hypha."""
        return self._id

    @property
    def scope(self) -> str:
        """Territory claimed by this agent in the substrate."""
        return self._scope

    @property
    def lane(self) -> str:
        """Mycelial cord (merge lane) this agent travels along."""
        return self._lane

    @property
    def state(self) -> AgentState:
        """Current developmental stage."""
        return self._state

    @property
    def capabilities(self) -> list[str]:
        """Enzymes this agent can secrete — what it offers the network."""
        return list(self._capabilities)

    @property
    def dependencies(self) -> list[str]:
        """Nutrients this agent requires from neighboring hyphae."""
        return list(self._dependencies)

    # -- State machine -------------------------------------------------------

    def _transition(self, new_state: AgentState) -> None:
        """
        Attempt a developmental transition.

        Field notes: hyphae follow strict morphogenetic pathways.
        Forcing a spore to fruit without germination first produces
        nothing but rot. The transition table is law.

        Raises:
            IllegalTransitionError: If the transition violates the lifecycle.
        """
        allowed = _LEGAL_TRANSITIONS.get(self._state, set())
        if new_state not in allowed:
            raise IllegalTransitionError(
                f"Hypha {self._id} cannot transition "
                f"{self._state.value} -> {new_state.value}. "
                f"Legal targets from {self._state.value}: "
                f"{sorted(s.value for s in allowed)}"
            )
        self._state = new_state

    # -- Abstract lifecycle methods ------------------------------------------

    @abstractmethod
    async def sense(self) -> dict[str, Any]:
        """
        Probe the environment — chemotaxis.

        Returns a snapshot of what this hypha perceives: available contracts,
        neighbor states, resource gradients. The first step before any growth.
        """

    @abstractmethod
    async def execute(self) -> Any:
        """
        Perform the primary metabolic work of this hypha.

        This is the vegetative growth phase — the agent processes its
        absorbed contracts and produces deliverables.
        """

    @abstractmethod
    async def flow(self, target_agent: BaseAgent) -> dict[str, Any]:
        """
        Direct nutrient flow toward another hypha.

        Mycelial networks redistribute resources to where they are
        needed most. This method packages capabilities and sends them
        along the cord to the target agent.
        """

    @abstractmethod
    async def signal(self) -> dict[str, Any]:
        """
        Emit a health pulse — the heartbeat of the organism.

        Silent hyphae are assumed dead. Every living node must pulse
        at regular intervals so the orchestrator can track organism health.
        """

    @abstractmethod
    async def absorb(self, contract: dict[str, Any]) -> None:
        """
        Absorb a contract from the substrate.

        The hypha takes in a chemical signal (contract) and integrates
        it into its metabolic processes. This is how work gets assigned.
        """

    @abstractmethod
    async def fruit(self) -> Any:
        """
        Produce a fruiting body — the visible output of the organism.

        Only possible in the FRUITING state. This is the harvest:
        compiled code, generated artifacts, completed deliverables.
        """

    # -- Convenience helpers -------------------------------------------------

    def germinate(self) -> None:
        """Begin the lifecycle — crack the spore coat and start growing."""
        self._transition(AgentState.GERMINATING)

    def __repr__(self) -> str:
        return (
            f"<{self.__class__.__name__} id={self._id!r} "
            f"scope={self._scope!r} state={self._state.emoji} {self._state.value}>"
        )
