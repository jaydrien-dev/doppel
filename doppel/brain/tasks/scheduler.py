"""
Automation Scheduler — runs automations on schedule using a background asyncio loop.

Every 60 seconds:
  1. Query clone_automations WHERE status='active' AND next_run_at <= NOW()
  2. For each due automation: create a clone_tasks row, fire run_task() in background
  3. Update last_run_at, run_count, next_run_at on the automation

Schedule string format:
  "hourly"              → every hour, on the hour
  "daily:HH:MM"         → every day at HH:MM UTC (e.g. "daily:09:00")
  "weekly:DOW:HH:MM"    → every week on DOW at HH:MM (e.g. "weekly:mon:09:00")
  "weekdays:HH:MM"      → every Mon–Fri at HH:MM UTC
  "monthly:DD:HH:MM"    → every month on day DD at HH:MM (e.g. "monthly:1:09:00")
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

_log = logging.getLogger(__name__)

_TICK_INTERVAL = 60   # seconds between scheduler checks


# ---------------------------------------------------------------------------
# Schedule computation
# ---------------------------------------------------------------------------

def compute_next_run(schedule: str, after: datetime | None = None) -> datetime:
    """Return the next UTC datetime when this schedule should fire."""
    now = after or datetime.now(timezone.utc)

    # hourly
    if schedule == "hourly":
        return now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

    parts = schedule.split(":")

    # daily:HH:MM
    if parts[0] == "daily" and len(parts) >= 3:
        try:
            h, m = int(parts[1]), int(parts[2])
            candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
            if candidate <= now:
                candidate += timedelta(days=1)
            return candidate
        except (ValueError, IndexError):
            pass

    # weekly:DOW:HH:MM
    if parts[0] == "weekly" and len(parts) >= 4:
        try:
            _DOW = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
            target_dow = _DOW.get(parts[1].lower(), 0)
            h, m = int(parts[2]), int(parts[3])
            candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
            days_ahead = (target_dow - now.weekday()) % 7
            if days_ahead == 0 and candidate <= now:
                days_ahead = 7
            candidate += timedelta(days=days_ahead)
            return candidate
        except (ValueError, IndexError):
            pass

    # weekdays:HH:MM
    if parts[0] == "weekdays" and len(parts) >= 3:
        try:
            h, m = int(parts[1]), int(parts[2])
            candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
            if candidate <= now:
                candidate += timedelta(days=1)
            while candidate.weekday() >= 5:  # skip Sat/Sun
                candidate += timedelta(days=1)
            return candidate
        except (ValueError, IndexError):
            pass

    # monthly:DD:HH:MM
    if parts[0] == "monthly" and len(parts) >= 4:
        try:
            day, h, m = int(parts[1]), int(parts[2]), int(parts[3])
            candidate = now.replace(day=min(day, 28), hour=h, minute=m, second=0, microsecond=0)
            if candidate <= now:
                # Move to next month
                if now.month == 12:
                    candidate = candidate.replace(year=now.year + 1, month=1)
                else:
                    candidate = candidate.replace(month=now.month + 1)
            return candidate
        except (ValueError, IndexError):
            pass

    # fallback: 1 hour from now
    _log.warning("Unknown schedule format %r — defaulting to hourly", schedule)
    return now + timedelta(hours=1)


# ---------------------------------------------------------------------------
# Scheduler loop
# ---------------------------------------------------------------------------

class AutomationScheduler:
    """Runs in a single background asyncio task alongside the FastAPI server."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._loop(), name="automation-scheduler")
        _log.info("AutomationScheduler started")

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        _log.info("AutomationScheduler stopped")

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._tick()
            except Exception as exc:
                _log.error("AutomationScheduler tick error: %s", exc, exc_info=True)
            await asyncio.sleep(_TICK_INTERVAL)

    async def _tick(self) -> None:
        """Check for due automations and fire due workflows."""
        from sqlalchemy import text as sql_text
        from doppel.brain.db.connection import AsyncSessionLocal
        from doppel.brain.tasks.workflow_engine import tick_workflows

        # Workflow engine tick — deterministic, no LLM
        try:
            await tick_workflows()
        except Exception as exc:
            _log.error("Workflow engine tick error: %s", exc, exc_info=True)

        now = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as session:
            rows = await session.execute(
                sql_text("""
                    SELECT id, clone_id, name, instruction, schedule
                    FROM clone_automations
                    WHERE status = 'active'
                      AND (next_run_at IS NULL OR next_run_at <= :now)
                    LIMIT 20
                """),
                {"now": now},
            )
            due = rows.mappings().all()

        for auto in due:
            auto_id = UUID(str(auto["id"]))
            clone_id = UUID(str(auto["clone_id"]))
            await self._fire_automation(auto_id, clone_id, auto["instruction"], auto["schedule"], auto["name"])

    async def _fire_automation(
        self,
        auto_id: UUID,
        clone_id: UUID,
        instruction: str,
        schedule: str,
        name: str,
    ) -> None:
        """Create a task for this automation and kick it off."""
        from sqlalchemy import text as sql_text
        from doppel.brain.db.connection import AsyncSessionLocal
        from doppel.brain.tasks.runner import run_task

        now = datetime.now(timezone.utc)
        next_run = compute_next_run(schedule, after=now)
        task_id = uuid4()

        async with AsyncSessionLocal() as session:
            # Create the task
            await session.execute(
                sql_text("""
                    INSERT INTO clone_tasks (id, clone_id, title, instruction, status, automation_id)
                    VALUES (:tid, :cid, :title, :instr, 'pending', :auto_id)
                """),
                {
                    "tid": str(task_id),
                    "cid": str(clone_id),
                    "title": f"Auto: {name}",
                    "instr": instruction,
                    "auto_id": str(auto_id),
                },
            )
            # Update automation state
            await session.execute(
                sql_text("""
                    UPDATE clone_automations
                    SET last_run_at = :now,
                        next_run_at = :next_run,
                        run_count   = run_count + 1,
                        last_task_id = :tid,
                        updated_at  = :now
                    WHERE id = :auto_id
                """),
                {
                    "now": now,
                    "next_run": next_run,
                    "tid": str(task_id),
                    "auto_id": str(auto_id),
                },
            )
            await session.commit()

        # Fire the task in background
        asyncio.create_task(run_task(task_id), name=f"task-{task_id}")
        _log.info("Automation %s fired → task %s (next run: %s)", auto_id, task_id, next_run.isoformat())


# Singleton instance used by FastAPI lifespan
scheduler = AutomationScheduler()
