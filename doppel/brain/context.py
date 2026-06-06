"""
Per-request API key context.

Uses Python ContextVars so each async request carries its own key overrides
without thread-safety issues. ContextVars propagate into asyncio.create_task()
automatically, so background tasks spawned during a request inherit the same keys.

Usage:
    await load_clone_keys(session, clone_id)   # call at the start of every request
    get_anthropic_key()                         # read anywhere downstream
"""
from __future__ import annotations

from contextvars import ContextVar
from uuid import UUID

import anthropic as _anthropic

from sqlalchemy.ext.asyncio import AsyncSession

from doppel.config import settings

_anthropic_key: ContextVar[str | None] = ContextVar("anthropic_key", default=None)
_openai_key: ContextVar[str | None] = ContextVar("openai_key", default=None)
_google_client_id: ContextVar[str | None] = ContextVar("google_client_id", default=None)
_google_client_secret: ContextVar[str | None] = ContextVar("google_client_secret", default=None)
_github_client_id: ContextVar[str | None] = ContextVar("github_client_id", default=None)
_github_client_secret: ContextVar[str | None] = ContextVar("github_client_secret", default=None)
_notion_client_id: ContextVar[str | None] = ContextVar("notion_client_id", default=None)
_notion_client_secret: ContextVar[str | None] = ContextVar("notion_client_secret", default=None)
_slack_client_id: ContextVar[str | None] = ContextVar("slack_client_id", default=None)
_slack_client_secret: ContextVar[str | None] = ContextVar("slack_client_secret", default=None)
_recall_key: ContextVar[str | None] = ContextVar("recall_key", default=None)
_elevenlabs_key: ContextVar[str | None] = ContextVar("elevenlabs_key", default=None)


# ---------------------------------------------------------------------------
# Getters — fall back to settings if no override is set
# ---------------------------------------------------------------------------

def get_anthropic_key() -> str:
    return _anthropic_key.get() or settings.anthropic_api_key


def get_anthropic_client() -> _anthropic.AsyncAnthropic:
    """Return an AsyncAnthropic client with retry logic for overloaded/rate-limit errors."""
    return _anthropic.AsyncAnthropic(api_key=get_anthropic_key(), max_retries=3)


def get_openai_key() -> str:
    return _openai_key.get() or settings.openai_api_key


def get_google_client_id() -> str:
    return _google_client_id.get() or settings.google_client_id


def get_google_client_secret() -> str:
    return _google_client_secret.get() or settings.google_client_secret


def get_github_client_id() -> str:
    return _github_client_id.get() or settings.github_client_id


def get_github_client_secret() -> str:
    return _github_client_secret.get() or settings.github_client_secret


def get_notion_client_id() -> str:
    return _notion_client_id.get() or settings.notion_client_id


def get_notion_client_secret() -> str:
    return _notion_client_secret.get() or settings.notion_client_secret


def get_slack_client_id() -> str:
    return _slack_client_id.get() or settings.slack_client_id


def get_slack_client_secret() -> str:
    return _slack_client_secret.get() or settings.slack_client_secret


def get_recall_key() -> str:
    return _recall_key.get() or settings.recall_api_key


def get_elevenlabs_key() -> str:
    return _elevenlabs_key.get() or settings.elevenlabs_api_key


# ---------------------------------------------------------------------------
# Setter
# ---------------------------------------------------------------------------

def set_keys(
    anthropic: str | None = None,
    openai: str | None = None,
    google_client_id: str | None = None,
    google_client_secret: str | None = None,
    github_client_id: str | None = None,
    github_client_secret: str | None = None,
    notion_client_id: str | None = None,
    notion_client_secret: str | None = None,
    slack_client_id: str | None = None,
    slack_client_secret: str | None = None,
    recall: str | None = None,
    elevenlabs: str | None = None,
    **_: object,  # ignore unknown keys gracefully
) -> None:
    if anthropic:
        _anthropic_key.set(anthropic)
    if openai:
        _openai_key.set(openai)
    if google_client_id:
        _google_client_id.set(google_client_id)
    if google_client_secret:
        _google_client_secret.set(google_client_secret)
    if github_client_id:
        _github_client_id.set(github_client_id)
    if github_client_secret:
        _github_client_secret.set(github_client_secret)
    if notion_client_id:
        _notion_client_id.set(notion_client_id)
    if notion_client_secret:
        _notion_client_secret.set(notion_client_secret)
    if slack_client_id:
        _slack_client_id.set(slack_client_id)
    if slack_client_secret:
        _slack_client_secret.set(slack_client_secret)
    if recall:
        _recall_key.set(recall)
    if elevenlabs:
        _elevenlabs_key.set(elevenlabs)


# ---------------------------------------------------------------------------
# DB loader — call once per request before any LLM/embed/oauth calls
# In-process cache avoids hitting clone_identity on every single request.
# ---------------------------------------------------------------------------

import time as _time

_KEYS_CACHE: dict[str, tuple[float, dict]] = {}  # clone_id → (ts, api_keys dict)
_KEYS_TTL = 300.0  # seconds


def invalidate_keys_cache(clone_id) -> None:
    """Call after a clone's api_keys are updated."""
    _KEYS_CACHE.pop(str(clone_id), None)


async def load_clone_keys(session: AsyncSession, clone_id: UUID) -> None:
    """
    Fetch the clone's stored api_keys from clone_identity and inject into ContextVars.
    Any key not set in DB is left as None → downstream getters fall back to settings.
    Results are cached for 5 minutes to avoid per-request DB queries.
    """
    key = str(clone_id)
    cached = _KEYS_CACHE.get(key)
    if cached and (_time.monotonic() - cached[0]) < _KEYS_TTL:
        if cached[1]:
            set_keys(**cached[1])
        return

    from sqlalchemy import text

    result = await session.execute(
        text("SELECT api_keys FROM clone_identity WHERE clone_id = :id"),
        {"id": str(clone_id)},
    )
    row = result.mappings().first()
    api_keys: dict = {}
    if row and row["api_keys"]:
        api_keys = {k: v for k, v in row["api_keys"].items() if v}
        set_keys(**api_keys)
    _KEYS_CACHE[key] = (_time.monotonic(), api_keys)
