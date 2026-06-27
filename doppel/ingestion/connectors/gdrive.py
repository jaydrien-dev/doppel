"""
Google Drive ingestion connector.

Fetches files from the user's Drive and yields them as RawItems for ingestion
into the clone's memory. Handles Google Workspace formats (Docs, Sheets, Slides)
and plain text / markdown / CSV files.

Token is read from clone_mcp_servers (written by the generic /oauth/gdrive/callback).
Refresh is handled automatically using the stored refresh_token.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import AsyncIterator
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.security.encryption import decrypt_field, encrypt_field
from doppel.config import settings
from doppel.ingestion.connectors.base import RawItem

log = logging.getLogger(__name__)

_DRIVE_API   = "https://www.googleapis.com/drive/v3"
_TOKEN_URL   = "https://oauth2.googleapis.com/token"
_EXPORT_URL  = "https://www.googleapis.com/drive/v3/files/{id}/export"
_DOWNLOAD_URL = "https://www.googleapis.com/drive/v3/files/{id}?alt=media"

# Google Workspace mime types → export format
_GOOGLE_EXPORT: dict[str, tuple[str, str]] = {
    "application/vnd.google-apps.document":     ("text/plain",  "Google Doc"),
    "application/vnd.google-apps.spreadsheet":  ("text/csv",    "Google Sheet"),
    "application/vnd.google-apps.presentation": ("text/plain",  "Google Slides"),
}

# Native types we can download directly as text
_NATIVE_TEXT = {
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/html",
    "application/json",
    "text/x-python",
    "text/javascript",
}

_MAX_FILES     = 100
_MAX_FILE_BYTES = 30_000   # ~30 KB per file


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

async def _get_tokens(clone_id: UUID, session: AsyncSession) -> tuple[str, str | None, str | None]:
    """
    Returns (access_token, refresh_token, row_id) from clone_mcp_servers.
    Raises ValueError if not connected.
    """
    row = (await session.execute(
        text(
            "SELECT id, api_key_enc, headers_enc "
            "FROM clone_mcp_servers "
            "WHERE clone_id = :cid AND name = 'Google Drive' "
            "LIMIT 1"
        ),
        {"cid": str(clone_id)},
    )).mappings().first()

    if not row:
        raise ValueError(f"Google Drive not connected for clone {clone_id}")

    access_token = decrypt_field(row["api_key_enc"]) or ""
    refresh_token: str | None = None
    if row["headers_enc"]:
        try:
            data = json.loads(decrypt_field(row["headers_enc"]) or "{}")
            refresh_token = data.get("refresh_token")
        except Exception:
            pass

    return access_token, refresh_token, str(row["id"])


async def _refresh_access_token(
    clone_id: UUID,
    refresh_token: str,
    row_id: str,
    session: AsyncSession,
) -> str:
    """Exchange refresh token for a new access token and persist it."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            _TOKEN_URL,
            data={
                "client_id":     settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": refresh_token,
                "grant_type":    "refresh_token",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    new_access = data["access_token"]
    expires_in = data.get("expires_in", 3600)
    new_expires = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
    await session.execute(
        text("UPDATE clone_mcp_servers SET api_key_enc = :tok, expires_at = :exp WHERE id = :id"),
        {"tok": encrypt_field(new_access), "exp": new_expires, "id": row_id},
    )
    await session.commit()
    return new_access


async def get_valid_token(clone_id: UUID, session: AsyncSession) -> str:
    """
    Return a valid access token, proactively refreshing if within 5 minutes
    of expiry. Mirrors gmail.py's _get_valid_token pattern exactly.
    """
    from sqlalchemy import text as _text
    from datetime import timedelta

    access_token, refresh_token, row_id = await _get_tokens(clone_id, session)

    # Check if the token is expired or near expiry
    if refresh_token and row_id:
        try:
            exp_row = (await session.execute(
                _text("SELECT expires_at FROM clone_mcp_servers WHERE id = :id"),
                {"id": row_id},
            )).mappings().first()
            expires_at = exp_row["expires_at"] if exp_row else None
            if expires_at is not None:
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at <= datetime.now(timezone.utc) + timedelta(minutes=5):
                    access_token = await _refresh_access_token(clone_id, refresh_token, row_id, session)
        except Exception:
            pass

    # Fallback: refresh if token is missing
    if not access_token and refresh_token:
        access_token = await _refresh_access_token(clone_id, refresh_token, row_id, session)

    return access_token


# ---------------------------------------------------------------------------
# File fetching
# ---------------------------------------------------------------------------

async def _export_google_file(
    client: httpx.AsyncClient,
    file_id: str,
    mime_type: str,
    token: str,
) -> str:
    """Export a Google Workspace file as plain text / CSV."""
    resp = await client.get(
        _EXPORT_URL.format(id=file_id),
        params={"mimeType": mime_type},
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code == 403:
        return ""  # no export permission
    resp.raise_for_status()
    return resp.text[:_MAX_FILE_BYTES]


async def _download_native_file(
    client: httpx.AsyncClient,
    file_id: str,
    token: str,
) -> str:
    """Download a native text file."""
    resp = await client.get(
        _DOWNLOAD_URL.format(id=file_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code in (403, 404):
        return ""
    resp.raise_for_status()
    return resp.text[:_MAX_FILE_BYTES]


async def fetch_items(
    clone_id: UUID,
    access_token: str,
    refresh_token: str | None = None,
    row_id: str | None = None,
    session: AsyncSession | None = None,
) -> AsyncIterator[RawItem]:
    """
    Yield RawItem for each Drive file that can be ingested as text.
    Handles pagination and auto-refreshes the token on 401.
    """
    token = access_token
    page_token: str | None = None
    fetched = 0

    # Build a combined mime query
    google_mimes = " or ".join(f"mimeType='{m}'" for m in _GOOGLE_EXPORT)
    native_mimes = " or ".join(f"mimeType='{m}'" for m in _NATIVE_TEXT)
    q = f"trashed=false and ({google_mimes} or {native_mimes})"

    async with httpx.AsyncClient(timeout=30) as client:
        while fetched < _MAX_FILES:
            params: dict = {
                "q":        q,
                "pageSize": 50,
                "fields":   "nextPageToken,files(id,name,mimeType,modifiedTime,size)",
                "orderBy":  "modifiedTime desc",
            }
            if page_token:
                params["pageToken"] = page_token

            list_resp = await client.get(
                f"{_DRIVE_API}/files",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )

            # Auto-refresh on 401
            if list_resp.status_code == 401 and refresh_token and session and row_id:
                try:
                    token = await _refresh_access_token(clone_id, refresh_token, row_id, session)
                    list_resp = await client.get(
                        f"{_DRIVE_API}/files",
                        params=params,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                except Exception as e:
                    log.error("[gdrive] Token refresh failed: %s", e)
                    return

            if list_resp.status_code != 200:
                log.warning("[gdrive] files.list returned %s", list_resp.status_code)
                break

            data      = list_resp.json()
            files     = data.get("files", [])
            page_token = data.get("nextPageToken")

            for f in files:
                if fetched >= _MAX_FILES:
                    break

                file_id   = f["id"]
                name      = f.get("name", "Untitled")
                mime      = f.get("mimeType", "")
                modified  = f.get("modifiedTime")

                created_at = (
                    datetime.fromisoformat(modified.replace("Z", "+00:00"))
                    if modified else datetime.now(timezone.utc)
                )

                try:
                    if mime in _GOOGLE_EXPORT:
                        export_mime, kind = _GOOGLE_EXPORT[mime]
                        text_content = await _export_google_file(client, file_id, export_mime, token)
                        label = kind
                    elif mime in _NATIVE_TEXT:
                        text_content = await _download_native_file(client, file_id, token)
                        label = "file"
                    else:
                        continue

                    if not text_content or len(text_content.strip()) < 40:
                        continue

                    content = f"Google Drive {label}: {name}\n\n{text_content}"

                    yield RawItem(
                        content=content,
                        content_type="text",
                        source="gdrive",
                        authored_by_user=True,
                        context_type="document",
                        created_at=created_at,
                        metadata={"file_id": file_id, "name": name, "mime_type": mime},
                        source_ref=name,
                    )
                    fetched += 1

                except Exception as e:
                    log.warning("[gdrive] Failed to fetch file %s (%s): %s", name, file_id, e)
                    continue

            if not page_token:
                break

    log.info("[gdrive] Ingested %d files for clone %s", fetched, clone_id)
