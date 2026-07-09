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
import re
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
from doppel.brain.perception.classifier import classify, _quick_classify
from doppel.brain.models.types import MemoryContext
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

        # ── 0c. Blocked topic gate ────────────────────────────────────────
        blocked_response = await _check_blocked_topics(
            self._session, self._clone_id, brain_input.message
        )
        if blocked_response:
            return BrainOutput(
                response=blocked_response,
                confidence=1.0,
                needs_escalation=False,
                sources=[],
                reasoning_trace_id=str(__import__("uuid").uuid4()),
                path_taken="fast",
                latency_ms=int((time.monotonic() - t_start) * 1000),
            )

        # ── 1–4. Perceive + load identity + retrieve memory ──────────────────
        # If the heuristic pre-classifier fires (social greeting etc.) skip the
        # embed + 4 pgvector queries entirely — saves ~300ms on those messages.
        # Otherwise run classify + retrieve concurrently.
        from doppel.brain.db.connection import AsyncSessionLocal

        async def _load_identity():
            async with AsyncSessionLocal() as s:
                return await IdentityLayer.load(s, self._clone_id)

        quick = _quick_classify(brain_input.message)
        if quick is not None:
            # Heuristic fired — skip embed + vector search entirely
            (identity, working) = await asyncio.gather(
                _load_identity(),
                self._mem_system.get_working_memory(brain_input.session_id),
            )
            perceived = quick
            memory = MemoryContext(episodic=[], semantic=[], procedural=[], relational=None)
        else:
            perceived, identity, memory, working = await asyncio.gather(
                classify(brain_input.message),
                _load_identity(),
                self._mem_system.retrieve(
                    query=brain_input.message,
                    session_id=brain_input.session_id,
                    sender_id=brain_input.sender_id,
                    topics=None,
                ),
                self._mem_system.get_working_memory(brain_input.session_id),
            )

        # ── 4b. Uncertainty check — flag if no relevant knowledge found ──────
        knowledge_weak = _is_knowledge_weak(memory)
        if knowledge_weak:
            if not brain_input.owner_mode:
                # Log gap so owner can see what people asked about
                asyncio.create_task(
                    _log_knowledge_gap(self._clone_id, brain_input.message)
                )
            # Inject hint so the LLM knows to be honest about the gap
            brain_input = brain_input.model_copy(update={
                "metadata": {**brain_input.metadata, "_knowledge_gap": True}
            })
        elif quick is None:
            # Chunks exist — check if they're a weak similarity match (not really relevant)
            best_sim = _best_similarity(memory)
            if best_sim < 0.45:
                brain_input = brain_input.model_copy(update={
                    "metadata": {**brain_input.metadata, "_low_retrieval": True}
                })

        # ── 4c. Load MCP tools for this clone (if any enabled) ───────────
        from doppel.brain.tools.mcp_client import load_clone_tools
        from doppel.brain.reasoning import tool_path as _tool_path
        mcp_tools, servers_by_name = await load_clone_tools(self._session, self._clone_id)

        # ── 4d. Load recent tool actions for cross-session context ────────
        recent_actions = await _load_recent_tool_actions(self._session, self._clone_id)

        # ── 4e. Workflow configuration intent detection ───────────────────
        if brain_input.owner_mode and _is_workflow_request(brain_input.message):
            response_text, _wf_draft, trace = await _handle_workflow_request(
                brain_input=brain_input,
                session=self._session,
                clone_id=self._clone_id,
                identity=identity,
            )
        # ── 5. Reasoning (tool path, fast, or slow) ───────────────────────
        # Agent mode: always use tool path with full write access
        # Chat mode: tool path only when message needs data lookup (read-only)
        elif brain_input.agent_mode or _message_needs_tools(brain_input.message):
            response_text, trace = await _tool_path.run(
                brain_input=brain_input,
                identity=identity,
                memory=memory,
                working=working,
                mcp_tools=mcp_tools,
                servers_by_name=servers_by_name,
                session=self._session,
                clone_id=self._clone_id,
                recent_actions=recent_actions,
                read_only=not brain_input.agent_mode,
            )
        else:
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
        decision = self._metacognition.assess(
            trace=trace,
            response_text=response_text,
            prior_responses=prior_responses,
            perceived=perceived,
        )
        confidence       = decision.confidence
        needs_escalation = decision.needs_escalation
        escalation_reason = decision.escalation_reason
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
            owner_mode=brain_input.owner_mode,
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

        The LLM generation runs in an independent asyncio Task so the response is
        fully generated and persisted to the DB even when the HTTP client disconnects
        mid-stream (e.g. user navigates away before the reply finishes).
        """
        from doppel.brain.db.connection import AsyncSessionLocal
        clone_id = self._clone_id
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def _brain_task() -> None:
            """Independent task — survives client disconnect."""
            async with AsyncSessionLocal() as bg_session:
                bg_brain = DoppelBrain(session=bg_session, clone_id=clone_id)
                t_start = time.monotonic()
                try:
                    async for chunk in bg_brain._process_stream_inner(brain_input, t_start):
                        await queue.put(chunk)
                except Exception as exc:
                    import logging as _logging
                    _logging.getLogger(__name__).error("Stream task error: %s", exc, exc_info=True)
                    await queue.put(
                        f"data: {json.dumps({'event': 'error', 'message': str(exc)})}\n\n"
                    )
                finally:
                    await queue.put(None)  # always signal completion

        asyncio.create_task(_brain_task())

        while True:
            chunk = await queue.get()
            if chunk is None:
                break
            yield chunk

    async def _process_stream_inner(
        self, brain_input: BrainInput, t_start: float
    ) -> AsyncGenerator[str, None]:
        import logging as _logging
        _log = _logging.getLogger(__name__)

        # Load clone's API key overrides before any LLM/embed calls (cached after first hit)
        await load_clone_keys(self._session, self._clone_id)
        _log.info("[TIMING] brain: keys=%.0fms", (time.monotonic() - t_start) * 1000)

        # Security gate
        safe, _ = is_safe_input(brain_input.message)
        if not safe:
            _safe_msg = "I'm not able to help with that kind of request."
            yield f"data: {json.dumps({'event': 'token', 'text': _safe_msg})}\n\n"
            yield f"data: {json.dumps({'event': 'done', 'corrected_response': None, 'confidence': 1.0, 'needs_escalation': False, 'sources': [], 'latency_ms': int((time.monotonic() - t_start) * 1000)})}\n\n"
            return

        # Blocked topic gate
        blocked_response = await _check_blocked_topics(
            self._session, self._clone_id, brain_input.message
        )
        if blocked_response:
            yield f"data: {json.dumps({'event': 'token', 'text': blocked_response})}\n\n"
            yield f"data: {json.dumps({'event': 'done', 'corrected_response': None, 'confidence': 1.0, 'needs_escalation': False, 'sources': [], 'latency_ms': int((time.monotonic() - t_start) * 1000)})}\n\n"
            return

        from doppel.brain.db.connection import AsyncSessionLocal

        async def _load_identity():
            async with AsyncSessionLocal() as s:
                return await IdentityLayer.load(s, self._clone_id)

        quick = _quick_classify(brain_input.message)
        if quick is not None:
            (identity, working) = await asyncio.gather(
                _load_identity(),
                self._mem_system.get_working_memory(brain_input.session_id),
            )
            perceived = quick
            memory = MemoryContext(episodic=[], semantic=[], procedural=[], relational=None)
        else:
            perceived, identity, memory, working = await asyncio.gather(
                classify(brain_input.message),
                _load_identity(),
                self._mem_system.retrieve(
                    query=brain_input.message,
                    session_id=brain_input.session_id,
                    sender_id=brain_input.sender_id,
                    topics=None,
                ),
                self._mem_system.get_working_memory(brain_input.session_id),
            )

        # Uncertainty check
        knowledge_weak = _is_knowledge_weak(memory)
        if knowledge_weak:
            if not brain_input.owner_mode:
                asyncio.create_task(
                    _log_knowledge_gap(self._clone_id, brain_input.message)
                )
            brain_input = brain_input.model_copy(update={
                "metadata": {**brain_input.metadata, "_knowledge_gap": True}
            })
        elif quick is None:
            best_sim = _best_similarity(memory)
            if best_sim < 0.45:
                brain_input = brain_input.model_copy(update={
                    "metadata": {**brain_input.metadata, "_low_retrieval": True}
                })

        # ── 4c. Load MCP tools for this clone (if any enabled) ───────────
        from doppel.brain.tools.mcp_client import load_clone_tools
        from doppel.brain.reasoning import tool_path as _tool_path
        mcp_tools, servers_by_name = await load_clone_tools(self._session, self._clone_id)

        # ── 4d. Load recent tool actions for cross-session context ────────
        recent_actions = await _load_recent_tool_actions(self._session, self._clone_id)

        path = route(perceived)
        mode = brain_input.response_mode
        if mode == "fast":
            path = "fast"
        elif mode in ("pro", "extended"):
            path = "slow"

        _log.info("[TIMING] brain: gather=%.0fms path=%s heuristic=%s", (time.monotonic() - t_start) * 1000, path, quick is not None)

        # ── 4e. Workflow configuration intent detection (streaming) ──────────
        if brain_input.owner_mode and _is_workflow_request(brain_input.message):
            yield f"data: {json.dumps({'event': 'start', 'path': 'workflow'})}\n\n"
            response_text, wf_draft, wf_trace = await _handle_workflow_request(
                brain_input=brain_input,
                session=self._session,
                clone_id=self._clone_id,
                identity=identity,
            )
            # Stream response text in larger chunks (no JSON blob inline anymore)
            chunk = 60
            for i in range(0, len(response_text), chunk):
                yield f"data: {json.dumps({'event': 'token', 'text': response_text[i:i+chunk]})}\n\n"
            latency_ms = int((time.monotonic() - t_start) * 1000)
            # Send workflow draft as its own event so serialization errors
            # don't silently kill the done event
            _log.info("workflow handler returned wf_draft=%s", "non-null" if wf_draft else "NULL")
            if wf_draft:
                try:
                    yield f"data: {json.dumps({'event': 'workflow_draft', 'draft': wf_draft})}\n\n"
                    _log.info("workflow_draft event sent, name=%s", wf_draft.get('name'))
                except Exception as _e:
                    _log.error("workflow_draft serialize failed: %s", _e)
            done_payload: dict = {
                "event": "done",
                "trace_id": str(wf_trace.id),
                "path_taken": wf_trace.path,
                "confidence": wf_trace.confidence or 0.85,
                "needs_escalation": False,
                "approval_path": "auto",
                "consequentiality": "low",
                "corrected_response": None,
                "sources": [],
                "latency_ms": latency_ms,
            }
            yield f"data: {json.dumps(done_payload)}\n\n"
            asyncio.create_task(
                _persist_async(
                    session=None,
                    clone_id=self._clone_id,
                    brain_input=brain_input,
                    perceived=perceived,
                    memory=memory,
                    trace=wf_trace,
                    final_response=response_text,
                    latency_ms=latency_ms,
                )
            )
            return

        # Determine actual execution path before emitting start event so UI shows the right label
        _use_tool_path = brain_input.agent_mode or _message_needs_tools(brain_input.message)
        _start_path = "agent" if brain_input.agent_mode else ("tool" if _use_tool_path else path)
        yield f"data: {json.dumps({'event': 'start', 'path': _start_path})}\n\n"

        if _use_tool_path:
            gen = _tool_path.run_stream(
                brain_input=brain_input,
                identity=identity,
                memory=memory,
                working=working,
                mcp_tools=mcp_tools,
                servers_by_name=servers_by_name,
                session=self._session,
                clone_id=self._clone_id,
                recent_actions=recent_actions,
                read_only=not brain_input.agent_mode,
            )
        else:
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
        first_token = True
        async for event_type, data in gen:
            if event_type == "thinking":
                yield f"data: {json.dumps({'event': 'thinking'})}\n\n"
            elif event_type == "tool_call":
                yield f"data: {json.dumps({'event': 'tool_call', 'tool': data['tool'], 'detail': data['detail']})}\n\n"
            elif event_type == "tool_result":
                yield f"data: {json.dumps({'event': 'tool_result', 'tool': data['tool'], 'status': data['status']})}\n\n"
            elif event_type == "token":
                if first_token:
                    _log.info("[TIMING] brain: first_token=%.0fms", (time.monotonic() - t_start) * 1000)
                    first_token = False
                full_text += data
                yield f"data: {json.dumps({'event': 'token', 'text': data})}\n\n"
            elif event_type == "done":
                full_text, trace = data

        if trace is None:
            raise RuntimeError("Reasoning path completed without producing a trace — possible LLM stream interruption")

        # Post-stream: metacognition + self-check (sync, no extra LLM call)
        prior_responses = [t.content for t in working if t.role == "clone"]
        decision = self._metacognition.assess(
            trace=trace,
            response_text=full_text,
            prior_responses=prior_responses,
            perceived=perceived,
        )
        confidence        = decision.confidence
        needs_escalation  = decision.needs_escalation
        escalation_reason = decision.escalation_reason
        trace.needs_escalation = needs_escalation
        trace.escalation_reason = escalation_reason
        trace.confidence = confidence

        final_response = await finalize(full_text, identity, needs_escalation, escalation_reason, owner_mode=brain_input.owner_mode)
        corrected = final_response if final_response != full_text else None
        latency_ms = int((time.monotonic() - t_start) * 1000)

        done_payload = {
            "event": "done",
            "trace_id": str(trace.id),
            "path_taken": trace.path,
            "confidence": confidence,
            "needs_escalation": needs_escalation,
            "approval_path": decision.approval_path.value,
            "consequentiality": decision.consequentiality,
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


_WORKFLOW_KEYWORDS = {
    # ── Explicit automation vocabulary ─────────────────────────────────────────
    "workflow", "automation", "automate", "automate this", "automated",
    "set up a workflow", "create a workflow", "build a workflow", "make a workflow",
    "set up an automation", "create an automation", "build an automation",
    "set up a task", "create a task", "background task", "background job",
    "set a schedule", "create a schedule", "schedule a task",
    # ── Time-period triggers ───────────────────────────────────────────────────
    "every morning", "every evening", "every night", "every afternoon", "every noon",
    "every day", "every week", "every month", "every hour", "every minute",
    "every second", "every few", "every other",
    "each morning", "each evening", "each day", "each week", "each month",
    "each hour", "each minute",
    "daily", "weekly", "hourly", "monthly", "nightly", "yearly", "annually",
    "every 5 min", "every 10 min", "every 15 min", "every 30 min",
    "every 1 hour", "every 2 hour", "every 24 hour", "every 6 hour", "every 12 hour",
    "in the morning", "in the evening", "at night", "at dawn", "at noon", "at midnight",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "weekdays", "weekends", "on mondays", "on fridays",
    # ── Conditional / reactive triggers ───────────────────────────────────────
    "when ", "whenever ", "if ", "once ", "as soon as ",
    "every time ", "each time ", "any time ",
    "notify me when", "alert me when", "let me know when", "ping me when",
    "tell me when", "inform me when", "warn me when",
    "trigger when", "trigger if", "fire when",
    "in case ", "in the event",
    # ── Monitoring & polling patterns ──────────────────────────────────────────
    "watch ", "monitor ", "track ", "observe ", "scan ",
    "check every", "check for", "keep checking", "keep watching",
    "keep monitoring", "keep scanning", "keep tracking",
    "poll ", "watch for", "look for", "look out for",
    "stay on top of", "stay updated", "keep an eye",
    # ── Loop / persistence / background ────────────────────────────────────────
    "until ", "loop", "repeat", "periodically", "continuously", "ongoing",
    "on repeat", "on loop", "in the background", "run in background",
    "keep running", "keep doing", "keep sending", "keep checking",
    "non-stop", "indefinitely", "recurring",
    "auto-", "automatically ", "on autopilot",
    # ── Explicit scheduling language ───────────────────────────────────────────
    "schedule this", "schedule it", "schedule a",
    "run this every", "run every", "run daily", "run weekly", "run hourly",
    "run at ", "execute at ", "execute every", "fire every", "fire at ",
    "cron", "cron job", "cronjob",
    # ── Reminder & alert patterns ──────────────────────────────────────────────
    "remind me", "send me a reminder", "set a reminder",
    "reminder every", "daily reminder", "weekly reminder",
    "alert me", "send me an alert", "notify me", "send a notification",
    # ── Domain-specific event triggers ─────────────────────────────────────────
    "price drops", "price rises", "price hits", "price exceeds", "price falls below",
    "price goes above", "price goes below", "price changes",
    "stock hits", "stock drops", "stock rises", "stock reaches",
    "bitcoin", "ethereum", "crypto", "coin price",
    "form is submitted", "someone fills", "someone submits",
    "new message", "new email", "new post", "new comment", "new order",
    "new signup", "new lead", "new follower", "new mention",
    "someone visits", "someone clicks", "page loads",
    "webhook", "event fires", "event triggers",
    # ── "Until a state" / conditional termination ──────────────────────────────
    "until it", "until the", "until price", "until stock", "until i",
    "stop when", "stop once", "pause when", "terminate when",
    "loop until", "repeat until", "keep going until", "run until",
}


# Matches "at 9am", "at 9:30pm", "at noon", "at midnight", "every 5 minutes", etc.
_WORKFLOW_TIME_RE = re.compile(
    r"\b(?:at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|"
    r"every\s+\d+\s*(?:min(?:ute)?s?|hours?|days?|weeks?|months?)|"
    r"(?:daily|weekly|hourly|monthly|nightly|annually))\b",
    re.IGNORECASE,
)


def _is_workflow_request(message: str) -> bool:
    """
    Detect if an owner message is requesting workflow/skill configuration.
    Catches time-based schedules, conditional triggers, and explicit automation requests.
    """
    lower = message.lower()

    # Explicit automation vocabulary = immediate match, no further checks needed
    _EXPLICIT = {
        "workflow", "automation", "automate", "schedule", "cron", "recurring",
        "remind me", "set a reminder", "run every", "run daily", "run weekly",
        "run hourly", "keep checking", "keep monitoring", "keep watching",
        "on autopilot", "in the background", "background task",
    }
    if any(kw in lower for kw in _EXPLICIT):
        return True

    has_trigger = (
        any(kw in lower for kw in _WORKFLOW_KEYWORDS)
        or bool(_WORKFLOW_TIME_RE.search(message))
    )
    has_action = any(kw in lower for kw in (
        "send", "email", "whatsapp", "message", "notify", "alert",
        "check", "create", "update", "post", "slack", "calendar",
        "do", "fetch", "search", "look", "get", "find", "report",
        "summary", "summarize", "tell", "ping", "push", "pull",
        "read", "scan", "watch", "track", "monitor", "deploy",
    ))
    return has_trigger and has_action and len(message.split()) >= 4


async def _handle_workflow_request(
    brain_input: BrainInput,
    session,
    clone_id: UUID,
    identity,
) -> tuple[str, object]:
    """Route a workflow-configuration message through the skill generator."""
    from doppel.brain.tasks.skill_generator import configure_workflow_from_conversation
    from doppel.brain.models.types import ReasoningTrace
    from doppel.brain.tools.mcp_client import load_clone_tools
    from sqlalchemy import text as sql_text

    # Get connected connectors
    rows = await session.execute(
        sql_text("SELECT name FROM clone_mcp_servers WHERE clone_id = :cid AND enabled = TRUE"),
        {"cid": str(clone_id)},
    )
    connected = [r["name"] for r in rows.mappings().all()]
    # Web tools and native email are always available — no connector setup required
    if "Web" not in connected:
        connected.append("Web")
    if "email" not in connected:
        connected.append("email")

    skill_rows = await session.execute(
        sql_text("SELECT name FROM clone_skills WHERE clone_id = :cid AND status = 'active'"),
        {"cid": str(clone_id)},
    )
    existing_skills = [r["name"] for r in skill_rows.mappings().all()]

    result = await configure_workflow_from_conversation(
        request=brain_input.message,
        clone_id=clone_id,
        connected_connectors=connected,
        available_skills=existing_skills,
        clone_name=identity.display_name if hasattr(identity, "display_name") else "your clone",
    )

    status = result.get("status")
    wf_draft: dict | None = None

    if status == "ready":
        wf_draft = result.get("workflow_draft") or None
        response_text = (
            result.get("summary", "") + "\n\n"
            "Want me to activate this? Hit **Activate** below, or tell me what to change."
        )
    elif status == "needs_clarification":
        questions = result.get("questions", [])
        response_text = "To set this up, I need a few details:\n\n" + "\n".join(f"• {q}" for q in questions)
    elif status == "needs_connector":
        missing = result.get("required_connectors", [])
        response_text = (
            f"To build this, I need access to: **{', '.join(missing)}**.\n\n"
            "Connect those in Settings → Connectors, then ask me again."
        )
    else:  # unsafe
        response_text = result.get("explanation", "I can't build this workflow.")

    trace = ReasoningTrace(
        path="workflow_config",
        confidence=0.9,
        needs_escalation=False,
    )
    return response_text, wf_draft, trace


def _message_needs_tools(message: str) -> bool:
    """
    Decide if a message should be routed to the tool path.
    Two tiers:
      1. Explicit service name → always route (LLM decides whether to invoke)
      2. Generic action + generic subject → route (e.g. "find the file")
    False positives are fine — tool_path gracefully falls back to text if
    no tool is actually called.
    """
    lower = message.lower()

    # Tier 1: specific service name mentioned → route regardless of verb
    explicit_services = (
        "slack", "google drive", "gdrive",
        "gmail", "google mail",
        "google calendar", "gcal",
        "google sheet", "google sheets", "spreadsheet",
        "github", "notion", "linear",
        "my drive", "my calendar", "my inbox",
        "my slack", "my github", "my notion",
        # Web / live data keywords — always routed to web tools
        "search the web", "go online", "look online", "look up online",
        "look up the", "look up current", "search online", "search for",
        "find businesses", "find companies", "find contacts",
        "current price", "live price", "price of", "what is the price",
        "latest news", "browse", "visit the site", "visit the url",
        "check the website", "fetch the", "coinmarketcap", "coingecko",
        "bitcoin", "ethereum", "solana", "crypto", "stock price",
        "what's happening", "what is happening", "real-time", "real time",
        "live data", "trending", "breaking news",
        "contact info", "phone number", "business listing",
    )
    if any(kw in lower for kw in explicit_services):
        return True

    # Tier 2: generic action + generic object
    action_kw = (
        "post", "send", "share", "publish",
        "search", "find", "look up", "query",
        "create", "make", "add", "insert",
        "delete", "remove", "clear", "archive",
        "list", "show me", "get me", "fetch",
        "update", "edit", "rename", "move",
        "research", "compile", "collect", "gather",
    )
    subject_kw = (
        "file", "folder", "email", "message",
        "channel", "issue", "pull request", "ticket",
        "event", "meeting", "doc", "sheet", "spreadsheet",
        "businesses", "companies", "contacts", "leads",
        "website", "web", "online", "internet",
    )
    has_action = any(kw in lower for kw in action_kw)
    has_subject = any(kw in lower for kw in subject_kw)
    return has_action and has_subject


def _is_knowledge_weak(memory: MemoryContext) -> bool:
    """
    Returns True when retrieval found no meaningful knowledge for the query.
    We consider knowledge 'weak' when:
      - No episodic chunks at all, AND
      - No semantic facts at all
    (Procedural patterns are general habits and don't count as topic knowledge.)
    Social/greeting messages never reach here (they get quick-classified).
    """
    return not memory.episodic and not memory.semantic


def _best_similarity(memory: MemoryContext) -> float:
    """
    Returns the highest similarity score across the top retrieved chunks.
    Returns 0.0 if no chunks have a score attached.
    Used to detect retrievals where chunks exist but don't closely match the query.
    """
    best = 0.0
    for chunk in memory.episodic[:3]:
        score = getattr(chunk, "similarity_score", None)
        if score is not None:
            best = max(best, float(score))
    for chunk in memory.semantic[:2]:
        score = getattr(chunk, "similarity_score", None)
        if score is not None:
            best = max(best, float(score))
    return best


async def _log_knowledge_gap(clone_id: UUID, query: str) -> None:
    """Fire-and-forget: write one row to knowledge_gaps."""
    try:
        from doppel.brain.db.connection import AsyncSessionLocal
        from sqlalchemy import text as _text
        async with AsyncSessionLocal() as s:
            await s.execute(
                _text("INSERT INTO knowledge_gaps (clone_id, query) VALUES (:cid, :q)"),
                {"cid": str(clone_id), "q": query[:1000]},
            )
            await s.commit()
    except Exception:
        pass  # non-fatal


async def _check_blocked_topics(
    session: AsyncSession,
    clone_id: UUID,
    message: str,
) -> str | None:
    """
    Load the clone's admin_policies.blocked_topics and check if the message
    touches any of them. Returns a polite refusal string if blocked, else None.

    Topics are stored as plain strings (keywords or short phrases). Matching is
    case-insensitive substring search against the lowercased message. The clone
    declines without revealing the full list of restricted topics.
    """
    try:
        from sqlalchemy import text as _text
        row = await session.execute(
            _text(
                "SELECT admin_policies FROM clone_identity WHERE clone_id = :cid"
            ),
            {"cid": str(clone_id)},
        )
        result = row.fetchone()
        if not result or not result[0]:
            return None

        policies = result[0]
        blocked: list[str] = policies.get("blocked_topics", []) if isinstance(policies, dict) else []
        if not blocked:
            return None

        lower_msg = message.lower()
        for topic in blocked:
            if topic.lower() in lower_msg:
                return (
                    f"That's a topic I haven't made available through this interface. "
                    f"Feel free to ask me about something else."
                )
        return None
    except Exception:
        return None  # non-fatal — don't block the request on DB errors


async def _load_recent_tool_actions(
    session: AsyncSession,
    clone_id: UUID,
    limit: int = 15,
) -> list[dict]:
    """
    Load recent tool_action proposals for cross-session context injection.
    Returns dicts with title, context (args/server), created_at.
    Non-fatal — returns [] on any error.
    """
    try:
        from sqlalchemy import text as _text
        rows = await session.execute(
            _text("""
                SELECT title, context, created_at
                FROM proposals
                WHERE clone_id = :cid AND proposal_type = 'tool_action'
                ORDER BY created_at DESC
                LIMIT :n
            """),
            {"cid": str(clone_id), "n": limit},
        )
        results = []
        for r in rows.mappings():
            results.append({
                "title": r["title"],
                "context": r["context"] if isinstance(r["context"], dict) else {},
                "created_at": r["created_at"],
            })
        return results
    except Exception:
        return []


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
