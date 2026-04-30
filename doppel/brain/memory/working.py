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
    """Return conversation turns for the session, oldest first."""
    if max_turns is None:
        max_turns = settings.working_memory_max_turns

    if _redis_available():
        try:
            import redis.asyncio as aioredis
            async with aioredis.from_url(settings.redis_url, decode_responses=True) as redis:
                key = _session_key(clone_id, session_id)
                raw_turns = await redis.lrange(key, -max_turns, -1)
                return [WorkingMemoryTurn.model_validate_json(t) for t in raw_turns]
        except Exception:
            pass  # fall through to local store

    raw = _local_store.get(_session_key(clone_id, session_id), [])
    return [WorkingMemoryTurn.model_validate_json(t) for t in raw[-max_turns:]]


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
