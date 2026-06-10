"""
Semantic memory: structured facts the clone knows about the world and its domain.
Distinct from episodic (experiences) — this is declarative knowledge.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.db.vector import embed, similarity_search
from doppel.brain.models.types import KnowledgeFact


async def store_fact(
    session: AsyncSession,
    clone_id: UUID,
    fact: str,
    domain: str,
    confidence: float = 0.8,
    source_ids: list[UUID] | None = None,
) -> UUID:
    """Embed and store a semantic fact."""
    embedding = await embed(fact)
    fact_id = uuid4()

    await session.execute(
        text("""
            INSERT INTO semantic_memory
              (id, clone_id, fact, embedding, domain, confidence, source_ids)
            VALUES
              (:id, :clone_id, :fact, :embedding, :domain, :confidence, :source_ids)
        """),
        {
            "id": str(fact_id),
            "clone_id": str(clone_id),
            "fact": fact,
            "embedding": "[" + ",".join(str(v) for v in embedding) + "]",
            "domain": domain,
            "confidence": confidence,
            "source_ids": [str(s) for s in (source_ids or [])],
        },
    )
    return fact_id


async def retrieve(
    session: AsyncSession,
    clone_id: UUID,
    query: str,
    limit: int = 10,
    domain: str | None = None,
    query_embedding: list[float] | None = None,
) -> list[KnowledgeFact]:
    """Retrieve semantically relevant facts for a query.
    Pass query_embedding to reuse a pre-computed vector and skip the embed() call.
    """
    if query_embedding is None:
        query_embedding = await embed(query)
    extra_where = f"AND domain = '{domain}'" if domain else ""

    rows = await similarity_search(
        session,
        table="semantic_memory",
        clone_id=clone_id,
        query_embedding=query_embedding,
        limit=limit,
        extra_where=extra_where,
        min_similarity=0.30,
    )
    return [_row_to_fact(r) for r in rows]


def _row_to_fact(row: dict[str, Any]) -> KnowledgeFact:
    return KnowledgeFact(
        id=row["id"],
        fact=row["fact"],
        domain=row.get("domain", "general"),
        confidence=row.get("confidence", 0.8),
        source_count=len(row.get("source_ids") or []),
    )
