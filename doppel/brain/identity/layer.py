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
from doppel.brain.models.types import EpistemicProfile, StyleFingerprint, ValueSystem

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

    def __init__(self, style: StyleFingerprint, values: ValueSystem, epistemic: EpistemicProfile, clone_name: str):
        self.style = style
        self.values = values
        self.epistemic = epistemic
        self.clone_name = clone_name

    @classmethod
    async def load(cls, session: AsyncSession, clone_id: UUID) -> "IdentityLayer":
        key = str(clone_id)
        cached = _IDENTITY_CACHE.get(key)
        if cached and (time.monotonic() - cached[0]) < _IDENTITY_TTL:
            return cached[1]

        style, values, epistemic = await _load_all(session, clone_id)
        from sqlalchemy import text
        result = await session.execute(
            text("SELECT display_name FROM clone_identity WHERE clone_id = :id"),
            {"id": str(clone_id)},
        )
        row = result.mappings().first()
        name = row["display_name"] if row else "Unknown"
        identity = cls(style=style, values=values, epistemic=epistemic, clone_name=name)
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
            "## STRICT KNOWLEDGE BOUNDARY — NON-NEGOTIABLE\n"
            "You may ONLY answer using the memories and context provided in the prompt.\n"
            "You MUST NOT use your general training knowledge, world knowledge, or any information\n"
            "not explicitly present in the retrieved memories block.\n"
            "If the retrieved memories do not contain enough information to answer the question,\n"
            f"you MUST respond that {self.clone_name}'s clone is not familiar with that topic.\n"
            "Never guess, infer, or fill gaps with general knowledge — not even to be helpful.\n\n"
            + render_values_prompt(self.values)
            + "\n\n"
            + render_epistemic_prompt(self.epistemic)
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


def render_epistemic_prompt(ep: EpistemicProfile) -> str:
    """
    Render the epistemic profile as a prompt block that shapes how the clone
    reasons through decisions and advice requests.
    """
    parts: list[str] = ["## Decision-Making & Reasoning"]

    if ep.decision_approach:
        parts.append(f"Decision approach: {ep.decision_approach}")

    if ep.confidence_style:
        parts.append(f"Confidence style: {ep.confidence_style}")

    if ep.reasoning_frameworks:
        parts.append("Reasoning frameworks you rely on: " + ", ".join(ep.reasoning_frameworks))

    if ep.preferred_evidence_types:
        parts.append(
            "Evidence you trust most: "
            + ", ".join(ep.preferred_evidence_types)
        )

    if ep.knowledge_domains:
        parts.append("Deep expertise in: " + ", ".join(ep.knowledge_domains))

    parts.append(
        "\nWhen asked for a recommendation or decision, apply these frameworks explicitly. "
        "Walk through the relevant trade-offs in the way this person actually thinks. "
        "Do not give generic advice — ground every answer in these specific preferences."
    )

    return "\n".join(parts)


async def _load_all(
    session: AsyncSession, clone_id: UUID
) -> tuple[StyleFingerprint, ValueSystem, EpistemicProfile]:
    """Load all three identity components. Run sequentially — AsyncSession is not concurrent-safe."""
    from sqlalchemy import text as _text
    style  = await load_style(session, clone_id)
    values = await load_values(session, clone_id)

    # Load epistemic_profile from clone_identity
    row = await session.execute(
        _text("SELECT epistemic_profile FROM clone_identity WHERE clone_id = :id"),
        {"id": str(clone_id)},
    )
    rec = row.mappings().first()
    raw_ep = (rec["epistemic_profile"] if rec and rec["epistemic_profile"] else {})
    epistemic = EpistemicProfile.model_validate(raw_ep if isinstance(raw_ep, dict) else {})

    return style, values, epistemic
