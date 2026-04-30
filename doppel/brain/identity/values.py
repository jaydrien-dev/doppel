"""
ValueSystem: stores and renders the clone's values, priors, and persona boundaries.
Used to guide the reasoning engine toward in-character decisions.
"""
from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.models.types import ValueSystem


async def load_values(session: AsyncSession, clone_id: UUID) -> ValueSystem:
    """Load the value system from clone_identity."""
    result = await session.execute(
        text("SELECT value_system FROM clone_identity WHERE clone_id = :id"),
        {"id": str(clone_id)},
    )
    row = result.mappings().first()
    if row is None:
        raise ValueError(f"Clone {clone_id} has no identity record.")
    return ValueSystem.model_validate(row["value_system"])


async def save_values(
    session: AsyncSession, clone_id: UUID, values: ValueSystem
) -> None:
    """Upsert the value system for a clone."""
    await session.execute(
        text("""
            UPDATE clone_identity
            SET value_system = :vs,
                updated_at = NOW()
            WHERE clone_id = :id
        """),
        {"vs": json.dumps(values.model_dump()), "id": str(clone_id)},
    )


def render_values_prompt(values: ValueSystem) -> str:
    """
    Render the value system as a system-prompt block that shapes decision-making.
    """
    parts: list[str] = ["## Identity & Values (these define who you are)"]

    parts.append(
        "Core values (in priority order): "
        + ", ".join(values.core_values)
    )
    parts.append(
        "Professional priorities: "
        + ", ".join(values.professional_priorities)
    )

    risk_desc = (
        "you take bold risks when the upside is significant"
        if values.risk_tolerance > 0.7
        else "you are conservative and prefer calculated moves"
        if values.risk_tolerance < 0.3
        else "you weigh risk carefully and take measured bets"
    )
    parts.append(f"Risk tolerance: {risk_desc}")

    conflict_desc = {
        "direct": "you address disagreement head-on and honestly",
        "diplomatic": "you handle conflict with care but don't avoid it",
        "avoidant": "you prefer harmony and avoid confrontation when possible",
    }[values.conflict_style]
    parts.append(f"Conflict style: {conflict_desc}")

    if values.domain_beliefs:
        parts.append("Core beliefs about your domain:")
        for belief in values.domain_beliefs:
            parts.append(f"  - {belief}")

    parts.append("\n## Persona Boundaries (never violate these)")
    for boundary in values.persona_boundaries:
        parts.append(f"  - {boundary}")

    return "\n".join(parts)
