"""
Chunk enricher: generates question-augmented embedding text for document chunks.

Problem: a stored chunk like "Q1 revenue was £4.2M, up 12% YoY" has a document-space
embedding. A user asking "what was the revenue last quarter?" has a query-space embedding.
Even though they're about the same fact, their cosine similarity is low — causing retrieval
to miss the right chunk entirely unless the user uses the document's exact phrasing.

Fix: before embedding a chunk, prepend the questions it answers and its key terms.
The resulting embedding sits between query-space and document-space, matching both.

  Embedding text: "Questions: What was the revenue? How did Q1 perform financially?
                   Terms: revenue, Q1, £4.2M, YoY growth

                   Q1 revenue was £4.2M, up 12% YoY."

Stored text: "Q1 revenue was £4.2M, up 12% YoY."  ← what the LLM sees, clean

Only applied to document/upload chunks — emails get enough signal from the email subject
and thread context. Runs in batches of 8 chunks per Haiku call to minimise API calls.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Sequence

logger = logging.getLogger(__name__)

_BATCH_SIZE = 8  # chunks per enrichment call

# Sources that benefit from enrichment (document vocabulary vs. query vocabulary gap)
_ENRICH_CONTEXT_TYPES = {"document", "upload", "notion", "github"}
_ENRICH_SOURCES = {"upload", "gdrive", "notion", "github"}


def should_enrich(source: str, context_type: str) -> bool:
    """Return True if this chunk should get question-augmented embedding."""
    return (
        source.lower() in _ENRICH_SOURCES
        or context_type.lower() in _ENRICH_CONTEXT_TYPES
    )


async def enrich_chunks_for_embedding(
    chunks: list[str],
    sources: list[str],
    context_types: list[str],
) -> list[str]:
    """
    For each chunk, return the text that should be embedded.
    Document chunks → enriched with questions + key terms.
    Other chunks → returned unchanged.

    Args:
        chunks: raw chunk texts
        sources: source label per chunk (e.g. "upload", "gmail")
        context_types: context type per chunk (e.g. "document", "email_reply")

    Returns:
        List of embedding texts — same length as input, same order.
    """
    result = list(chunks)  # default: unchanged

    # Identify which chunks need enrichment
    to_enrich: list[tuple[int, str]] = [
        (i, chunk)
        for i, (chunk, src, ctx) in enumerate(zip(chunks, sources, context_types))
        if should_enrich(src, ctx)
    ]

    if not to_enrich:
        return result

    # Process in batches
    for batch_start in range(0, len(to_enrich), _BATCH_SIZE):
        batch = to_enrich[batch_start : batch_start + _BATCH_SIZE]
        try:
            enriched = await _enrich_batch([text for _, text in batch])
            for (idx, _), enriched_text in zip(batch, enriched):
                result[idx] = enriched_text
        except Exception as exc:
            logger.warning("Chunk enrichment failed (non-fatal), using raw text: %s", exc)
            # Fall back to raw text — ingestion continues

    return result


async def _enrich_batch(chunks: list[str]) -> list[str]:
    """
    Call Haiku once for a batch of chunks.
    Returns enriched embedding text for each (questions + terms prepended to original).
    """
    from doppel.brain.context import get_anthropic_client
    from doppel.config import settings

    numbered = "\n\n".join(
        f"[CHUNK {i+1}]\n{chunk}" for i, chunk in enumerate(chunks)
    )

    client = get_anthropic_client()
    msg = await client.messages.create(
        model=settings.classification_model,
        max_tokens=600,
        system=(
            "You are a document indexing assistant. For each numbered chunk, generate:\n"
            '  "questions": 2-3 natural-language questions that this chunk directly answers '
            "(write them as a person would ask, not as a document would state). "
            "Focus on questions someone might type to find this information.\n"
            '  "terms": 3-5 key terms, names, figures, or concepts from this chunk.\n\n'
            "Return a JSON array with one object per chunk in order:\n"
            '[{"questions": ["...", "..."], "terms": ["...", "..."]}, ...]\n'
            "Return ONLY the JSON array — no explanation, no markdown."
        ),
        messages=[{"role": "user", "content": numbered}],
    )

    raw = msg.content[0].text.strip()
    items = json.loads(raw)

    enriched: list[str] = []
    for i, (chunk, item) in enumerate(zip(chunks, items)):
        questions = "; ".join(item.get("questions") or [])
        terms = ", ".join(item.get("terms") or [])
        prefix_parts = []
        if questions:
            prefix_parts.append(f"Questions this answers: {questions}")
        if terms:
            prefix_parts.append(f"Key terms: {terms}")
        if prefix_parts:
            enriched.append("\n".join(prefix_parts) + "\n\n" + chunk)
        else:
            enriched.append(chunk)

    return enriched
