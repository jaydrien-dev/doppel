"""
Escalation helpers: formats the handoff message and determines routing.
"""
from __future__ import annotations


def format_escalation_message(clone_name: str, reason: str | None) -> str:
    """
    Returns a natural-language escalation message that sounds like
    the clone gracefully handing off, not breaking.
    """
    base = f"This is something I'd want to handle directly rather than through my clone."
    if reason:
        base += f" ({reason})"
    base += f" I'll have {clone_name} follow up with you personally."
    return base
