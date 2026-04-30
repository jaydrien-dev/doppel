"""
Notion ingestion connector.

Ingests page titles and text block content from Notion pages the user has
shared with the integration. Images, databases, and embeds are skipped —
only prose text is stored.

OAuth flow:
  1. GET  /ingestion/notion/auth-url?clone_id=X  →  redirect to Notion
  2. GET  /ingestion/notion/callback?code=X&state=X  →  store token
  3. POST /ingestion/notion/sync  →  background job
"""
from __future__ import annotations

import urllib.parse
from datetime import datetime, timezone
from typing import AsyncGenerator
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_notion_client_id, get_notion_client_secret
from doppel.config import settings
from doppel.ingestion.connectors.base import RawItem

_NOTION_API = "https://api.notion.com/v1"
_OAUTH_URL = "https://api.notion.com/v1/oauth/authorize"
_TOKEN_URL = "https://api.notion.com/v1/oauth/token"

# Text block types to extract content from
_TEXT_BLOCK_TYPES = {
    "paragraph",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list_item",
    "numbered_list_item",
    "toggle",
    "quote",
    "callout",
}


def get_auth_url(clone_id: UUID) -> str:
    params = {
        "client_id": get_notion_client_id(),
        "response_type": "code",
        "owner": "user",
        "redirect_uri": settings.notion_redirect_uri,
        "state": str(clone_id),
    }
    return f"{_OAUTH_URL}?{urllib.parse.urlencode(params)}"


async def handle_callback(code: str, session: AsyncSession, clone_id: UUID) -> None:
    """Exchange OAuth code for access token and store it."""
    import base64
    credentials = base64.b64encode(
        f"{get_notion_client_id()}:{get_notion_client_secret()}".encode()
    ).decode()

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            _TOKEN_URL,
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/json",
            },
            json={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.notion_redirect_uri,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    access_token = data.get("access_token", "")
    if not access_token:
        raise ValueError(f"Notion OAuth failed: {data.get('error', data)}")

    await session.execute(
        text("""
            INSERT INTO oauth_tokens (clone_id, provider, access_token)
            VALUES (:cid, 'notion', :token)
            ON CONFLICT (clone_id, provider)
            DO UPDATE SET access_token = EXCLUDED.access_token, created_at = now()
        """),
        {"cid": str(clone_id), "token": access_token},
    )
    await session.commit()


async def get_access_token(session: AsyncSession, clone_id: UUID) -> str | None:
    row = await session.execute(
        text("SELECT access_token FROM oauth_tokens WHERE clone_id = :cid AND provider = 'notion'"),
        {"cid": str(clone_id)},
    )
    rec = row.mappings().first()
    return rec["access_token"] if rec else None


def _extract_rich_text(rich_text_list: list) -> str:
    """Concatenate plain_text from a rich_text array."""
    return "".join(rt.get("plain_text", "") for rt in rich_text_list)


def _extract_block_text(block: dict) -> str:
    """Extract readable text from a single Notion block."""
    block_type = block.get("type", "")
    if block_type not in _TEXT_BLOCK_TYPES:
        return ""
    block_data = block.get(block_type, {})
    rich_text = block_data.get("rich_text", [])
    return _extract_rich_text(rich_text).strip()


async def _get_page_blocks(client: httpx.AsyncClient, page_id: str) -> str:
    """Fetch all text blocks from a page and return concatenated prose."""
    lines: list[str] = []
    cursor = None

    while True:
        params: dict = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor

        resp = await client.get(
            f"{_NOTION_API}/blocks/{page_id}/children",
            params=params,
        )
        if resp.status_code != 200:
            break

        data = resp.json()
        for block in data.get("results", []):
            line = _extract_block_text(block)
            if line:
                lines.append(line)

        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")

    return "\n".join(lines)


async def fetch_items(
    clone_id: UUID,
    access_token: str,
) -> AsyncGenerator[RawItem, None]:
    """
    Yield RawItem instances for each Notion page the user has shared.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        # Search for all pages accessible to this integration
        cursor = None
        pages_seen = 0

        while pages_seen < 200:  # cap at 200 pages
            body: dict = {"filter": {"value": "page", "property": "object"}, "page_size": 50}
            if cursor:
                body["start_cursor"] = cursor

            resp = await client.post(f"{_NOTION_API}/search", json=body)
            if resp.status_code != 200:
                break

            data = resp.json()
            results = data.get("results", [])

            for page in results:
                pages_seen += 1
                page_id = page.get("id", "")
                if not page_id:
                    continue

                # Extract page title
                title = ""
                props = page.get("properties", {})
                for prop_name in ("title", "Name", "Title"):
                    prop = props.get(prop_name, {})
                    if prop.get("type") == "title":
                        title = _extract_rich_text(prop.get("title", []))
                        break

                # Get last edited time
                last_edited_str = page.get("last_edited_time")
                created_at = (
                    datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
                    if last_edited_str else None
                )

                # Fetch block content
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
                    metadata={"page_id": page_id, "title": title, "type": "page"},
                )

            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")
