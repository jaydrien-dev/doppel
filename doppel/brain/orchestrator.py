"""
DoppelBrain: the main entry point. Wires all layers together.

Call flow:
  1. Perceive (classify intent, stakes, entities)
  2. Load identity (style + values — constant per clone)
  3. Retrieve memory (episodic, semantic, procedural, relational — parallel)
  4. Fetch working memory (session conversation history)
  5. Route → fast or slow reasoning path
  6. Metacognition check (confidence, escalation)
  7. Finalize response (self-check, style enforcement)
  8. Log reasoning trace (async — doesn't block response)
  9. Append to working memory
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import AsyncGenerator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import load_clone_keys
from doppel.brain.generation.response import finalize
from doppel.brain.identity.layer import IdentityLayer
from doppel.brain.security.input_guard import is_safe_input
from doppel.brain.memory.system import MemorySystem
from doppel.brain.memory.working import append_turn
from doppel.brain.metacognition.layer import MetacognitionLayer
from doppel.brain.models.types import BrainInput, BrainOutput
from doppel.brain.perception.classifier import classify
from doppel.brain.reasoning import fast_path, slow_path
from doppel.brain.reasoning.engine import ReasoningEngine
from doppel.brain.reasoning.router import route


class DoppelBrain:
    """
    The cognitive core of a Doppel clone.
    One instance per clone per request (stateless except for DB/Redis).
    """

    def __init__(self, session: AsyncSession, clone_id: UUID):
        self._session = session
        self._clone_id = clone_id
        self._mem_system = MemorySystem(session, clone_id)
        self._reasoning = ReasoningEngine()
        self._metacognition = MetacognitionLayer()

    async def process(self, brain_input: BrainInput) -> BrainOutput:
        """
        Full cognitive cycle: perceive → remember → think → check → respond.
        """
        t_start = time.monotonic()

        # ── 0. Load clone's API key overrides into context ────────────────
        await load_clone_keys(self._session, self._clone_id)

        # ── 0b. Security gate — reject injection/jailbreak attempts ───────
        safe, threat_type = is_safe_input(brain_input.message)
        if not safe:
            from doppel.brain.models.types import MemorySource
            safe_response = (
                "I'm not able to help with that kind of request. "
                "If you have a genuine question, feel free to ask."
            )
            return BrainOutput(
                response=safe_response,
                confidence=1.0,
                needs_escalation=False,
                sources=[],
                reasoning_trace_id=str(__import__("uuid").uuid4()),
                path_taken="fast",
                latency_ms=int((time.monotonic() - t_start) * 1000),
            )

        # ── 1. Perceive ───────────────────────────────────────────────────
        perceived = await classify(brain_input.message)

        # ── 2. Load identity (parallel with memory retrieval) ─────────────
        identity_task = asyncio.create_task(
            IdentityLayer.load(self._session, self._clone_id)
        )

        # ── 3. Retrieve long-term memory ──────────────────────────────────
        memory_task = asyncio.create_task(
            self._mem_system.retrieve(
                query=brain_input.message,
                session_id=brain_input.session_id,
                sender_id=brain_input.sender_id,
                topics=perceived.topics,
            )
        )

        # ── 4. Fetch working memory (session history) ─────────────────────
        working_task = asyncio.create_task(
            self._mem_system.get_working_memory(brain_input.session_id)
        )

        identity, memory, working = await asyncio.gather(
            identity_task, memory_task, working_task
        )

        # ── 5. Reasoning (fast or slow path) ─────────────────────────────
        response_text, trace = await self._reasoning.think(
            brain_input=brain_input,
            perceived=perceived,
            memory=memory,
            working=working,
            identity=identity,
            mem_system=self._mem_system,
        )

        # ── 6. Metacognition check ────────────────────────────────────────
        prior_responses = [t.content for t in working if t.role == "clone"]
        confidence, needs_escalation, escalation_reason = self._metacognition.assess(
            trace=trace,
            response_text=response_text,
            prior_responses=prior_responses,
        )
        # Propagate updated escalation back to trace for logging
        trace.needs_escalation = needs_escalation
        trace.escalation_reason = escalation_reason
        trace.confidence = confidence

        # ── 7. Finalize response ──────────────────────────────────────────
        final_response = await finalize(
            response_text=response_text,
            identity=identity,
            needs_escalation=needs_escalation,
            escalation_reason=escalation_reason,
        )

        latency_ms = int((time.monotonic() - t_start) * 1000)

        # ── 8. Build output ───────────────────────────────────────────────
        output = BrainOutput(
            response=final_response,
            confidence=confidence,
            needs_escalation=needs_escalation,
            escalation_reason=escalation_reason,
            sources=trace.sources,
            reasoning_trace_id=trace.id,
            path_taken=trace.path,
            latency_ms=latency_ms,
        )

        # ── 9. Log + update working memory (fire-and-forget, don't block) ─
        asyncio.create_task(
            _persist_async(
                session=None,  # fresh session opened inside _persist_async
                clone_id=self._clone_id,
                brain_input=brain_input,
                perceived=perceived,
                memory=memory,
                trace=trace,
                final_response=final_response,
                latency_ms=latency_ms,
            )
        )

        return output

    async def process_stream(self, brain_input: BrainInput) -> AsyncGenerator[str, None]:
        """
        Streaming cognitive cycle — yields raw SSE lines (data: ...\n\n).
        Protocol:
          data: {"event": "start", "path": "fast"|"slow"}
          data: {"event": "thinking"}                        ← slow path only
          data: {"event": "token", "text": "..."}            ← one per chunk
          data: {"event": "done", "trace_id": "...", ...}
        """
        t_start = time.monotonic()
        try:
            async for chunk in self._process_stream_inner(brain_input, t_start):
                yield chunk
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Stream error: %s", exc, exc_info=True)
            import json as _json
            yield f"data: {_json.dumps({'event': 'error', 'message': str(exc)})}\n\n"
            return

    async def _process_stream_inner(
        self, brain_input: BrainInput, t_start: float
    ) -> AsyncGenerator[str, None]:
        # Load clone's API key overrides before any LLM/embed calls
        await load_clone_keys(self._session, self._clone_id)

        perceived = await classify(brain_input.message)

        identity, memory, working = await asyncio.gather(
            IdentityLayer.load(self._session, self._clone_id),
            self._mem_system.retrieve(
                query=brain_input.message,
                session_id=brain_input.session_id,
                sender_id=brain_input.sender_id,
                topics=perceived.topics,
            ),
            self._mem_system.get_working_memory(brain_input.session_id),
        )

        path = route(perceived)
        # Override with user-specified mode
        mode = brain_input.response_mode
        if mode == "fast":
            path = "fast"
        elif mode in ("pro", "extended"):
            path = "slow"

        yield f"data: {json.dumps({'event': 'start', 'path': path})}\n\n"

        kwargs = dict(
            brain_input=brain_input,
            perceived=perceived,
            memory=memory,
            working=working,
            identity=identity,
            mem_system=self._mem_system,
        )
        if path == "fast":
            gen = fast_path.run_stream(**kwargs)
        else:
            gen = slow_path.run_stream(**kwargs, extended_thinking=(mode == "extended"))

        full_text = ""
        trace = None
        async for event_type, data in gen:
            if event_type == "thinking":
                yield f"data: {json.dumps({'event': 'thinking'})}\n\n"
            elif event_type == "token":
                full_text += data
                yield f"data: {json.dumps({'event': 'token', 'text': data})}\n\n"
            elif event_type == "done":
                full_text, trace = data

        if trace is None:
            raise RuntimeError("Reasoning path completed without producing a trace — possible LLM stream interruption")

        # Post-stream: metacognition + self-check (sync, no extra LLM call)
        prior_responses = [t.content for t in working if t.role == "clone"]
        confidence, needs_escalation, escalation_reason = self._metacognition.assess(
            trace=trace,
            response_text=full_text,
            prior_responses=prior_responses,
        )
        trace.needs_escalation = needs_escalation
        trace.escalation_reason = escalation_reason
        trace.confidence = confidence

        final_response = await finalize(full_text, identity, needs_escalation, escalation_reason)
        corrected = final_response if final_response != full_text else None
        latency_ms = int((time.monotonic() - t_start) * 1000)

        done_payload = {
            "event": "done",
            "trace_id": str(trace.id),
            "path_taken": trace.path,
            "confidence": confidence,
            "needs_escalation": needs_escalation,
            "corrected_response": corrected,
            "sources": [s.model_dump(mode="json") for s in (trace.sources or [])],
            "latency_ms": latency_ms,
        }
        yield f"data: {json.dumps(done_payload)}\n\n"

        asyncio.create_task(
            _persist_async(
                session=None,  # fresh session opened inside _persist_async
                clone_id=self._clone_id,
                brain_input=brain_input,
                perceived=perceived,
                memory=memory,
                trace=trace,
                final_response=final_response,
                latency_ms=latency_ms,
            )
        )


async def _persist_async(
    session: AsyncSession | None,
    clone_id: UUID,
    brain_input: BrainInput,
    perceived,
    memory,
    trace,
    final_response: str,
    latency_ms: int,
) -> None:
    """
    Async post-response persistence: working memory + reasoning trace + episodic learning.
    Uses its own fresh session so it survives after the request session is closed.
    """
    import json
    import logging
    from datetime import datetime, timezone
    from sqlalchemy import text
    from doppel.brain.db.connection import AsyncSessionLocal

    _log = logging.getLogger(__name__)

    # Always use a fresh session — the caller's session may be closed by the time
    # this background task runs (especially on the streaming path).
    async with AsyncSessionLocal() as fresh_session:
        try:
            # Append user message to working memory
            await append_turn(
                clone_id=clone_id,
                session_id=brain_input.session_id,
                role="user",
                content=brain_input.message,
            )
            # Append clone response to working memory
            await append_turn(
                clone_id=clone_id,
                session_id=brain_input.session_id,
                role="clone",
                content=final_response,
                confidence=trace.confidence,
            )

            # Write reasoning trace
            await fresh_session.execute(
                text("""
                    INSERT INTO reasoning_traces
                      (id, clone_id, session_id, brain_input, perceived_input,
                       memory_context_summary, path, private_scratchpad,
                       framing, options_considered, selected_approach,
                       response, confidence, needs_escalation, latency_ms)
                    VALUES
                      (:id, :clone_id, :session_id, :brain_input, :perceived_input,
                       :memory_context_summary, :path, :private_scratchpad,
                       :framing, :options_considered, :selected_approach,
                       :response, :confidence, :needs_escalation, :latency_ms)
                """),
                {
                    "id": str(trace.id),
                    "clone_id": str(clone_id),
                    "session_id": str(brain_input.session_id),
                    "brain_input": json.dumps(brain_input.model_dump(mode="json")),
                    "perceived_input": json.dumps(perceived.model_dump()),
                    "memory_context_summary": json.dumps({
                        "episodic_count": len(memory.episodic),
                        "semantic_count": len(memory.semantic),
                        "procedural_count": len(memory.procedural),
                        "has_relational": memory.relational is not None,
                    }),
                    "path": trace.path,
                    "private_scratchpad": trace.private_scratchpad or None,
                    "framing": trace.framing or None,
                    "options_considered": trace.options_considered or [],
                    "selected_approach": trace.selected_approach or None,
                    "response": final_response,
                    "confidence": trace.confidence,
                    "needs_escalation": trace.needs_escalation,
                    "latency_ms": latency_ms,
                },
            )

            # Feed high-quality exchanges back into episodic memory — training mode only.
            # Consumer queries go to reasoning_traces only (activity reports), never memory.
            confidence = trace.confidence or 0.0
            if brain_input.owner_mode and not trace.needs_escalation and confidence >= 0.55 and len(final_response.strip()) > 20:
                try:
                    from doppel.brain.db.vector import embed_batch
                    from doppel.ingestion.pipeline import _store_chunk_with_embedding
                    from doppel.ingestion.connectors.base import RawItem
                    from doppel.ingestion.preprocessor import estimate_formality

                    exchange = f"Q: {brain_input.message}\nA: {final_response}"
                    embeddings = await embed_batch([exchange])
                    item = RawItem(
                        content=exchange,
                        source="chat",
                        authored_by_user=False,
                        context_type="conversation",
                        created_at=datetime.now(timezone.utc),
                    )
                    await _store_chunk_with_embedding(
                        session=fresh_session,
                        clone_id=clone_id,
                        content=exchange,
                        embedding=embeddings[0],
                        item=item,
                        formality=estimate_formality(final_response),
                    )
                except Exception as e:
                    _log.warning("Episodic learning write failed (non-fatal): %s", e)

            await fresh_session.commit()

        except Exception as exc:
            _log.error("_persist_async failed: %s", exc, exc_info=True)
            await fresh_session.rollback()
