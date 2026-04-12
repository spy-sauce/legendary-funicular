# Mycelium Framework — VibeSpace LLC — The network provides.

"""
mycelium — Agentic execution framework.

A network of autonomous agents that sense, grow, flow nutrients,
and fruit — just like a living fungal organism beneath the forest floor.

Import the pieces you need and let the network provide.
"""

from .agent import AgentState, BaseAgent, IllegalTransitionError
from .bus import EventBus, EventType, LocalEventBus, RedisEventBus
from .contracts import (
    ContractViolationError,
    freeze_contracts,
    load_contract,
    load_contracts_from_directory,
    validate_contract,
)
from .flow import FlowMatch, NutrientMatcher
from .health import HealthPulse, HealthPulseEmitter, format_pulse
from .adapters.claude_code import ClaudeCodeAgent, PetriDishCoordinator
from .orchestrator import Orchestrator, OrganismHealth

__all__ = [
    # Agent layer
    "AgentState",
    "BaseAgent",
    "IllegalTransitionError",
    # Bus layer
    "EventBus",
    "EventType",
    "LocalEventBus",
    "RedisEventBus",
    # Contracts
    "ContractViolationError",
    "freeze_contracts",
    "load_contract",
    "load_contracts_from_directory",
    "validate_contract",
    # Flow
    "FlowMatch",
    "NutrientMatcher",
    # Health
    "HealthPulse",
    "HealthPulseEmitter",
    "format_pulse",
    # Orchestrator
    "Orchestrator",
    "OrganismHealth",
    # Adapters
    "ClaudeCodeAgent",
    "PetriDishCoordinator",
]
