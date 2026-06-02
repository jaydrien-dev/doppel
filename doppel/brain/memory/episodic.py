"""
Episodic memory store: real experiences from the user's life.
Backed by pgvector. Every email sent, message written, decision made lives here.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.db.vector import embed, similarity_search
from doppel.brain.models.types import MemoryChunk
from doppel.config import settings


async def store_chunk(
    session: AsyncSession,
    clone_id: UUID,
    content: str,
    source: str,
    authored_by_user: bool = True,
    context_type: str | None = None,
    entities: list[str] | None = None,
    topics: list[str] | None = None,
    formality_score: float | None = None,
    created_at: datetime | None = None,
    is_pinned: bool = False,
) -> UUID:
    """Embed and store a single episodic chunk. Returns the new row ID."""
    embedding = await embed(content)
    chunk_id = uuid4()

    await session.execute(
        text("""
            INSERT INTO episodic_memory
              (id, clone_id, content, embedding, source, authored_by_user,
               context_type, entities, topics, formality_score,
               created_at, is_pinned)
            VALUES
              (:id, :clone_id, :content, :embedding, :source, :authored_by_user,
               :context_type, :entities, :topics, :formality_score,
               :created_at, :is_pinned)
        """),
        {
            "id": str(chunk_id),
            "clone_id": str(clone_id),
            "content": content,
            "embedding": "[" + ",".join(str(v) for v in embedding) + "]",
            "source": source,
            "authored_by_user": authored_by_user,
            "context_type": context_type,
            "entities": entities or [],
            "topics": topics or [],
            "formality_score": formality_score,
            "created_at": created_at or datetime.utcnow(),
            "is_pinned": is_pinned,
        },
    )
    return chunk_id


async def retrieve(
    session: AsyncSession,
    clone_id: UUID,
    query: str,
    limit: int = 20,
    authored_by_user_only: bool = False,
) -> list[MemoryChunk]:
    """
    Semantic similarity search over episodic memory.
    Pinned chunks are always included first (up to 5).
    """
    query_embedding = await embed(query)

    extra_where = "AND is_excluded = false AND source != 'chat'"
    if authored_by_user_only:
        extra_where += " AND authored_by_user = true"

    # Fetch pinned chunks first — they are always relevant
    pinned_result = await session.execute(
        text("""
            SELECT * FROM episodic_memory
            WHERE clone_id = :clone_id AND is_pinned = true AND is_excluded = false
            ORDER BY created_at DESC
            LIMIT 5
        """),
        {"clone_id": str(clone_id)},
    )
    pinned_rows = [dict(r) for r in pinned_result.mappings().all()]

    # Similarity search for the rest
    similar_rows = await similarity_search(
        session,
        table="episodic_memory",
        clone_id=clone_id,
        query_embedding=query_embedding,
        limit=limit,
        extra_where=extra_where + " AND is_pinned = false",
    )

    # Merge: pinned first, then similar (dedup by id)
    seen: set[str] = {str(r["id"]) for r in pinned_rows}
    merged: list[dict[str, Any]] = list(pinned_rows)
    for row in similar_rows:
        if str(row["id"]) not in seen:
            merged.append(row)
            seen.add(str(row["id"]))

    return [_row_to_chunk(r) for r in merged[:limit]]


async def exclude_chunk(session: AsyncSession, chunk_id: UUID) -> None:
    """Mark a chunk as excluded (soft delete — user privacy control)."""
    await session.execute(
        text("UPDATE episodic_memory SET is_excluded = true WHERE id = :id"),
        {"id": str(chunk_id)},
    )


async def pin_chunk(session: AsyncSession, chunk_id: UUID, pinned: bool = True) -> None:
    """Pin or unpin a chunk so it always appears in context."""
    await session.execute(
        text("UPDATE episodic_memory SET is_pinned = :pinned WHERE id = :id"),
        {"pinned": pinned, "id": str(chunk_id)},
    )


def _row_to_chunk(row: dict[str, Any]) -> MemoryChunk:
    return MemoryChunk(
        id=row["id"],
        content=row["content"],
        source=row["source"],
        authored_by_user=row["authored_by_user"],
        similarity_score=row.get("similarity_score", 1.0),  # pinned rows don't have a score
        created_at=row["created_at"],
        metadata={
            "context_type": row.get("context_type"),
            "entities": row.get("entities", []),
            "topics": row.get("topics", []),
            "formality_score": row.get("formality_score"),
            "is_pinned": row.get("is_pinned", False),
        },
    )
