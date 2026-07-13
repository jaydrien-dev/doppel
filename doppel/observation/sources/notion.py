"""
Notion observation adapter — watches for page edits.

Wraps the existing notion connector, adding last_edited_time filtering
for incremental observation.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.ingestion.connectors.base import RawItem
from doppel.ingestion.connectors.notion import (
    get_access_token,
    _extract_rich_text,
    _get_page_blocks,
    _NOTION_API,
)

_log = logging.getLogger(__name__)
_MAX_PAGES_PER_RUN = 50


class NotionObservationAdapter:
    """Passive observation adapter for Notion."""

    def __init__(self) -> None:
        self._latest_edited: str | None = None

    async def fetch_since(
        self,
        clone_id: UUID,
        cursor: str | None,
        last_at: datetime | None,
        config: dict,
        session: AsyncSession,
    ) -> AsyncIterator[RawItem]:
        token = await get_access_token(session, clone_id)
        if not token:
            _log.warning("No Notion token for clone %s", clone_id)
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        }

        # Determine since filter
        if cursor:
            since_iso = cursor
        elif last_at:
            since_iso = last_at.isoformat()
        else:
            since_iso = (datetime.now(timezone.utc) - timedelta(days=config.get("initial_days", 7))).isoformat()

        fetched = 0
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            search_cursor = None

            while fetched < _MAX_PAGES_PER_RUN:
                body: dict = {
                    "filter": {"value": "page", "property": "object"},
                    "sort": {"direction": "descending", "timestamp": "last_edited_time"},
                    "page_size": 50,
                }
                if search_cursor:
                    body["start_cursor"] = search_cursor

                resp = await client.post(f"{_NOTION_API}/search", json=body)
                if resp.status_code != 200:
                    break

                data = resp.json()
                results = data.get("results", [])
                found_old = False

                for page in results:
                    if fetched >= _MAX_PAGES_PER_RUN:
                        break

                    last_edited = page.get("last_edited_time", "")
                    if last_edited and last_edited <= since_iso:
                        found_old = True
                        break

                    # Track latest
                    if last_edited and (not self._latest_edited or last_edited > self._latest_edited):
                        self._latest_edited = last_edited

                    page_id = page.get("id", "")
                    if not page_id:
                        continue

                    # Extract title
                    title = ""
                    props = page.get("properties", {})
                    for prop_name in ("title", "Name", "Title"):
                        prop = props.get(prop_name, {})
                        if prop.get("type") == "title":
                            title = _extract_rich_text(prop.get("title", []))
                            break

                    created_at = (
                        datetime.fromisoformat(last_edited.replace("Z", "+00:00"))
                        if last_edited else datetime.now(timezone.utc)
                    )

                    try:
                        body_text = await _get_page_blocks(client, page_id)
                    except Exception:
                        body_text = ""

                    if not body_text and not title:
                        continue

                    content = f"Notion page: {title}" if title else "Notion page"
                    if body_text and len(body_text) > 30:
                        content += f"\n\n{body_text[:2000]}"

                    if len(content) < 40:
                        continue

                    yield RawItem(
                        content=content,
                        source="notion",
                        authored_by_user=True,
                        context_type="document",
                        created_at=created_at,
                        metadata={"page_id": page_id, "title": title},
                    )
                    fetched += 1

                if found_old or not data.get("has_more"):
                    break
                search_cursor = data.get("next_cursor")

        _log.info("Notion observation: %d pages", fetched)

    def get_cursor(self) -> str | None:
        return self._latest_edited
