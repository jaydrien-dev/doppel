"""
Procedural memory: how the user typically handles types of situations.
Decision heuristics, communication norms, and priority rules.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.db.vector import embed, similarity_search
from doppel.brain.models.types import DecisionPattern


async def store_pattern(
    session: AsyncSession,
    clone_id: UUID,
    pattern_type: str,
    description: str,
    examples: list[str] | None = None,
    confidence: float = 0.7,
) -> UUID:
    """Embed and store a procedural pattern."""
    embedding = await embed(description)
    pattern_id = uuid4()

    await session.execute(
        text("""
            INSERT INTO procedural_memory
              (id, clone_id, pattern_type, description, embedding, examples, confidence)
            VALUES
              (:id, :clone_id, :pattern_type, :description, :embedding, :examples, :confidence)
            ON CONFLICT DO NOTHING
        """),
        {
            "id": str(pattern_id),
            "clone_id": str(clone_id),
            "pattern_type": pattern_type,
            "description": description,
            "embedding": "[" + ",".join(str(v) for v in embedding) + "]",
            "examples": examples or [],
            "confidence": confidence,
        },
    )
    return pattern_id


async def reinforce_pattern(session: AsyncSession, pattern_id: UUID) -> None:
    """Increment occurrence count and refresh last_reinforced timestamp."""
    await session.execute(
        text("""
            UPDATE procedural_memory
            SET occurrence_count = occurrence_count + 1,
                last_reinforced = NOW()
            WHERE id = :id
        """),
        {"id": str(pattern_id)},
    )


async def retrieve(
    session: AsyncSession,
    clone_id: UUID,
    query: str,
    limit: int = 5,
    pattern_type: str | None = None,
) -> list[DecisionPattern]:
    """Retrieve decision patterns relevant to a situation."""
    query_embedding = await embed(query)
    extra_where = f"AND pattern_type = '{pattern_type}'" if pattern_type else ""

    rows = await similarity_search(
        session,
        table="procedural_memory",
        clone_id=clone_id,
        query_embedding=query_embedding,
        limit=limit,
        extra_where=extra_where,
    )
    return [_row_to_pattern(r) for r in rows]


def _row_to_pattern(row: dict[str, Any]) -> DecisionPattern:
    return DecisionPattern(
        id=row["id"],
        pattern_type=row.get("pattern_type", "decision_heuristic"),
        description=row["description"],
        examples=row.get("examples") or [],
        confidence=row.get("confidence", 0.7),
        occurrence_count=row.get("occurrence_count", 1),
    )
