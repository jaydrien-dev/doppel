"""
GitHub ingestion connector.

Ingests commit messages, PR titles/bodies/review comments, and issue comments
authored by the clone owner. Strips raw diffs — only prose reasoning is stored.

OAuth flow:
  1. GET  /ingestion/github/auth-url?clone_id=X  →  redirect to GitHub
  2. GET  /ingestion/github/callback?code=X&state=X  →  store token
  3. POST /ingestion/github/sync  →  background job
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import AsyncGenerator
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_github_client_id, get_github_client_secret
from doppel.brain.security.encryption import encrypt_field, decrypt_field
from doppel.config import settings
from doppel.ingestion.connectors.base import RawItem

_GITHUB_API = "https://api.github.com"
_OAUTH_URL = "https://github.com/login/oauth/authorize"
_TOKEN_URL = "https://github.com/login/oauth/access_token"

# Strip diff hunks (lines starting with +/- after @@)
_DIFF_HUNK_RE = re.compile(r"@@.*?@@[^\n]*\n((?:[+\-][^\n]*\n?)*)", re.DOTALL)


def _strip_diff(text: str) -> str:
    """Remove raw diff content, keep commit message prose only."""
    return _DIFF_HUNK_RE.sub("", text).strip()


def get_auth_url(clone_id: UUID, state: str | None = None) -> str:
    import urllib.parse
    _state = state or str(clone_id)
    params = {
        "client_id": get_github_client_id(),
        "redirect_uri": settings.github_redirect_uri,
        "scope": "repo read:user",
        "state": _state,
    }
    return f"{_OAUTH_URL}?{urllib.parse.urlencode(params)}"


async def handle_callback(code: str, session: AsyncSession, clone_id: UUID) -> str:
    """Exchange OAuth code for access token and store it."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            _TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": get_github_client_id(),
                "client_secret": get_github_client_secret(),
                "code": code,
                "redirect_uri": settings.github_redirect_uri,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    access_token = data.get("access_token", "")
    if not access_token:
        raise ValueError(f"GitHub OAuth failed: {data.get('error_description', data)}")

    # Upsert into oauth_tokens
    await session.execute(
        text("""
            INSERT INTO oauth_tokens (clone_id, provider, access_token)
            VALUES (:cid, 'github', :token)
            ON CONFLICT (clone_id, provider)
            DO UPDATE SET access_token = EXCLUDED.access_token, created_at = now()
        """),
        {"cid": str(clone_id), "token": encrypt_field(access_token)},
    )
    await session.commit()
    return access_token


async def get_access_token(session: AsyncSession, clone_id: UUID) -> str | None:
    row = await session.execute(
        text("SELECT access_token FROM oauth_tokens WHERE clone_id = :cid AND provider = 'github'"),
        {"cid": str(clone_id)},
    )
    rec = row.mappings().first()
    return decrypt_field(rec["access_token"]) if rec else None


async def fetch_items(
    clone_id: UUID,
    access_token: str,
    since_days: int = 365,
) -> AsyncGenerator[RawItem, None]:
    """
    Yield RawItem instances for commits, PRs, and issues authored by the user.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    since_dt = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0
    )
    from datetime import timedelta
    since_dt = since_dt - timedelta(days=since_days)
    since_iso = since_dt.isoformat().replace("+00:00", "Z")

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        # ── 1. Get authenticated user login ───────────────────────────────
        user_resp = await client.get(f"{_GITHUB_API}/user")
        user_resp.raise_for_status()
        username = user_resp.json()["login"]

        # ── 2. List repos (owned + contributed to) ─────────────────────────
        repos_resp = await client.get(
            f"{_GITHUB_API}/user/repos",
            params={"affiliation": "owner,collaborator", "per_page": 100, "sort": "pushed"},
        )
        repos_resp.raise_for_status()
        repos = [r["full_name"] for r in repos_resp.json() if not r.get("archived")]

        for repo in repos[:30]:  # cap at 30 repos to avoid rate limits
            # ── 3. Commits authored by user ────────────────────────────────
            try:
                commits_resp = await client.get(
                    f"{_GITHUB_API}/repos/{repo}/commits",
                    params={"author": username, "since": since_iso, "per_page": 50},
                )
                if commits_resp.status_code == 200:
                    for c in commits_resp.json():
                        msg = c.get("commit", {}).get("message", "").strip()
                        if not msg or len(msg) < 20:
                            continue
                        msg = _strip_diff(msg)
                        if not msg:
                            continue
                        sha = c.get("sha", "")[:8]
                        created_at_str = c.get("commit", {}).get("author", {}).get("date")
                        created_at = (
                            datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                            if created_at_str else None
                        )
                        yield RawItem(
                            content=f"Commit ({repo}): {msg}",
                            source="github",
                            authored_by_user=True,
                            context_type="document",
                            created_at=created_at,
                            metadata={"repo": repo, "sha": sha, "type": "commit"},
                        )
            except Exception:
                pass

            # ── 4. PRs authored by user ────────────────────────────────────
            try:
                prs_resp = await client.get(
                    f"{_GITHUB_API}/repos/{repo}/pulls",
                    params={"state": "all", "per_page": 30},
                )
                if prs_resp.status_code == 200:
                    for pr in prs_resp.json():
                        if pr.get("user", {}).get("login") != username:
                            continue
                        title = pr.get("title", "")
                        body = (pr.get("body") or "").strip()
                        if not title:
                            continue
                        content = f"PR ({repo}): {title}"
                        if body and len(body) > 30:
                            content += f"\n\n{body[:800]}"
                        created_at_str = pr.get("created_at")
                        created_at = (
                            datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                            if created_at_str else None
                        )
                        yield RawItem(
                            content=content,
                            source="github",
                            authored_by_user=True,
                            context_type="document",
                            created_at=created_at,
                            metadata={"repo": repo, "pr": pr.get("number"), "type": "pr"},
                        )
            except Exception:
                pass
