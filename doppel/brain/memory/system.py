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
_EXPANSION_COUNT = 5


async def _normalize_and_expand(query: str) -> tuple[str, list[str]]:
    """
    Single Haiku call that does three things:
    1. Normalize — convert informal/broken/non-native English to standard English.
    2. Expand — generate _EXPANSION_COUNT rephrasing variants for wider recall.
    3. HyDE — generate a short hypothetical answer as if it came from a document.
       Embedding the hypothetical *answer* instead of the *question* puts the search
       vector in the same embedding space as stored document chunks, which dramatically
       improves retrieval recall when the stored content uses different vocabulary than
       the user's question (the most common failure mode with uploaded files).

    Returns (normalized_query, variants_including_hyde).
    Falls back to (original_query, []) on any failure — always safe to call.
    """
    from doppel.brain.context import get_anthropic_client
    try:
        client = get_anthropic_client()
        msg = await client.messages.create(
            model=settings.classification_model,
            max_tokens=500,
            system=(
                "You are a language normalizer, query expander, and document retrieval assistant. "
                "The input may be informal, broken, abbreviated, or non-native English. "
                "Return a JSON object with exactly three fields:\n"
                '  "normalized": a clean standard-English version of the input question/request '
                "(same meaning, different phrasing only if needed). If already well-formed, return verbatim.\n"
                f'  "variants": a JSON array of exactly {_EXPANSION_COUNT} short alternative phrasings '
                "of the normalized version using synonyms and related concepts (max 12 words each).\n"
                '  "hypothetical_answer": a 1-3 sentence passage written as if it were an excerpt from '
                "a document, report, or notes that directly answers the question. "
                "Write it in declarative third-person document style (not conversational). "
                "This passage will be used to find matching documents via semantic similarity — "
                "write it in the vocabulary and style that would appear in the actual source material. "
                "Example: for 'what was our revenue last year', write something like "
                "'The annual revenue for the year totalled X. Revenue grew by Y% compared to the prior period.'\n"
                "Return ONLY the JSON object — no explanation, no markdown."
            ),
            messages=[{"role": "user", "content": query}],
        )
        raw = msg.content[0].text.strip()
        data = json.loads(raw)
        normalized = str(data.get("normalized") or query).strip() or query
        variants = [str(v) for v in (data.get("variants") or [])[:_EXPANSION_COUNT] if v]
        # Append the hypothetical answer as an additional search embedding.
        # It gets embedded and searched alongside the variants — any chunk that
        # matches the hypothetical answer will almost certainly be the right one.
        hyde = str(data.get("hypothetical_answer") or "").strip()
        if hyde:
            variants.append(hyde)
        return normalized, variants
    except Exception as exc:
        logger.debug("Query normalization/expansion failed (non-fatal): %s", exc)
    return query, []


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

        # ── 1. Normalize broken English + generate variants ──────────────────
        # normalized_query is used for embeddings (better vector-space placement);
        # the original query text still goes to the LLM unchanged.
        normalized_query, variants = await _normalize_and_expand(query)
        all_queries = [normalized_query] + variants  # normalized first

        # ── 2. Batch embed (one API round-trip for all) ───────────────────────
        all_embeddings = await embed_batch(all_queries)
        primary_embedding = all_embeddings[0]

        # ── 3. Parallel retrieval for every embedding ─────────────────────────
        async def _episodic_for(emb: list[float]) -> list[MemoryChunk]:
            async with AsyncSessionLocal() as s:
                return await episodic.retrieve(
                    s, self._clone_id, query, limit=25,
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
        episodic_chunks = _merge_chunks(all_episodic_lists, limit=25)
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
                # Use full chunk content — truncating to 800 discards >50% of chunks
                # ingested at 1800 chars. The char_budget check below is the real gate.
                excerpt = chunk.content
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
