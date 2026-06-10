"""
MemorySystem: unified interface that orchestrates all memory layers.
Called by the reasoning engine; callers don't need to know which store they're hitting.
"""
from __future__ import annotations

import asyncio
import json
import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.db.vector import embed_batch
from doppel.brain.memory import episodic, procedural, relational, semantic
from doppel.brain.memory.working import get_turns, format_for_prompt
from doppel.brain.models.types import MemoryContext, MemoryChunk, KnowledgeFact, WorkingMemoryTurn
from doppel.config import settings

logger = logging.getLogger(__name__)

# How many synonym variants to generate per query.
# More = better recall, slightly more latency.
_EXPANSION_COUNT = 3


async def _expand_query(query: str) -> list[str]:
    """
    Use Haiku to generate synonym/rephrasing variants of the query.
    These are embedded alongside the original to widen the similarity search net.
    Returns up to _EXPANSION_COUNT variants. Returns [] on any failure — caller
    falls back to single-query search gracefully.
    """
    from doppel.brain.context import get_anthropic_client
    try:
        client = get_anthropic_client()
        msg = await client.messages.create(
            model=settings.classification_model,
            max_tokens=150,
            system=(
                "You are a search query expander. Given a question or statement, "
                f"return a JSON array of exactly {_EXPANSION_COUNT} alternative phrasings. "
                "Use synonyms, related concepts, and different framings of the same idea. "
                "Keep each phrase short (under 12 words). Return ONLY the JSON array, nothing else."
            ),
            messages=[{"role": "user", "content": query}],
        )
        raw = msg.content[0].text.strip()
        variants = json.loads(raw)
        if isinstance(variants, list):
            return [str(v) for v in variants[:_EXPANSION_COUNT] if v]
    except Exception as exc:
        logger.debug("Query expansion failed (non-fatal): %s", exc)
    return []


def _merge_chunks(lists: list[list[MemoryChunk]], limit: int = 20) -> list[MemoryChunk]:
    """
    Union of chunk lists from multiple query variants.
    Deduped by ID. When the same chunk appears multiple times, keep the
    instance with the highest similarity score (best match wins).
    Pinned chunks always float to the top.
    """
    best: dict[str, MemoryChunk] = {}
    for chunk_list in lists:
        for chunk in chunk_list:
            cid = str(chunk.id)
            existing = best.get(cid)
            if existing is None or chunk.similarity_score > existing.similarity_score:
                best[cid] = chunk

    def _sort_key(c: MemoryChunk) -> tuple:
        return (c.metadata.get("is_pinned", False), c.similarity_score)

    return sorted(best.values(), key=_sort_key, reverse=True)[:limit]


def _merge_facts(lists: list[list[KnowledgeFact]], limit: int = 8) -> list[KnowledgeFact]:
    """
    Union of fact lists from multiple query variants, deduped by ID.
    Confidence is a stored property (not query-dependent), so any instance works.
    Sort by confidence descending.
    """
    best: dict[str, KnowledgeFact] = {}
    for fact_list in lists:
        for fact in fact_list:
            fid = str(fact.id)
            if fid not in best or fact.confidence > best[fid].confidence:
                best[fid] = fact
    return sorted(best.values(), key=lambda f: f.confidence, reverse=True)[:limit]


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
        Retrieval from all long-term memory stores with query expansion.

        Flow:
          1. Expand the query into synonym/rephrasing variants via Haiku.
          2. Embed the original + all variants in a single batch API call.
          3. Run episodic + semantic search for EACH embedding in parallel.
          4. Union results (dedup by ID, keep best similarity score).

        This dramatically reduces false negatives: a user asking "how do you handle
        conflict?" will still find knowledge stored as "I deal with disagreements by..."
        even when the raw cosine similarity between those phrasings would fall below
        the 0.50 threshold.
        """
        from doppel.brain.db.connection import AsyncSessionLocal

        # ── 1. Expand query ──────────────────────────────────────────────────
        variants = await _expand_query(query)
        all_queries = [query] + variants  # original always first

        # ── 2. Batch embed (one API round-trip for all) ───────────────────────
        all_embeddings = await embed_batch(all_queries)
        primary_embedding = all_embeddings[0]

        # ── 3. Parallel retrieval for every embedding ─────────────────────────
        async def _episodic_for(emb: list[float]) -> list[MemoryChunk]:
            async with AsyncSessionLocal() as s:
                return await episodic.retrieve(
                    s, self._clone_id, query, limit=20,
                    authored_by_user_only=False, query_embedding=emb,
                )

        async def _semantic_for(emb: list[float]) -> list[KnowledgeFact]:
            async with AsyncSessionLocal() as s:
                return await semantic.retrieve(
                    s, self._clone_id, query, limit=8,
                    query_embedding=emb,
                )

        # Procedural + relational don't benefit from query expansion
        # (procedural is general habit patterns; relational is per-contact)
        async def _procedural() -> list:
            async with AsyncSessionLocal() as s:
                return await procedural.retrieve(
                    s, self._clone_id, query, limit=5,
                    query_embedding=primary_embedding,
                )

        async def _relational():
            if not sender_id:
                return None
            async with AsyncSessionLocal() as s:
                return await relational.get_contact(s, self._clone_id, sender_id)

        episodic_tasks = [_episodic_for(emb) for emb in all_embeddings]
        semantic_tasks = [_semantic_for(emb) for emb in all_embeddings]

        n = len(all_embeddings)
        results = await asyncio.gather(
            *episodic_tasks,
            *semantic_tasks,
            _procedural(),
            _relational(),
        )

        all_episodic_lists: list[list[MemoryChunk]]  = list(results[:n])
        all_semantic_lists: list[list[KnowledgeFact]] = list(results[n:2 * n])
        procedural_patterns = results[2 * n]
        contact_memory      = results[2 * n + 1]

        # ── 4. Merge + dedup ──────────────────────────────────────────────────
        episodic_chunks = _merge_chunks(all_episodic_lists, limit=20)
        semantic_facts  = _merge_facts(all_semantic_lists,  limit=8)

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
