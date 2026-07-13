"""
Gmail observation adapter — watches sent AND received emails.

Extends the existing GmailConnector pattern to support incremental observation:
  - Uses Gmail History API when a historyId cursor is available (efficient)
  - Falls back to list+filter with date range on first run
  - Captures both sent (authored_by_user=True) and received (authored_by_user=False) emails
  - Thread context: for received emails, captures who sent them and the subject
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.ingestion.connectors.base import RawItem
from doppel.ingestion.connectors.gmail import (
    _get_valid_token,
    _fetch_single_email,
    _get_header,
    _extract_body,
    _decode_base64,
    _parse_date,
)

_log = logging.getLogger(__name__)
_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1"
_MAX_ITEMS_PER_RUN = 200


class GmailObservationAdapter:
    """Passive observation adapter for Gmail."""

    def __init__(self) -> None:
        self._latest_history_id: str | None = None

    async def fetch_since(
        self,
        clone_id: UUID,
        cursor: str | None,
        last_at: datetime | None,
        config: dict,
        session: AsyncSession,
    ) -> AsyncIterator[RawItem]:
        """
        Yield new emails since the cursor.
        If cursor (historyId) exists, use History API.
        Otherwise, use list with date filter (first run).
        """
        token = await _get_valid_token(clone_id, session)
        headers = {"Authorization": f"Bearer {token}"}

        if cursor:
            # Incremental: use History API
            async for item in self._fetch_via_history(headers, cursor):
                yield item
        else:
            # First run: fetch recent emails (last 7 days for initial observation)
            since_days = config.get("initial_days", 7)
            async for item in self._fetch_via_list(headers, since_days):
                yield item

        # Get current profile to store latest historyId as cursor
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.get(
                    f"{_GMAIL_BASE}/users/me/profile",
                    headers=headers,
                )
                resp.raise_for_status()
                self._latest_history_id = str(resp.json().get("historyId", ""))
            except Exception as exc:
                _log.warning("Failed to get Gmail profile historyId: %s", exc)

    async def _fetch_via_history(
        self,
        headers: dict,
        history_id: str,
    ) -> AsyncIterator[RawItem]:
        """Fetch new messages since historyId using Gmail History API."""
        fetched = 0
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(
                    f"{_GMAIL_BASE}/users/me/history",
                    headers=headers,
                    params={
                        "startHistoryId": history_id,
                        "historyTypes": "messageAdded",
                    },
                )
                if resp.status_code == 404:
                    _log.warning("Gmail historyId %s expired, falling back to list", history_id)
                    # Fallback: fetch last 3 days
                    async for item in self._fetch_via_list(headers, 3):
                        yield item
                    return
                resp.raise_for_status()
                history_data = resp.json()
            except httpx.HTTPStatusError as exc:
                _log.error("Gmail history fetch failed: %s", exc)
                return

            seen_ids: set[str] = set()
            for record in history_data.get("history", []):
                for added in record.get("messagesAdded", []):
                    msg_id = added["message"]["id"]
                    if msg_id in seen_ids:
                        continue
                    seen_ids.add(msg_id)

                    if fetched >= _MAX_ITEMS_PER_RUN:
                        return

                    try:
                        item = await _fetch_and_classify(client, headers, msg_id)
                        if item:
                            yield item
                            fetched += 1
                    except Exception as exc:
                        _log.warning("Failed to fetch message %s: %s", msg_id, exc)

        _log.info("Gmail observation (history): %d items", fetched)

    async def _fetch_via_list(
        self,
        headers: dict,
        since_days: int,
    ) -> AsyncIterator[RawItem]:
        """Fetch emails via list API with date filter (first run or fallback)."""
        since_date = (datetime.now(timezone.utc) - timedelta(days=since_days)).strftime("%Y/%m/%d")
        fetched = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            page_token: str | None = None

            while fetched < _MAX_ITEMS_PER_RUN:
                params: dict = {"q": f"after:{since_date}", "maxResults": 100}
                if page_token:
                    params["pageToken"] = page_token

                resp = await client.get(
                    f"{_GMAIL_BASE}/users/me/messages",
                    headers=headers,
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()

                messages = data.get("messages", [])
                if not messages:
                    break

                for msg_ref in messages:
                    if fetched >= _MAX_ITEMS_PER_RUN:
                        break
                    try:
                        item = await _fetch_and_classify(client, headers, msg_ref["id"])
                        if item:
                            yield item
                            fetched += 1
                    except Exception as exc:
                        _log.warning("Failed to fetch message %s: %s", msg_ref["id"], exc)

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

        _log.info("Gmail observation (list): %d items from last %d days", fetched, since_days)

    def get_cursor(self) -> str | None:
        """Return the latest historyId to use as cursor for next run."""
        return self._latest_history_id


async def _fetch_and_classify(
    client: httpx.AsyncClient,
    headers: dict,
    message_id: str,
) -> RawItem | None:
    """
    Fetch a single email and classify as sent (authored) or received (not authored).
    Returns a RawItem with appropriate flags.
    """
    resp = await client.get(
        f"{_GMAIL_BASE}/users/me/messages/{message_id}",
        headers=headers,
        params={"format": "full"},
    )
    resp.raise_for_status()
    msg = resp.json()

    payload = msg.get("payload", {})
    headers_list = payload.get("headers", [])
    label_ids = msg.get("labelIds", [])

    subject = _get_header(headers_list, "Subject") or "(no subject)"
    date_str = _get_header(headers_list, "Date") or ""
    from_header = _get_header(headers_list, "From") or ""
    to_header = _get_header(headers_list, "To") or ""

    created_at = _parse_date(date_str)
    body = _extract_body(payload)

    if not body or len(body.strip()) < 20:
        return None

    # Classify: if SENT label present, user authored it
    is_sent = "SENT" in label_ids
    authored_by_user = is_sent

    return RawItem(
        content=body,
        content_type="html" if "<" in body and ">" in body else "text",
        source="gmail",
        authored_by_user=authored_by_user,
        context_type="email_reply" if is_sent else "email_received",
        created_at=created_at,
        metadata={
            "subject": subject,
            "from": from_header,
            "to": to_header,
            "message_id": message_id,
            "thread_id": msg.get("threadId"),
        },
    )
