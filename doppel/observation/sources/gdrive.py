"""
Google Drive observation adapter — watches for new/modified files.

Wraps the existing gdrive connector, adding modifiedTime filtering
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
from doppel.ingestion.connectors.gdrive import (
    get_valid_token,
    _export_google_file,
    _download_native_file,
    _GOOGLE_EXPORT,
    _NATIVE_TEXT,
    _DRIVE_API,
    _MAX_FILE_BYTES,
)

_log = logging.getLogger(__name__)
_MAX_FILES_PER_RUN = 50


class GDriveObservationAdapter:
    """Passive observation adapter for Google Drive."""

    def __init__(self) -> None:
        self._latest_modified: str | None = None

    async def fetch_since(
        self,
        clone_id: UUID,
        cursor: str | None,
        last_at: datetime | None,
        config: dict,
        session: AsyncSession,
    ) -> AsyncIterator[RawItem]:
        token = await get_valid_token(clone_id, session)

        # Determine the "since" filter
        if cursor:
            since_iso = cursor
        elif last_at:
            since_iso = last_at.isoformat()
        else:
            since_iso = (datetime.now(timezone.utc) - timedelta(days=config.get("initial_days", 7))).isoformat()

        google_mimes = " or ".join(f"mimeType='{m}'" for m in _GOOGLE_EXPORT)
        native_mimes = " or ".join(f"mimeType='{m}'" for m in _NATIVE_TEXT)
        q = f"trashed=false and modifiedTime > '{since_iso}' and ({google_mimes} or {native_mimes})"

        fetched = 0
        async with httpx.AsyncClient(timeout=30) as client:
            page_token: str | None = None

            while fetched < _MAX_FILES_PER_RUN:
                params: dict = {
                    "q": q,
                    "pageSize": 50,
                    "fields": "nextPageToken,files(id,name,mimeType,modifiedTime)",
                    "orderBy": "modifiedTime desc",
                }
                if page_token:
                    params["pageToken"] = page_token

                resp = await client.get(
                    f"{_DRIVE_API}/files",
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code == 401:
                    token = await get_valid_token(clone_id, session)
                    resp = await client.get(
                        f"{_DRIVE_API}/files",
                        params=params,
                        headers={"Authorization": f"Bearer {token}"},
                    )
                if resp.status_code != 200:
                    break

                data = resp.json()
                files = data.get("files", [])

                for f in files:
                    if fetched >= _MAX_FILES_PER_RUN:
                        break

                    file_id = f["id"]
                    name = f.get("name", "Untitled")
                    mime = f.get("mimeType", "")
                    modified = f.get("modifiedTime")

                    # Track latest modified time
                    if modified and (not self._latest_modified or modified > self._latest_modified):
                        self._latest_modified = modified

                    created_at = (
                        datetime.fromisoformat(modified.replace("Z", "+00:00"))
                        if modified else datetime.now(timezone.utc)
                    )

                    try:
                        if mime in _GOOGLE_EXPORT:
                            export_mime, kind = _GOOGLE_EXPORT[mime]
                            text_content = await _export_google_file(client, file_id, export_mime, token)
                        elif mime in _NATIVE_TEXT:
                            text_content = await _download_native_file(client, file_id, token)
                        else:
                            continue

                        if not text_content or len(text_content.strip()) < 40:
                            continue

                        yield RawItem(
                            content=f"Google Drive: {name}\n\n{text_content}",
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
                        _log.warning("Failed to fetch Drive file %s: %s", name, e)

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

        _log.info("GDrive observation: %d files", fetched)

    def get_cursor(self) -> str | None:
        return self._latest_modified
