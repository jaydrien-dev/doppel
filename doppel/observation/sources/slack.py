"""
Slack observation adapter — watches user's messages across all joined channels.

Uses the Slack Web API (conversations.list + conversations.history) to poll
for messages authored by the user. Captures surrounding context messages too.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from uuid import UUID

import httpx
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.security.encryption import decrypt_field
from doppel.ingestion.connectors.base import RawItem

_log = logging.getLogger(__name__)
_SLACK_API = "https://slack.com/api"
_MAX_ITEMS_PER_RUN = 200


class SlackObservationAdapter:
    """Passive observation adapter for Slack."""

    def __init__(self) -> None:
        self._latest_ts: str | None = None

    async def fetch_since(
        self,
        clone_id: UUID,
        cursor: str | None,
        last_at: datetime | None,
        config: dict,
        session: AsyncSession,
    ) -> AsyncIterator[RawItem]:
        # Get bot token + user ID from slack_installations
        row = (await session.execute(
            sql_text("""
                SELECT bot_token, bot_user_id, authed_user_id
                FROM slack_installations
                WHERE clone_id = :cid LIMIT 1
            """),
            {"cid": str(clone_id)},
        )).mappings().first()

        if not row:
            _log.warning("No Slack installation for clone %s", clone_id)
            return

        bot_token = decrypt_field(row["bot_token"]) or ""
        user_id = row.get("authed_user_id") or row.get("bot_user_id") or ""
        headers = {"Authorization": f"Bearer {bot_token}"}

        # Compute oldest timestamp to fetch from
        if cursor:
            oldest = cursor
        elif last_at:
            oldest = str(last_at.timestamp())
        else:
            oldest = str((datetime.now(timezone.utc) - timedelta(days=config.get("initial_days", 3))).timestamp())

        fetched = 0
        async with httpx.AsyncClient(timeout=30.0) as client:
            # List joined channels
            channels_resp = await client.get(
                f"{_SLACK_API}/conversations.list",
                headers=headers,
                params={"types": "public_channel,private_channel", "limit": 200, "exclude_archived": "true"},
            )
            if channels_resp.status_code != 200:
                return
            channels_data = channels_resp.json()
            if not channels_data.get("ok"):
                _log.warning("Slack conversations.list failed: %s", channels_data.get("error"))
                return

            for channel in channels_data.get("channels", []):
                if fetched >= _MAX_ITEMS_PER_RUN:
                    break

                channel_id = channel["id"]
                channel_name = channel.get("name", "")

                # Fetch history since cursor
                history_resp = await client.get(
                    f"{_SLACK_API}/conversations.history",
                    headers=headers,
                    params={"channel": channel_id, "oldest": oldest, "limit": 100},
                )
                if history_resp.status_code != 200:
                    continue
                history_data = history_resp.json()
                if not history_data.get("ok"):
                    continue

                for msg in history_data.get("messages", []):
                    if fetched >= _MAX_ITEMS_PER_RUN:
                        break

                    text_content = msg.get("text", "").strip()
                    if not text_content or len(text_content) < 10:
                        continue

                    msg_user = msg.get("user", "")
                    is_authored = msg_user == user_id
                    ts = msg.get("ts", "")

                    # Track latest timestamp for cursor
                    if not self._latest_ts or (ts and ts > self._latest_ts):
                        self._latest_ts = ts

                    try:
                        created_at = datetime.fromtimestamp(float(ts), tz=timezone.utc) if ts else datetime.now(timezone.utc)
                    except (ValueError, OSError):
                        created_at = datetime.now(timezone.utc)

                    yield RawItem(
                        content=f"Slack #{channel_name}: {text_content}",
                        content_type="text",
                        source="slack",
                        authored_by_user=is_authored,
                        context_type="message",
                        created_at=created_at,
                        metadata={
                            "channel_id": channel_id,
                            "channel_name": channel_name,
                            "user": msg_user,
                            "ts": ts,
                            "thread_ts": msg.get("thread_ts"),
                        },
                    )
                    fetched += 1

        _log.info("Slack observation: %d messages across channels", fetched)

    def get_cursor(self) -> str | None:
        return self._latest_ts
