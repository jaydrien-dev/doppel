"""
Router: decides whether a given input should take the fast or slow reasoning path.

Fast path (System 1): low-stakes questions, social, simple tasks.
Slow path (System 2): decisions, high-stakes queries, novel situations, anything requiring deliberation.
"""
from __future__ import annotations

from doppel.brain.models.types import PerceivedInput
from doppel.config import settings

# Inputs that always trigger the slow path regardless of stakes
_ALWAYS_SLOW_INTENTS = {"decision"}

# Stakes levels that force slow path (configurable via settings)
_SLOW_STAKES = {"high"}
if settings.slow_path_stakes_threshold == "medium":
    _SLOW_STAKES.add("medium")


def route(perceived: PerceivedInput) -> str:
    """
    Returns "fast" or "slow".

    Slow path is triggered by:
    - intent == "decision" (always needs deliberation)
    - stakes == "high" (or "medium" if threshold is set that way)
    - is_novel == True (unknown territory = deliberate carefully)
    - requires_decision == True (explicit ask for a choice)
    - urgency > 0.8 (high urgency paradoxically needs careful thought)
    """
    if perceived.intent in _ALWAYS_SLOW_INTENTS:
        return "slow"
    if perceived.stakes in _SLOW_STAKES:
        return "slow"
    if perceived.is_novel:
        return "slow"
    if perceived.requires_decision:
        return "slow"
    return "fast"
