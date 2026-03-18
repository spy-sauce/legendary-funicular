# Mycelium Framework — VibeSpace LLC — The network provides.

"""
flow.py — The nutrient flow algorithm.

In a mycelium network, nutrients don't flow randomly. They move along
gradients — from areas of abundance to areas of need, following the
path of least resistance. This module implements that logic: given an
agent with spare capacity and a set of pending requests, it finds the
best match based on urgency, capability overlap, and proximity in the
merge order.

The scoring function is a product of three factors:
    score = urgency_weight x capability_overlap x proximity

Think of it as chemotaxis: the agent is drawn toward the strongest
chemical gradient (highest urgency), filtered by metabolic compatibility
(capability overlap), and weighted by physical distance in the hyphal
network (merge order proximity).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("mycelium.flow")

# -- Urgency weights --------------------------------------------------------
# Field notes: critical requests emit the strongest chemical signal,
# overwhelming all other gradients. Low-urgency requests are background
# noise — addressed only when nothing else demands attention.

URGENCY_WEIGHTS: dict[str, float] = {
    "critical": 4.0,
    "high": 3.0,
    "normal": 2.0,
    "low": 1.0,
}


def _jaccard_similarity(set_a: set[str], set_b: set[str]) -> float:
    """
    Jaccard index — the overlap coefficient between two sets.

    Field notes: this measures metabolic compatibility. Two hyphae
    with identical enzyme profiles have a Jaccard index of 1.0.
    Two with no overlap are incompatible (0.0). In nature, only
    compatible strains can exchange nutrients.
    """
    if not set_a and not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def _proximity_score(agent_position: int, request_position: int) -> float:
    """
    Proximity in the merge order — closeness in the hyphal network.

    Field notes: nutrients flow more easily between adjacent hyphae.
    The further apart two nodes are in the merge order, the more
    resistance the signal encounters. Score = 1 / (1 + distance).

    Adjacent hyphae (distance 0): score 1.0
    One apart: 0.5
    Two apart: 0.33
    And so on — exponential decay of signal strength.
    """
    distance = abs(agent_position - request_position)
    return 1.0 / (1.0 + distance)


@dataclass(frozen=True)
class FlowMatch:
    """
    A scored match between a flowing agent and a pending request.

    Field notes: each match is like a potential nutrient pathway.
    The score determines how "bright" the chemical gradient is —
    the agent will follow the strongest gradient.
    """

    request: dict[str, Any]
    urgency_score: float
    overlap_score: float
    proximity_score: float
    total_score: float


class NutrientMatcher:
    """
    The chemotaxis engine — matches agents to nutrient requests.

    Given an agent with available capacity and a list of pending
    nutrient requests, this class scores every possible match and
    returns the strongest gradient.

    Specimen notes:
        The merge_order list is essential for proximity scoring.
        Without it, all agents are considered equidistant and only
        urgency and capability overlap matter.
    """

    def __init__(self, merge_order: list[str] | None = None) -> None:
        self._merge_order: list[str] = merge_order or []

    def _agent_position(self, agent_id: str) -> int:
        """
        Find the position of an agent in the merge order.

        Agents not in the merge order are placed at the far end —
        they exist but are distant from everything.
        """
        try:
            return self._merge_order.index(agent_id)
        except ValueError:
            return len(self._merge_order)

    def score(self, agent_capabilities: set[str], agent_id: str, request: dict[str, Any]) -> FlowMatch:
        """
        Score a single agent-request pairing.

        Field notes: the three-factor scoring produces a composite
        gradient strength. All three must be nonzero for nutrients
        to flow — you can't feed a hypha that doesn't need what
        you have, no matter how urgent or close.

        Args:
            agent_capabilities: What enzymes the flowing agent can secrete.
            agent_id: The flowing agent's identifier.
            request: A nutrient request dict (matches nutrient-request schema).

        Returns:
            A FlowMatch with individual and total scores.
        """
        # Factor 1: urgency — how loud is the chemical signal?
        urgency = request.get("urgency", "normal")
        urgency_weight = URGENCY_WEIGHTS.get(urgency, URGENCY_WEIGHTS["normal"])

        # Factor 2: capability overlap — metabolic compatibility
        requested_capabilities = set(request.get("capabilities", []))
        overlap = _jaccard_similarity(agent_capabilities, requested_capabilities)

        # Factor 3: proximity — distance in the hyphal network
        requester_id = request.get("agentId", "")
        agent_pos = self._agent_position(agent_id)
        requester_pos = self._agent_position(requester_id)
        proximity = _proximity_score(agent_pos, requester_pos)

        total = urgency_weight * overlap * proximity

        return FlowMatch(
            request=request,
            urgency_score=urgency_weight,
            overlap_score=overlap,
            proximity_score=proximity,
            total_score=total,
        )

    def match(
        self,
        agent_capabilities: set[str],
        agent_id: str,
        pending_requests: list[dict[str, Any]],
    ) -> FlowMatch | None:
        """
        Find the best nutrient request for a flowing agent.

        Scores all pending requests and returns the one with the
        strongest gradient (highest total score). Returns None if
        no viable match exists (all scores are zero).

        Field notes: this is the moment of chemotaxis — the hypha
        extends toward the strongest signal. If nothing calls, it
        stays put.

        Args:
            agent_capabilities: What the flowing agent can offer.
            agent_id: The flowing agent's identifier.
            pending_requests: List of unresolved nutrient request dicts.

        Returns:
            The highest-scoring FlowMatch, or None if no viable match.
        """
        if not pending_requests:
            logger.debug("No pending requests — hypha %s has nothing to flow toward", agent_id)
            return None

        scored: list[FlowMatch] = []
        for request in pending_requests:
            # Skip resolved requests — the signal has been consumed
            if request.get("resolved", False):
                continue
            flow_match = self.score(agent_capabilities, agent_id, request)
            if flow_match.total_score > 0:
                scored.append(flow_match)

        if not scored:
            logger.debug("No viable matches for hypha %s — all gradients are zero", agent_id)
            return None

        # Follow the strongest gradient
        best = max(scored, key=lambda m: m.total_score)
        logger.info(
            "Hypha %s matched to request from %s (score: %.3f = urgency:%.1f x overlap:%.3f x proximity:%.3f)",
            agent_id,
            best.request.get("agentId", "unknown"),
            best.total_score,
            best.urgency_score,
            best.overlap_score,
            best.proximity_score,
        )
        return best
