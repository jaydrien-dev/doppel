"""
Google Calendar observation adapter — watches calendar events.

NEW connector (no existing gcal connector to wrap). Uses the same Google
OAuth token as Gmail (scopes include calendar read access).
Captures meeting titles, attendees, descriptions, and time ranges.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.ingestion.connectors.base import RawItem
from doppel.ingestion.connectors.gmail import _get_valid_token

_log = logging.getLogger(__name__)
_GCAL_API = "https://www.googleapis.com/calendar/v3"
_MAX_EVENTS_PER_RUN = 100


class GCalObservationAdapter:
    """Passive observation adapter for Google Calendar."""

    def __init__(self) -> None:
        self._latest_updated: str | None = None

    async def fetch_since(
        self,
        clone_id: UUID,
        cursor: str | None,
        last_at: datetime | None,
        config: dict,
        session: AsyncSession,
    ) -> AsyncIterator[RawItem]:
        token = await _get_valid_token(clone_id, session)
        headers = {"Authorization": f"Bearer {token}"}

        # Determine time range
        if cursor:
            time_min = cursor
        elif last_at:
            time_min = last_at.isoformat()
        else:
            time_min = (datetime.now(timezone.utc) - timedelta(days=config.get("initial_days", 14))).isoformat()

        # Fetch up to 2 weeks ahead for upcoming meetings
        time_max = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

        fetched = 0
        async with httpx.AsyncClient(timeout=30.0) as client:
            page_token: str | None = None

            while fetched < _MAX_EVENTS_PER_RUN:
                params: dict = {
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "maxResults": 50,
                }
                if page_token:
                    params["pageToken"] = page_token

                resp = await client.get(
                    f"{_GCAL_API}/calendars/primary/events",
                    headers=headers,
                    params=params,
                )

                if resp.status_code == 401:
                    # Token expired, refresh
                    token = await _get_valid_token(clone_id, session)
                    headers = {"Authorization": f"Bearer {token}"}
                    resp = await client.get(
                        f"{_GCAL_API}/calendars/primary/events",
                        headers=headers,
                        params=params,
                    )

                if resp.status_code != 200:
                    _log.warning("GCal events list returned %s", resp.status_code)
                    break

                data = resp.json()
                events = data.get("items", [])

                for event in events:
                    if fetched >= _MAX_EVENTS_PER_RUN:
                        break

                    title = event.get("summary", "").strip()
                    if not title:
                        continue

                    # Skip cancelled events
                    if event.get("status") == "cancelled":
                        continue

                    # Parse times
                    start_data = event.get("start", {})
                    end_data = event.get("end", {})
                    start_str = start_data.get("dateTime") or start_data.get("date", "")
                    end_str = end_data.get("dateTime") or end_data.get("date", "")

                    # Track latest updated time
                    updated = event.get("updated", "")
                    if updated and (not self._latest_updated or updated > self._latest_updated):
                        self._latest_updated = updated

                    # Parse attendees
                    attendees = event.get("attendees", [])
                    attendee_list = [
                        a.get("displayName") or a.get("email", "")
                        for a in attendees
                        if not a.get("self")
                    ]

                    description = (event.get("description") or "")[:500].strip()

                    # Build content
                    content = f"Calendar event: {title}\nWhen: {start_str} - {end_str}"
                    if attendee_list:
                        content += f"\nAttendees: {', '.join(attendee_list[:10])}"
                    if description:
                        content += f"\nDescription: {description}"

                    try:
                        created_at = datetime.fromisoformat(start_str.replace("Z", "+00:00")) if start_str else datetime.now(timezone.utc)
                    except (ValueError, TypeError):
                        created_at = datetime.now(timezone.utc)

                    yield RawItem(
                        content=content,
                        content_type="text",
                        source="gcal",
                        authored_by_user=True,
                        context_type="calendar_event",
                        created_at=created_at,
                        metadata={
                            "event_id": event.get("id", ""),
                            "title": title,
                            "attendees": attendee_list[:10],
                            "start": start_str,
                            "end": end_str,
                        },
                    )
                    fetched += 1

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

        _log.info("GCal observation: %d events", fetched)

    def get_cursor(self) -> str | None:
        return self._latest_updated
