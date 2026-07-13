"""
Observation Scheduler — polls observation sources on schedule.

Runs as a background asyncio task alongside the FastAPI server.
Every 120 seconds:
  1. Query observation_sources WHERE enabled=TRUE AND mode='poll' AND next_poll_at <= NOW()
  2. For each due source: fire run_observation() in background
  3. Compute and set next_poll_at based on frequency

Follows the same pattern as AutomationScheduler (doppel/brain/tasks/scheduler.py).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from doppel.brain.tasks.scheduler import compute_next_run

_log = logging.getLogger(__name__)

_TICK_INTERVAL = 120  # seconds between scheduler checks (2 min)


class ObservationScheduler:
    """Singleton background loop for polling observation sources."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._loop(), name="observation-scheduler")
        _log.info("ObservationScheduler started")

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        _log.info("ObservationScheduler stopped")

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._tick()
            except Exception as exc:
                _log.error("ObservationScheduler tick error: %s", exc, exc_info=True)
            await asyncio.sleep(_TICK_INTERVAL)

    async def _tick(self) -> None:
        """Check for due observation sources and fire them."""
        from sqlalchemy import text as sql_text
        from doppel.brain.db.connection import AsyncSessionLocal

        now = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as session:
            rows = await session.execute(
                sql_text("""
                    SELECT clone_id, source_type, frequency
                    FROM observation_sources
                    WHERE enabled = TRUE
                      AND mode = 'poll'
                      AND status != 'running'
                      AND (next_poll_at IS NULL OR next_poll_at <= :now)
                    LIMIT 20
                """),
                {"now": now},
            )
            due = rows.mappings().all()

        for source in due:
            clone_id = UUID(str(source["clone_id"]))
            source_type = source["source_type"]
            frequency = source["frequency"]
            asyncio.create_task(
                self._fire_observation(clone_id, source_type, frequency),
                name=f"observe-{clone_id}-{source_type}",
            )

    async def _fire_observation(
        self,
        clone_id: UUID,
        source_type: str,
        frequency: str,
    ) -> None:
        """Run observation and update next_poll_at."""
        from sqlalchemy import text as sql_text
        from doppel.brain.db.connection import AsyncSessionLocal
        from doppel.observation.engine import run_observation

        # Compute next poll time
        now = datetime.now(timezone.utc)
        next_poll = compute_next_run(frequency, after=now)

        # Set next_poll_at immediately to prevent double-firing
        async with AsyncSessionLocal() as session:
            await session.execute(
                sql_text("""
                    UPDATE observation_sources
                    SET next_poll_at = :next_poll, updated_at = NOW()
                    WHERE clone_id = :cid AND source_type = :stype
                """),
                {"next_poll": next_poll, "cid": str(clone_id), "stype": source_type},
            )
            await session.commit()

        # Run the actual observation
        try:
            async with AsyncSessionLocal() as session:
                from doppel.brain.context import load_clone_keys
                await load_clone_keys(session, clone_id)
                result = await run_observation(clone_id, source_type, session)
                _log.info(
                    "Observation %s/%s complete: %s (next: %s)",
                    clone_id, source_type, result, next_poll.isoformat(),
                )
        except Exception as exc:
            _log.error("Observation %s/%s failed: %s", clone_id, source_type, exc, exc_info=True)


# Singleton instance used by FastAPI lifespan
observation_scheduler = ObservationScheduler()
