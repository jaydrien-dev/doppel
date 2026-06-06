"""
MemorySystem: unified interface that orchestrates all memory layers.
Called by the reasoning engine; callers don't need to know which store they're hitting.
"""
from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.db.vector import embed
from doppel.brain.memory import episodic, procedural, relational, semantic
from doppel.brain.memory.working import get_turns, format_for_prompt
from doppel.brain.models.types import MemoryContext, WorkingMemoryTurn
from doppel.config import settings


class MemorySystem:
    def __init__(self, session: AsyncSession, clone_id: UUID):
        self._session = session
        self._clone_id = clone_id

    async def retrieve(
        self,
        query: str,
        session_id: UUID,
        sender_id: str | None = None,
        topics: list[str] | None = None,
    ) -> MemoryContext:
        """
        Parallel retrieval from all long-term memory stores.
        Embeds the query once and shares the vector across all layers.
        Each layer gets its own AsyncSession — SQLAlchemy AsyncSession does not
        support concurrent operations on the same session instance.
        """
        from doppel.brain.db.connection import AsyncSessionLocal

        # Single embedding call (saves 2x round-trips) — no session needed
        query_embedding = await embed(query)

        async def _episodic() -> list:
            async with AsyncSessionLocal() as s:
                return await episodic.retrieve(
                    s, self._clone_id, query, limit=20,
                    authored_by_user_only=False, query_embedding=query_embedding,
                )

        async def _semantic() -> list:
            async with AsyncSessionLocal() as s:
                return await semantic.retrieve(
                    s, self._clone_id, query, limit=8,
                    query_embedding=query_embedding,
                )

        async def _procedural() -> list:
            async with AsyncSessionLocal() as s:
                return await procedural.retrieve(
                    s, self._clone_id, query, limit=5,
                    query_embedding=query_embedding,
                )

        # Relational memory only if we know who's asking
        async def _relational():
            if not sender_id:
                return None
            async with AsyncSessionLocal() as s:
                return await relational.get_contact(s, self._clone_id, sender_id)

        results = await asyncio.gather(_episodic(), _semantic(), _procedural(), _relational())
        episodic_chunks, semantic_facts, procedural_patterns, contact_memory = results

        return MemoryContext(
            episodic=episodic_chunks,
            semantic=semantic_facts,
            procedural=procedural_patterns,
            relational=contact_memory,
        )

    async def get_working_memory(self, session_id: UUID) -> list[WorkingMemoryTurn]:
        return await get_turns(self._clone_id, session_id)

    def render_context_block(
        self,
        memory: MemoryContext,
        working: list[WorkingMemoryTurn],
    ) -> str:
        """
        Assemble all retrieved memory into a single context block
        for injection into the LLM prompt. Respects the token budget.
        """
        parts: list[str] = []

        # Working memory (conversation so far)
        if working:
            parts.append(format_for_prompt(working[-settings.working_memory_max_turns:]))

        # Relational context
        if memory.relational:
            c = memory.relational
            parts.append(
                f"## About {c.contact_name or c.contact_identifier}\n"
                f"Relationship: {c.relationship_type or 'unknown'}\n"
                f"History: {c.interaction_summary}\n"
                + (f"Communication notes: {c.communication_style_notes}" if c.communication_style_notes else "")
            )

        # Episodic memories
        if memory.episodic:
            parts.append("## Relevant past experiences")
            char_budget = settings.max_episodic_tokens * 4  # rough chars per token
            chars_used = 0
            for chunk in memory.episodic:
                excerpt = chunk.content[:800]
                if chars_used + len(excerpt) > char_budget:
                    break
                source_label = f"[{chunk.source}, {'authored by you' if chunk.authored_by_user else 'received'}]"
                parts.append(f"{source_label}\n{excerpt}")
                chars_used += len(excerpt)

        # Semantic facts
        if memory.semantic:
            parts.append("## What you know about this topic")
            for fact in memory.semantic:
                parts.append(f"- {fact.fact} (confidence: {int(fact.confidence * 100)}%)")

        # Procedural patterns
        if memory.procedural:
            parts.append("## How you typically handle situations like this")
            for pattern in memory.procedural:
                parts.append(f"- [{pattern.pattern_type}] {pattern.description}")
                if pattern.examples:
                    parts.append(f"  Example: {pattern.examples[0]}")

        return "\n\n".join(parts)
