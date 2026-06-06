"""
IdentityLayer: loads and exposes the full identity (style + values) for a clone.
Acts as the authoritative source of "who this clone is" for all other layers.

Identity is cached in-process with a 5-minute TTL — clone identity rarely changes
mid-session and loading it on every request adds 3 unnecessary DB round-trips.
"""
from __future__ import annotations

import time
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.identity.style import load_style, render_style_prompt
from doppel.brain.identity.values import load_values, render_values_prompt
from doppel.brain.models.types import StyleFingerprint, ValueSystem

# ── In-process identity cache ─────────────────────────────────────────────────
# Keyed by str(clone_id). Value is (loaded_at_timestamp, IdentityLayer).
# Single-threaded asyncio — no locking needed.
_IDENTITY_CACHE: dict[str, tuple[float, "IdentityLayer"]] = {}
_IDENTITY_TTL = 300.0  # seconds


def invalidate_identity_cache(clone_id: UUID | str) -> None:
    """Call after identity updates (style/values saved) to force a fresh load."""
    _IDENTITY_CACHE.pop(str(clone_id), None)


class IdentityLayer:
    """
    Loaded once per request. Provides the rendered identity blocks
    that get injected into every LLM call.
    """

    def __init__(self, style: StyleFingerprint, values: ValueSystem, clone_name: str):
        self.style = style
        self.values = values
        self.clone_name = clone_name

    @classmethod
    async def load(cls, session: AsyncSession, clone_id: UUID) -> "IdentityLayer":
        key = str(clone_id)
        cached = _IDENTITY_CACHE.get(key)
        if cached and (time.monotonic() - cached[0]) < _IDENTITY_TTL:
            return cached[1]

        style, values = await _load_both(session, clone_id)
        # Fetch the display name separately
        from sqlalchemy import text
        result = await session.execute(
            text("SELECT display_name FROM clone_identity WHERE clone_id = :id"),
            {"id": str(clone_id)},
        )
        row = result.mappings().first()
        name = row["display_name"] if row else "Unknown"
        identity = cls(style=style, values=values, clone_name=name)
        _IDENTITY_CACHE[key] = (time.monotonic(), identity)
        return identity

    def render_persona_block(self) -> str:
        """
        Full system-prompt identity block injected into every LLM call.
        Describes who the clone is, how they write, and what they stand for.
        """
        return (
            f"# You are {self.clone_name}'s Doppel AI clone\n"
            "You think, communicate, and make decisions exactly as they do.\n"
            "You are NOT a generic assistant — you ARE their digital representation.\n"
            "You always identify yourself as an AI clone when directly asked.\n\n"
            + render_values_prompt(self.values)
            + "\n\n"
            + render_style_prompt(self.style)
        )

    def enforce_boundaries(self, response: str) -> tuple[bool, str | None]:
        """
        Quick check: does the response violate any persona boundary?
        Returns (is_safe, violation_description).
        This is a lightweight heuristic check — the LLM's own boundaries
        are the primary defense; this catches obvious slips.
        """
        lower = response.lower()
        violations = []

        if "i am " + self.clone_name.lower() in lower and "clone" not in lower:
            violations.append("Response may be claiming to be the real person")

        if any(phrase in lower for phrase in ["i commit to", "i promise to pay", "we will pay"]):
            violations.append("Response may be making unauthorized financial commitments")

        if violations:
            return False, "; ".join(violations)
        return True, None


async def _load_both(
    session: AsyncSession, clone_id: UUID
) -> tuple[StyleFingerprint, ValueSystem]:
    import asyncio
    style_task = asyncio.create_task(load_style(session, clone_id))
    values_task = asyncio.create_task(load_values(session, clone_id))
    style = await style_task
    values = await values_task
    return style, values
