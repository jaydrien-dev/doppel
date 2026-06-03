"""
Working memory: the in-session context manager.
Backed by Redis when available; falls back to an in-process dict for local dev.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from uuid import UUID

from doppel.brain.models.types import WorkingMemoryTurn
from doppel.config import settings

# TTL for session state: 4 hours of inactivity clears the session
SESSION_TTL_SECONDS = 4 * 60 * 60

# In-memory fallback when Redis is unavailable
_local_store: dict[str, list[str]] = defaultdict(list)


def _session_key(clone_id: UUID, session_id: UUID) -> str:
    return f"doppel:wm:{clone_id}:{session_id}"


def _redis_available() -> bool:
    return bool(settings.redis_url and settings.redis_url != "")


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
    if _redis_available():
        try:
            import redis.asyncio as aioredis
            async with aioredis.from_url(settings.redis_url, decode_responses=True) as redis:
                key = _session_key(clone_id, session_id)
                await redis.rpush(key, turn.model_dump_json())
                await redis.expire(key, SESSION_TTL_SECONDS)
            return
        except Exception:
            pass  # fall through to local store

    _local_store[_session_key(clone_id, session_id)].append(turn.model_dump_json())


async def get_turns(
    clone_id: UUID,
    session_id: UUID,
    max_turns: int | None = None,
) -> list[WorkingMemoryTurn]:
    """Return conversation turns for the session, oldest first.

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
                raw_turns = await redis.lrange(key, -max_turns, -1)
                if raw_turns:
                    return [WorkingMemoryTurn.model_validate_json(t) for t in raw_turns]
        except Exception:
            pass  # fall through to local store

    raw = _local_store.get(_session_key(clone_id, session_id), [])
    if raw:
        return [WorkingMemoryTurn.model_validate_json(t) for t in raw[-max_turns:]]

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
                await redis.delete(_session_key(clone_id, session_id))
            return
        except Exception:
            pass

    _local_store.pop(_session_key(clone_id, session_id), None)


def format_for_prompt(turns: list[WorkingMemoryTurn]) -> str:
    """
    Render working memory turns as a conversation history block
    for injection into the system/user prompt.
    """
    if not turns:
        return ""

    lines = ["## Recent conversation history"]
    for turn in turns:
        label = "User" if turn.role == "user" else "You (clone)"
        lines.append(f"{label}: {turn.content}")
    return "\n".join(lines)
