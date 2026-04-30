"""
pgvector helpers: embed text, upsert, and similarity search.
All heavy lifting goes through these two functions so the rest of the
codebase never touches raw SQL for vector operations.
"""
from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from openai import AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_openai_key
from doppel.config import settings


async def embed(text_input: str) -> list[float]:
    """Return a 1536-dim embedding for the given text."""
    client = AsyncOpenAI(api_key=get_openai_key())
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=text_input,
    )
    return response.data[0].embedding


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts in a single API call."""
    client = AsyncOpenAI(api_key=get_openai_key())
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )
    # OpenAI returns embeddings in the same order as input
    return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]


async def similarity_search(
    session: AsyncSession,
    table: str,
    clone_id: UUID,
    query_embedding: list[float],
    limit: int = 20,
    extra_where: str = "",
) -> list[dict[str, Any]]:
    """
    Cosine similarity search against a table's `embedding` column.
    Returns rows sorted by similarity descending, with `similarity_score` added.

    `extra_where` is an optional raw SQL fragment added after the clone_id filter,
    e.g. "AND is_excluded = false".
    """
    vec_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"
    where_clause = f"clone_id = :clone_id {extra_where}"

    sql = text(f"""
        SELECT *,
               1 - (embedding <=> '{vec_literal}'::vector) AS similarity_score
        FROM {table}
        WHERE {where_clause}
        ORDER BY embedding <=> '{vec_literal}'::vector
        LIMIT :limit
    """)

    result = await session.execute(sql, {"clone_id": str(clone_id), "limit": limit})
    rows = result.mappings().all()
    return [dict(row) for row in rows]
