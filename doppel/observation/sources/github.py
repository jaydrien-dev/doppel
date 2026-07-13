"""
GitHub observation adapter — watches commits, PRs, and review comments.

Wraps the existing github connector, adding `since` parameter for incremental
observation and PR review comment support.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.ingestion.connectors.base import RawItem
from doppel.ingestion.connectors.github import get_access_token, _strip_diff

_log = logging.getLogger(__name__)
_GITHUB_API = "https://api.github.com"
_MAX_ITEMS_PER_RUN = 200


class GitHubObservationAdapter:
    """Passive observation adapter for GitHub."""

    def __init__(self) -> None:
        self._latest_at: str | None = None

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
            _log.warning("No GitHub token for clone %s", clone_id)
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        # Determine since date
        if cursor:
            since_iso = cursor
        elif last_at:
            since_iso = last_at.isoformat().replace("+00:00", "Z")
        else:
            since_iso = (datetime.now(timezone.utc) - timedelta(days=config.get("initial_days", 7))).isoformat().replace("+00:00", "Z")

        fetched = 0
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            # Get username
            user_resp = await client.get(f"{_GITHUB_API}/user")
            if user_resp.status_code != 200:
                return
            username = user_resp.json()["login"]

            # List repos
            repos_resp = await client.get(
                f"{_GITHUB_API}/user/repos",
                params={"affiliation": "owner,collaborator", "per_page": 100, "sort": "pushed"},
            )
            if repos_resp.status_code != 200:
                return
            repos = [r["full_name"] for r in repos_resp.json() if not r.get("archived")]

            for repo in repos[:20]:
                if fetched >= _MAX_ITEMS_PER_RUN:
                    break

                # Commits
                try:
                    resp = await client.get(
                        f"{_GITHUB_API}/repos/{repo}/commits",
                        params={"author": username, "since": since_iso, "per_page": 30},
                    )
                    if resp.status_code == 200:
                        for c in resp.json():
                            msg = _strip_diff(c.get("commit", {}).get("message", "").strip())
                            if not msg or len(msg) < 20:
                                continue
                            dt_str = c.get("commit", {}).get("author", {}).get("date", "")
                            if dt_str and (not self._latest_at or dt_str > self._latest_at):
                                self._latest_at = dt_str
                            created_at = datetime.fromisoformat(dt_str.replace("Z", "+00:00")) if dt_str else datetime.now(timezone.utc)
                            yield RawItem(
                                content=f"Commit ({repo}): {msg}",
                                source="github",
                                authored_by_user=True,
                                context_type="document",
                                created_at=created_at,
                                metadata={"repo": repo, "sha": c.get("sha", "")[:8], "type": "commit"},
                            )
                            fetched += 1
                except Exception:
                    pass

                # PRs + review comments
                try:
                    resp = await client.get(
                        f"{_GITHUB_API}/repos/{repo}/pulls",
                        params={"state": "all", "per_page": 20, "sort": "updated", "direction": "desc"},
                    )
                    if resp.status_code == 200:
                        for pr in resp.json():
                            if fetched >= _MAX_ITEMS_PER_RUN:
                                break
                            pr_updated = pr.get("updated_at", "")
                            if pr_updated and pr_updated < since_iso:
                                continue

                            # PR body (if authored by user)
                            if pr.get("user", {}).get("login") == username:
                                title = pr.get("title", "")
                                body = (pr.get("body") or "")[:800].strip()
                                if title:
                                    content = f"PR ({repo}): {title}"
                                    if body and len(body) > 30:
                                        content += f"\n\n{body}"
                                    dt_str = pr.get("created_at", "")
                                    if dt_str and (not self._latest_at or dt_str > self._latest_at):
                                        self._latest_at = dt_str
                                    created_at = datetime.fromisoformat(dt_str.replace("Z", "+00:00")) if dt_str else datetime.now(timezone.utc)
                                    yield RawItem(
                                        content=content,
                                        source="github",
                                        authored_by_user=True,
                                        context_type="document",
                                        created_at=created_at,
                                        metadata={"repo": repo, "pr": pr.get("number"), "type": "pr"},
                                    )
                                    fetched += 1

                            # Review comments by user on this PR
                            try:
                                reviews_resp = await client.get(
                                    f"{_GITHUB_API}/repos/{repo}/pulls/{pr['number']}/comments",
                                    params={"per_page": 30, "since": since_iso},
                                )
                                if reviews_resp.status_code == 200:
                                    for comment in reviews_resp.json():
                                        if comment.get("user", {}).get("login") != username:
                                            continue
                                        body = (comment.get("body") or "").strip()
                                        if not body or len(body) < 20:
                                            continue
                                        dt_str = comment.get("created_at", "")
                                        if dt_str and (not self._latest_at or dt_str > self._latest_at):
                                            self._latest_at = dt_str
                                        created_at = datetime.fromisoformat(dt_str.replace("Z", "+00:00")) if dt_str else datetime.now(timezone.utc)
                                        yield RawItem(
                                            content=f"PR review ({repo}#{pr['number']}): {body}",
                                            source="github",
                                            authored_by_user=True,
                                            context_type="decision",
                                            created_at=created_at,
                                            metadata={"repo": repo, "pr": pr.get("number"), "type": "review_comment"},
                                        )
                                        fetched += 1
                            except Exception:
                                pass
                except Exception:
                    pass

        _log.info("GitHub observation: %d items", fetched)

    def get_cursor(self) -> str | None:
        return self._latest_at
