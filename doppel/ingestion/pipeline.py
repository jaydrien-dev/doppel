"""
IngestionPipeline: the main orchestrator for ingesting content into the brain.

Flow per item:
  fetch (connector) → preprocess → chunk → batch embed → store in episodic_memory

Runs as a FastAPI BackgroundTask so the HTTP response is immediate.
Progress is tracked via ingestion_jobs + Redis so callers can poll.

After completing a source ingestion:
  → If >= 30 authored chunks exist, trigger style extraction.
"""
from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.db.vector import embed_batch
from doppel.brain.memory.episodic import store_chunk
from doppel.config import settings
from doppel.ingestion.chunker import chunk_text
from doppel.ingestion.connectors.base import BaseConnector, RawItem
from doppel.ingestion.pii_redactor import redact_pii
from doppel.ingestion.preprocessor import estimate_formality, preprocess_email
from doppel.ingestion.status import (
    complete_job,
    fail_job,
    start_job,
    update_job,
)
from doppel.ingestion.decision_extractor import extract_epistemic_profile, fetch_decision_sample_texts
from doppel.ingestion.style_extractor import extract_style_fingerprint, fetch_sample_texts

_STYLE_TRIGGER_THRESHOLD = 30   # min authored chunks before style extraction
_EPISTEMIC_TRIGGER_THRESHOLD = 30  # same threshold — decision patterns need enough text too
_PROGRESS_EVERY = 10            # update job status every N items processed


class IngestionPipeline:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def run(
        self,
        clone_id: UUID,
        connector: BaseConnector,
        job_id: UUID,
        clone_name: str = "unknown",
    ) -> None:
        """
        Main ingestion loop. Designed to run as a background task.
        Handles errors per-item so one bad email doesn't abort everything.
        """
        processed = 0
        failed = 0

        try:
            # Collect items first so we know the total count
            # (Gmail doesn't give us a count before listing)
            items: list[RawItem] = []
            async for item in connector.fetch_items(
                clone_id=clone_id,
                since_days=settings.gmail_fetch_days,
            ):
                items.append(item)

            await start_job(job_id, total_items=len(items), session=self._session)

            # Process in batches to amortize embedding API calls
            batch_size = settings.ingestion_batch_size
            for batch_start in range(0, len(items), batch_size):
                batch = items[batch_start : batch_start + batch_size]
                p, f = await self._process_batch(clone_id, batch)
                processed += p
                failed += f

                if (batch_start // batch_size) % (_PROGRESS_EVERY // batch_size + 1) == 0:
                    await update_job(job_id, processed, failed, self._session)

            await update_job(job_id, processed, failed, self._session)
            await complete_job(job_id, self._session)

            print(f"[pipeline] Done. {processed} stored, {failed} failed for clone {clone_id}")

            # Trigger style + decision-making extraction if we have enough data
            await self._maybe_extract_style(clone_id, clone_name)
            await self._maybe_extract_epistemic(clone_id, clone_name)

        except Exception as e:
            print(f"[pipeline] Fatal error for job {job_id}: {e}")
            await fail_job(job_id, str(e), self._session)

    async def _process_batch(
        self,
        clone_id: UUID,
        items: list[RawItem],
    ) -> tuple[int, int]:
        """
        Preprocess, chunk, batch-embed, and store a batch of items.
        Returns (processed_count, failed_count).
        """
        # Step 1: preprocess all items into clean chunks
        all_chunks: list[tuple[str, RawItem, float]] = []  # (chunk_text, source_item, formality)
        for item in items:
            try:
                subject = item.metadata.get("subject", "")
                clean = preprocess_email(item.content, subject)
                if not clean:
                    continue
                formality = estimate_formality(clean)
                chunks = chunk_text(clean, max_chars=settings.ingestion_chunk_max_chars)
                for chunk in chunks:
                    all_chunks.append((redact_pii(chunk), item, formality))
            except Exception as e:
                print(f"[pipeline] Preprocess failed: {e}")

        if not all_chunks:
            return 0, len(items)

        # Step 2: batch embed all chunks in one OpenAI call
        texts = [c[0] for c in all_chunks]
        try:
            embeddings = await embed_batch(texts)
        except Exception as e:
            print(f"[pipeline] embed_batch failed: {e}")
            return 0, len(items)

        # Step 3: store each chunk with its embedding
        processed = 0
        failed = 0
        for (chunk_text_val, item, formality), embedding in zip(all_chunks, embeddings):
            try:
                await _store_chunk_with_embedding(
                    session=self._session,
                    clone_id=clone_id,
                    content=chunk_text_val,
                    embedding=embedding,
                    item=item,
                    formality=formality,
                )
                processed += 1
            except Exception as e:
                print(f"[pipeline] Store failed: {e}")
                failed += 1

        if processed > 0:
            await self._session.commit()

        return processed, failed

    async def _maybe_extract_style(self, clone_id: UUID, clone_name: str) -> None:
        """Extract style fingerprint if there's enough authored content."""
        samples = await fetch_sample_texts(self._session, clone_id, limit=200)
        if len(samples) < _STYLE_TRIGGER_THRESHOLD:
            print(f"[pipeline] Only {len(samples)} samples — skipping style extraction (need {_STYLE_TRIGGER_THRESHOLD})")
            return

        print(f"[pipeline] Extracting style fingerprint from {len(samples)} samples...")
        try:
            fingerprint = await extract_style_fingerprint(
                session=self._session,
                clone_id=clone_id,
                sample_texts=samples,
                clone_name=clone_name,
            )
            from doppel.brain.identity.layer import invalidate_identity_cache
            invalidate_identity_cache(clone_id)
            print(f"[pipeline] Style extracted: formality={fingerprint.preferred_formality:.2f}, "
                  f"directness={fingerprint.directness:.2f}, warmth={fingerprint.warmth:.2f}")
        except Exception as e:
            print(f"[pipeline] Style extraction failed (non-fatal): {e}")

    async def _maybe_extract_epistemic(self, clone_id: UUID, clone_name: str) -> None:
        """Extract decision-making profile if there's enough authored content."""
        samples = await fetch_decision_sample_texts(self._session, clone_id, limit=300)
        if len(samples) < _EPISTEMIC_TRIGGER_THRESHOLD:
            print(f"[pipeline] Only {len(samples)} samples — skipping epistemic extraction (need {_EPISTEMIC_TRIGGER_THRESHOLD})")
            return

        print(f"[pipeline] Extracting epistemic profile from {len(samples)} samples...")
        try:
            profile = await extract_epistemic_profile(
                session=self._session,
                clone_id=clone_id,
                sample_texts=samples,
                clone_name=clone_name,
            )
            from doppel.brain.identity.layer import invalidate_identity_cache
            invalidate_identity_cache(clone_id)
            print(f"[pipeline] Epistemic profile extracted: approach='{profile.decision_approach}', "
                  f"frameworks={profile.reasoning_frameworks}, domains={profile.knowledge_domains}")
        except Exception as e:
            print(f"[pipeline] Epistemic extraction failed (non-fatal): {e}")


async def _store_chunk_with_embedding(
    session: AsyncSession,
    clone_id: UUID,
    content: str,
    embedding: list[float],
    item: RawItem,
    formality: float,
) -> None:
    """
    Low-level insert that accepts a pre-computed embedding.
    Avoids re-embedding via store_chunk() which calls embed() internally.
    """
    from sqlalchemy import text
    from uuid import uuid4

    chunk_id = uuid4()
    entities = item.metadata.get("entities", [])
    topics = item.metadata.get("topics", [])

    await session.execute(
        text("""
            INSERT INTO episodic_memory
              (id, clone_id, content, embedding, source, authored_by_user,
               context_type, entities, topics, formality_score, created_at, source_ref)
            VALUES
              (:id, :clone_id, :content, :embedding, :source, :authored_by_user,
               :context_type, :entities, :topics, :formality_score, :created_at, :source_ref)
        """),
        {
            "id": str(chunk_id),
            "clone_id": str(clone_id),
            "content": content,
            "embedding": "[" + ",".join(str(v) for v in embedding) + "]",
            "source": item.source,
            "authored_by_user": item.authored_by_user,
            "context_type": item.context_type,
            "entities": entities,
            "topics": topics,
            "formality_score": formality,
            "created_at": item.created_at,
            "source_ref": item.source_ref,
        },
    )
