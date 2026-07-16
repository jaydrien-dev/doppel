"""
Observation Engine — core orchestrator for passive observation.

For each observation run:
  1. Load the observation source config (cursor, exclusion rules)
  2. Fetch new items from the connector since the cursor
  3. Filter through exclusion rules
  4. Run through the existing ingestion pipeline (chunk → embed → store)
  5. Tag all stored memories with observation_source
  6. Update the cursor position
  7. Log the run to observation_log
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.ingestion.connectors.base import RawItem
from doppel.observation.content_filter import should_observe

_log = logging.getLogger(__name__)


async def run_observation(
    clone_id: UUID,
    source_type: str,
    session: AsyncSession,
) -> dict:
    """
    Run a single observation cycle for one source on one clone.
    Returns {items_fetched, items_ingested, items_skipped, error?}.
    """
    start_ms = time.monotonic()
    log_id = uuid4()

    # 1. Load source config
    row = await session.execute(
        sql_text("""
            SELECT id, enabled, mode, frequency, last_observed_at, last_observed_cursor,
                   exclusion_rules, observation_config, status
            FROM observation_sources
            WHERE clone_id = :cid AND source_type = :stype
        """),
        {"cid": str(clone_id), "stype": source_type},
    )
    source = row.mappings().first()
    if not source or not source["enabled"]:
        return {"items_fetched": 0, "items_ingested": 0, "items_skipped": 0, "error": "Source not enabled"}

    # Mark as running
    await session.execute(
        sql_text("UPDATE observation_sources SET status = 'running', updated_at = NOW() WHERE id = :sid"),
        {"sid": str(source["id"])},
    )
    await session.commit()

    exclusion_rules = source["exclusion_rules"] or {}
    cursor = source["last_observed_cursor"]
    last_at = source["last_observed_at"]
    config = source["observation_config"] or {}

    items_fetched = 0
    items_ingested = 0
    items_skipped = 0
    error_msg = None
    new_cursor = cursor

    try:
        # 2. Fetch items from the appropriate adapter
        adapter = _get_adapter(source_type)
        raw_items: list[RawItem] = []

        async for item in adapter.fetch_since(clone_id, cursor, last_at, config, session):
            items_fetched += 1
            # 3. Filter
            if not should_observe(item, exclusion_rules):
                items_skipped += 1
                continue
            # Tag with observation source
            item.metadata["_observation_source"] = f"observation:{source_type}"
            raw_items.append(item)

        # 4. Process through pipeline
        if raw_items:
            from doppel.ingestion.pipeline import IngestionPipeline
            pipeline = IngestionPipeline(session)
            processed, failed = await pipeline._process_batch(clone_id, raw_items)
            items_ingested = processed

        # 4b. Trigger insight extraction if enough items were ingested
        if items_ingested >= 3:
            try:
                from doppel.observation.insight_extractor import extract_insights
                insights_count = await extract_insights(session, clone_id, source_type)
                _log.info("Insight extraction: %d insights from %s/%s", insights_count, clone_id, source_type)
            except Exception as exc:
                _log.warning("Insight extraction failed (non-fatal): %s", exc)

        # 5. Update cursor — use adapter's cursor value or fallback to now
        new_cursor = adapter.get_cursor() or cursor
        now = datetime.now(timezone.utc)

        await session.execute(
            sql_text("""
                UPDATE observation_sources SET
                    last_observed_at = :now,
                    last_observed_cursor = :cursor,
                    items_observed = items_observed + :fetched,
                    items_ingested = items_ingested + :ingested,
                    status = 'idle',
                    error_message = NULL,
                    error_count = 0,
                    updated_at = :now
                WHERE clone_id = :cid AND source_type = :stype
            """),
            {
                "now": now,
                "cursor": new_cursor,
                "fetched": items_fetched,
                "ingested": items_ingested,
                "cid": str(clone_id),
                "stype": source_type,
            },
        )
        await session.commit()

    except Exception as exc:
        error_msg = str(exc)[:500]
        _log.error("Observation error for %s/%s: %s", clone_id, source_type, exc, exc_info=True)
        await session.execute(
            sql_text("""
                UPDATE observation_sources SET
                    status = 'error',
                    error_message = :err,
                    error_count = error_count + 1,
                    updated_at = NOW()
                WHERE clone_id = :cid AND source_type = :stype
            """),
            {"err": error_msg, "cid": str(clone_id), "stype": source_type},
        )
        await session.commit()

    # 6. Log
    duration_ms = int((time.monotonic() - start_ms) * 1000)
    await session.execute(
        sql_text("""
            INSERT INTO observation_log
              (id, clone_id, source_type, items_fetched, items_ingested, items_skipped,
               duration_ms, error_message, started_at, completed_at)
            VALUES
              (:id, :cid, :stype, :fetched, :ingested, :skipped,
               :dur, :err, :started, :completed)
        """),
        {
            "id": str(log_id),
            "cid": str(clone_id),
            "stype": source_type,
            "fetched": items_fetched,
            "ingested": items_ingested,
            "skipped": items_skipped,
            "dur": duration_ms,
            "err": error_msg,
            "started": datetime.now(timezone.utc),
            "completed": datetime.now(timezone.utc),
        },
    )
    await session.commit()

    result = {
        "items_fetched": items_fetched,
        "items_ingested": items_ingested,
        "items_skipped": items_skipped,
    }
    if error_msg:
        result["error"] = error_msg

    _log.info(
        "Observation %s/%s: fetched=%d ingested=%d skipped=%d (%dms)",
        clone_id, source_type, items_fetched, items_ingested, items_skipped, duration_ms,
    )
    return result


def _get_adapter(source_type: str):
    """Return the appropriate observation adapter for the source type."""
    if source_type == "gmail":
        from doppel.observation.sources.gmail import GmailObservationAdapter
        return GmailObservationAdapter()
    if source_type == "slack":
        from doppel.observation.sources.slack import SlackObservationAdapter
        return SlackObservationAdapter()
    if source_type == "gdrive":
        from doppel.observation.sources.gdrive import GDriveObservationAdapter
        return GDriveObservationAdapter()
    if source_type == "github":
        from doppel.observation.sources.github import GitHubObservationAdapter
        return GitHubObservationAdapter()
    if source_type == "notion":
        from doppel.observation.sources.notion import NotionObservationAdapter
        return NotionObservationAdapter()
    if source_type == "gcal":
        from doppel.observation.sources.gcal import GCalObservationAdapter
        return GCalObservationAdapter()
    if source_type == "screenwatch":
        from doppel.observation.sources.screenwatch import ScreenwatchAdapter
        return ScreenwatchAdapter()
    raise ValueError(f"Unknown observation source: {source_type}")
