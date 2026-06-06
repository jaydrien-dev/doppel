"""
Working memory: the in-session context manager.
Backed by Redis when available; falls back to an in-process dict for local dev.

Compaction: when a session grows past COMPACT_THRESHOLD turns, older turns are
summarised by a fast LLM call (Haiku) and stored in a separate summary key.
The summary is prepended on the next get_turns() so no context is lost.
The compaction runs as a fire-and-forget background task — zero hot-path impact.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from datetime import datetime
from uuid import UUID

from doppel.brain.models.types import WorkingMemoryTurn
from doppel.config import settings

# TTL for session state: 4 hours of inactivity clears the session
SESSION_TTL_SECONDS = 4 * 60 * 60

# Compact when the list length exceeds max_turns * 2 (e.g. 40 for default of 20).
# After compaction the list is trimmed back to max_turns.
COMPACT_RATIO = 2

# In-memory fallback when Redis is unavailable
_local_store: dict[str, list[str]] = defaultdict(list)
_local_summaries: dict[str, str] = {}


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

def _session_key(clone_id: UUID, session_id: UUID) -> str:
    return f"doppel:wm:{clone_id}:{session_id}"


def _summary_key(clone_id: UUID, session_id: UUID) -> str:
    return f"doppel:wm_sum:{clone_id}:{session_id}"


def _redis_available() -> bool:
    return bool(settings.redis_url and settings.redis_url != "")


# ---------------------------------------------------------------------------
# Compaction
# ---------------------------------------------------------------------------

async def _summarise_turns(turns: list[WorkingMemoryTurn], prior_summary: str | None) -> str:
    """Call Haiku to produce a short summary of old conversation turns."""
    lines: list[str] = []
    if prior_summary:
        lines.append(f"[Previous summary]\n{prior_summary}\n")
    for t in turns:
        label = "User" if t.role == "user" else "Clone"
        lines.append(f"{label}: {t.content}")
    conversation = "\n".join(lines)

    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": (
                    "Summarise this conversation history in 2–4 sentences. "
                    "Preserve key facts, decisions, and topics discussed.\n\n"
                    + conversation
                ),
            }],
        )
        return resp.content[0].text.strip()
    except Exception:
        # Fallback: truncated plain-text summary
        return f"[Earlier conversation — {len(turns)} turns]"


async def _maybe_compact_redis(
    clone_id: UUID,
    session_id: UUID,
    max_turns: int,
) -> None:
    """Background task: compact the Redis working-memory list if it's grown too large."""
    threshold = max_turns * COMPACT_RATIO
    try:
        import redis.asyncio as aioredis
        async with aioredis.from_url(settings.redis_url, decode_responses=True) as redis:
            key = _session_key(clone_id, session_id)
            total = await redis.llen(key)
            if total <= threshold:
                return

            # Turns to summarise: everything except the most recent max_turns
            old_raw = await redis.lrange(key, 0, total - max_turns - 1)
            if not old_raw:
                return

            old_turns = [WorkingMemoryTurn.model_validate_json(t) for t in old_raw]

            # Get any existing summary to fold in
            skey = _summary_key(clone_id, session_id)
            prior = await redis.get(skey)

            summary_text = await _summarise_turns(old_turns, prior)

            # Write new summary and trim list atomically
            pipe = redis.pipeline()
            pipe.set(skey, summary_text, ex=SESSION_TTL_SECONDS)
            pipe.ltrim(key, total - max_turns, -1)
            pipe.expire(key, SESSION_TTL_SECONDS)
            await pipe.execute()
    except Exception:
        pass  # non-fatal — compaction is best-effort


def _maybe_compact_local(clone_id: UUID, session_id: UUID, max_turns: int) -> None:
    """Synchronous compaction for the in-process fallback store."""
    key = _session_key(clone_id, session_id)
    turns_raw = _local_store.get(key, [])
    threshold = max_turns * COMPACT_RATIO
    if len(turns_raw) <= threshold:
        return
    old_raw = turns_raw[: len(turns_raw) - max_turns]
    old_turns = [WorkingMemoryTurn.model_validate_json(t) for t in old_raw]
    prior = _local_summaries.get(key)
    lines: list[str] = []
    if prior:
        lines.append(f"[Previous summary]\n{prior}")
    for t in old_turns:
        label = "User" if t.role == "user" else "Clone"
        lines.append(f"{label}: {t.content}")
    # Cheap in-process summary (no LLM for local dev)
    _local_summaries[key] = "\n".join(lines)[:800]
    _local_store[key] = turns_raw[len(turns_raw) - max_turns:]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def append_turn(
    clone_id: UUID,
    session_id: UUID,
    role: str,
    content: str,
    confidence: float | None = None,
) -> None:
    """Append a turn to working memory and reset the TTL."""
    turn = WorkingMemoryTurn(
        role=role,  # type: ignore[arg-type]
        content=content,
        confidence=confidence,
        timestamp=datetime.utcnow(),
    )
    max_turns = settings.working_memory_max_turns

    if _redis_available():
        try:
            import redis.asyncio as aioredis
            async with aioredis.from_url(settings.redis_url, decode_responses=True) as redis:
                key = _session_key(clone_id, session_id)
                await redis.rpush(key, turn.model_dump_json())
                await redis.expire(key, SESSION_TTL_SECONDS)

            # Fire-and-forget compaction (no await — runs in background)
            try:
                asyncio.create_task(_maybe_compact_redis(clone_id, session_id, max_turns))
            except RuntimeError:
                pass  # no running event loop (tests); skip
            return
        except Exception:
            pass  # fall through to local store

    _local_store[_session_key(clone_id, session_id)].append(turn.model_dump_json())
    _maybe_compact_local(clone_id, session_id, max_turns)


async def get_turns(
    clone_id: UUID,
    session_id: UUID,
    max_turns: int | None = None,
) -> list[WorkingMemoryTurn]:
    """Return conversation turns for the session, oldest first.

    If a compacted summary exists it is prepended as a single 'summary' turn
    so the full conversation context is preserved without exceeding the limit.

    Falls back to reasoning_traces when the cache is cold (Redis TTL expired
    or server restarted) so conversation context is never lost across restarts.
    """
    if max_turns is None:
        max_turns = settings.working_memory_max_turns

    if _redis_available():
        try:
            import redis.asyncio as aioredis
            async with aioredis.from_url(settings.redis_url, decode_responses=True) as redis:
                key = _session_key(clone_id, session_id)
                skey = _summary_key(clone_id, session_id)
                raw_turns, summary_text = await asyncio.gather(
                    redis.lrange(key, -max_turns, -1),
                    redis.get(skey),
                )
                if raw_turns:
                    turns = [WorkingMemoryTurn.model_validate_json(t) for t in raw_turns]
                    if summary_text:
                        summary_turn = WorkingMemoryTurn(
                            role="summary",
                            content=summary_text,
                            timestamp=datetime.utcnow(),
                        )
                        return [summary_turn, *turns]
                    return turns
        except Exception:
            pass  # fall through to local store

    key = _session_key(clone_id, session_id)
    raw = _local_store.get(key, [])
    if raw:
        turns = [WorkingMemoryTurn.model_validate_json(t) for t in raw[-max_turns:]]
        summary_text = _local_summaries.get(key)
        if summary_text:
            summary_turn = WorkingMemoryTurn(
                role="summary",
                content=summary_text,
                timestamp=datetime.utcnow(),
            )
            return [summary_turn, *turns]
        return turns

    # Cache is cold — rebuild from DB (handles Redis TTL expiry and server restarts)
    try:
        from sqlalchemy import text as _sql_text
        from doppel.brain.db.connection import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                _sql_text("""
                    SELECT brain_input->>'message' AS user_msg,
                           response                AS clone_msg,
                           confidence,
                           created_at
                    FROM reasoning_traces
                    WHERE clone_id = :cid AND session_id = :sid
                    ORDER BY created_at ASC
                    LIMIT :n
                """),
                {"cid": str(clone_id), "sid": str(session_id), "n": max_turns},
            )
            db_turns: list[WorkingMemoryTurn] = []
            for r in rows.mappings():
                ts = r["created_at"] or datetime.utcnow()
                if r["user_msg"]:
                    db_turns.append(WorkingMemoryTurn(role="user", content=r["user_msg"], timestamp=ts))
                if r["clone_msg"]:
                    db_turns.append(WorkingMemoryTurn(
                        role="clone",
                        content=r["clone_msg"],
                        confidence=float(r["confidence"]) if r["confidence"] is not None else None,
                        timestamp=ts,
                    ))
        if db_turns:
            # Repopulate cache so subsequent requests are fast
            for turn in db_turns:
                await append_turn(clone_id, session_id, turn.role, turn.content, turn.confidence)
        return db_turns[-max_turns:]
    except Exception:
        return []


async def clear_session(clone_id: UUID, session_id: UUID) -> None:
    """Clear the working memory for a session (e.g. on explicit close)."""
    if _redis_available():
        try:
            import redis.asyncio as aioredis
            async with aioredis.from_url(settings.redis_url, decode_responses=True) as redis:
                await redis.delete(
                    _session_key(clone_id, session_id),
                    _summary_key(clone_id, session_id),
                )
            return
        except Exception:
            pass

    key = _session_key(clone_id, session_id)
    _local_store.pop(key, None)
    _local_summaries.pop(key, None)


def format_for_prompt(turns: list[WorkingMemoryTurn]) -> str:
    """
    Render working memory turns as a conversation history block
    for injection into the system/user prompt.
    """
    if not turns:
        return ""

    lines = ["## Recent conversation history"]
    for turn in turns:
        if turn.role == "summary":
            lines.append(f"[Earlier conversation — summarised]\n{turn.content}")
        elif turn.role == "user":
            lines.append(f"User: {turn.content}")
        else:
            lines.append(f"You (clone): {turn.content}")
    return "\n".join(lines)
