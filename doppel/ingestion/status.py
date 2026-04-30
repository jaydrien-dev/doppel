"""
Ingestion job tracker.
Durable state in Postgres; fast status reads via Redis (optional).
Falls back to Postgres-only reads when Redis is unavailable.
"""
from __future__ import annotations

import json
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.config import settings

_JOB_TTL = 60 * 60 * 24  # Redis key lives 24h


def _redis_key(job_id: UUID) -> str:
    return f"doppel:job:{job_id}"


async def _redis_set(key: str, value: dict) -> None:
    """Write to Redis, silently skip if Redis is unavailable."""
    if not settings.redis_url:
        return
    try:
        import redis.asyncio as aioredis
        async with aioredis.from_url(settings.redis_url, decode_responses=True) as redis:
            await redis.setex(key, _JOB_TTL, json.dumps(value))
    except Exception:
        pass


async def _redis_get(key: str) -> dict | None:
    """Read from Redis, return None if unavailable or missing."""
    if not settings.redis_url:
        return None
    try:
        import redis.asyncio as aioredis
        async with aioredis.from_url(settings.redis_url, decode_responses=True) as redis:
            raw = await redis.get(key)
            return json.loads(raw) if raw else None
    except Exception:
        return None


async def create_job(
    clone_id: UUID,
    source: str,
    session: AsyncSession,
) -> UUID:
    """Create a new ingestion job record. Returns the job_id."""
    job_id = uuid4()
    await session.execute(
        text("""
            INSERT INTO ingestion_jobs (id, clone_id, source, status)
            VALUES (:id, :clone_id, :source, 'pending')
        """),
        {"id": str(job_id), "clone_id": str(clone_id), "source": source},
    )
    await session.commit()
    await _redis_set(_redis_key(job_id), {"status": "pending", "processed": 0, "failed": 0, "total": 0})
    return job_id


async def start_job(job_id: UUID, total_items: int, session: AsyncSession) -> None:
    await session.execute(
        text("""
            UPDATE ingestion_jobs
            SET status = 'running', started_at = NOW(), total_items = :total
            WHERE id = :id
        """),
        {"id": str(job_id), "total": total_items},
    )
    await session.commit()
    await _redis_set(_redis_key(job_id), {"status": "running", "total": total_items, "processed": 0, "failed": 0})


async def update_job(
    job_id: UUID,
    processed: int,
    failed: int,
    session: AsyncSession,
) -> None:
    await session.execute(
        text("""
            UPDATE ingestion_jobs
            SET processed_items = :processed, failed_items = :failed
            WHERE id = :id
        """),
        {"id": str(job_id), "processed": processed, "failed": failed},
    )
    await session.commit()
    state = await _redis_get(_redis_key(job_id)) or {}
    state.update({"processed": processed, "failed": failed})
    await _redis_set(_redis_key(job_id), state)


async def complete_job(job_id: UUID, session: AsyncSession) -> None:
    await session.execute(
        text("""
            UPDATE ingestion_jobs
            SET status = 'done', completed_at = NOW()
            WHERE id = :id
        """),
        {"id": str(job_id)},
    )
    await session.commit()
    state = await _redis_get(_redis_key(job_id)) or {}
    state["status"] = "done"
    await _redis_set(_redis_key(job_id), state)


async def fail_job(job_id: UUID, error: str, session: AsyncSession) -> None:
    await session.execute(
        text("""
            UPDATE ingestion_jobs
            SET status = 'failed', error_message = :error, completed_at = NOW()
            WHERE id = :id
        """),
        {"id": str(job_id), "error": error[:500]},
    )
    await session.commit()
    state = await _redis_get(_redis_key(job_id)) or {}
    state.update({"status": "failed", "error": error[:200]})
    await _redis_set(_redis_key(job_id), state)


async def get_job_status(job_id: UUID, session: AsyncSession) -> dict:
    """Fast path: check Redis first, fall back to Postgres."""
    state = await _redis_get(_redis_key(job_id))
    if state:
        state["job_id"] = str(job_id)
        return state

    # Redis miss or unavailable — read from Postgres
    result = await session.execute(
        text("SELECT * FROM ingestion_jobs WHERE id = :id"),
        {"id": str(job_id)},
    )
    row = result.mappings().first()
    if row is None:
        return {"error": "Job not found"}

    return {
        "job_id": str(job_id),
        "status": row["status"],
        "total": row["total_items"],
        "processed": row["processed_items"],
        "failed": row["failed_items"],
        "error": row.get("error_message"),
    }
