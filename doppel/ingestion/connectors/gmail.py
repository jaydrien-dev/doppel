"""
Gmail connector: OAuth 2.0 + Gmail API via httpx.

Flow:
  1. get_auth_url(clone_id)       → redirect user to Google consent screen
  2. handle_callback(code, state) → exchange code for tokens, store in DB
  3. fetch_sent_emails(clone_id)  → async-iterate over sent emails as RawItems
  4. send_email(...)              → send a reply via Gmail API
  5. setup_watch(...)             → subscribe to Gmail push notifications via Pub/Sub

Uses httpx directly (already in deps) instead of the heavy google-api-python-client.
Token refresh handled by google-auth (lightweight).
"""
from __future__ import annotations

import base64
import email.mime.text
import json
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from uuid import UUID, uuid4

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_google_client_id, get_google_client_secret
from doppel.brain.security.encryption import encrypt_field, decrypt_field
from doppel.config import settings
from doppel.ingestion.connectors.base import BaseConnector, RawItem

# Gmail API base
_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"

_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]


# ---------------------------------------------------------------------------
# OAuth helpers
# ---------------------------------------------------------------------------

def get_auth_url(clone_id: UUID, state: str | None = None) -> str:
    """
    Generate the Google OAuth URL. Embed clone_id in the state param so we
    know which clone to associate the tokens with on callback.
    state defaults to str(clone_id) but can be overridden to encode extra info.
    """
    if state is None:
        state = str(clone_id)
    params = {
        "client_id": get_google_client_id(),
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(_SCOPES),
        "access_type": "offline",   # get refresh token
        "prompt": "consent",        # always show consent to get refresh token
        "state": state,
    }
    return f"{_AUTH_BASE}?{urllib.parse.urlencode(params)}"


async def handle_callback(
    code: str,
    state: str,
    session: AsyncSession,
) -> UUID:
    """
    Exchange authorization code for tokens and persist them.
    Returns the clone_id extracted from state.
    """
    clone_id = UUID(state)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _TOKEN_URL,
            data={
                "code": code,
                "client_id": get_google_client_id(),
                "client_secret": get_google_client_secret(),
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        token_data = resp.json()

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))

    await session.execute(
        text("""
            INSERT INTO oauth_tokens
              (id, clone_id, provider, access_token, refresh_token, expires_at, scope)
            VALUES
              (:id, :clone_id, 'gmail', :access_token, :refresh_token, :expires_at, :scope)
            ON CONFLICT (clone_id, provider)
            DO UPDATE SET
              access_token  = EXCLUDED.access_token,
              refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
              expires_at    = EXCLUDED.expires_at,
              updated_at    = NOW()
        """),
        {
            "id": str(uuid4()),
            "clone_id": str(clone_id),
            "access_token": encrypt_field(token_data["access_token"]),
            "refresh_token": encrypt_field(token_data.get("refresh_token")),
            "expires_at": expires_at,
            "scope": token_data.get("scope"),
        },
    )
    await session.commit()
    return clone_id


async def _get_valid_token(clone_id: UUID, session: AsyncSession) -> str:
    """
    Return a valid access token, refreshing if within 5 minutes of expiry.
    """
    result = await session.execute(
        text("""
            SELECT access_token, refresh_token, expires_at
            FROM oauth_tokens
            WHERE clone_id = :clone_id AND provider = 'gmail'
        """),
        {"clone_id": str(clone_id)},
    )
    row = result.mappings().first()
    if row is None:
        raise ValueError(f"No Gmail token for clone {clone_id}. Connect Gmail first.")

    expires_at = row["expires_at"]
    # Refresh if expiring within 5 minutes or already expired
    if expires_at and expires_at <= datetime.now(timezone.utc) + timedelta(minutes=5):
        if not row["refresh_token"]:
            raise ValueError("Token expired and no refresh token available. Reconnect Gmail.")
        return await _refresh_token(clone_id, decrypt_field(row["refresh_token"]) or "", session)

    return decrypt_field(row["access_token"]) or ""


async def _refresh_token(
    clone_id: UUID,
    refresh_token: str,
    session: AsyncSession,
) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": get_google_client_id(),
                "client_secret": get_google_client_secret(),
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        token_data = resp.json()

    new_access = token_data["access_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))

    await session.execute(
        text("""
            UPDATE oauth_tokens
            SET access_token = :access_token,
                expires_at   = :expires_at,
                updated_at   = NOW()
            WHERE clone_id = :clone_id AND provider = 'gmail'
        """),
        {"access_token": encrypt_field(new_access), "expires_at": expires_at, "clone_id": str(clone_id)},
    )
    await session.commit()
    return new_access


# ---------------------------------------------------------------------------
# Send + Watch helpers
# ---------------------------------------------------------------------------

async def send_email(
    clone_id: UUID,
    to: str,
    subject: str,
    body: str,
    thread_id: str | None,
    session: AsyncSession,
) -> dict:
    """
    Send an email reply via Gmail API. Uses stored OAuth token for clone_id.
    Returns the Gmail message object from the API.
    """
    token = await _get_valid_token(clone_id, session)

    # Construct RFC 2822 MIME message
    msg = email.mime.text.MIMEText(body, "plain", "utf-8")
    msg["To"] = to
    msg["Subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

    payload: dict = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{_GMAIL_BASE}/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()


async def setup_watch(clone_id: UUID, pubsub_topic: str, session: AsyncSession) -> dict:
    """
    Subscribe to Gmail push notifications via Google Cloud Pub/Sub.
    Stores the watch expiration in oauth_tokens.metadata.
    Returns {historyId, expiration}.
    """
    token = await _get_valid_token(clone_id, session)

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{_GMAIL_BASE}/users/me/watch",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"topicName": pubsub_topic, "labelIds": ["INBOX"]},
        )
        resp.raise_for_status()
        watch_data = resp.json()

    # Store expiration in oauth_tokens metadata
    await session.execute(
        text("""
            UPDATE oauth_tokens
            SET metadata = COALESCE(metadata, '{}') || CAST(:patch AS jsonb),
                updated_at = NOW()
            WHERE clone_id = :clone_id AND provider = 'gmail'
        """),
        {
            "clone_id": str(clone_id),
            "patch": json.dumps({
                "watch_expiration": watch_data.get("expiration"),
                "watch_history_id": watch_data.get("historyId"),
            }),
        },
    )
    await session.commit()
    return watch_data


async def fetch_messages_since(
    clone_id: UUID,
    history_id: str,
    session: AsyncSession,
) -> list[dict]:
    """
    Fetch new messages since a given Gmail historyId.
    Returns list of parsed message dicts with {subject, sender, sender_email, body, thread_id}.
    """
    token = await _get_valid_token(clone_id, session)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get history records since historyId
        history_resp = await client.get(
            f"{_GMAIL_BASE}/users/me/history",
            headers=headers,
            params={"startHistoryId": history_id, "historyTypes": "messageAdded", "labelId": "INBOX"},
        )
        if history_resp.status_code == 404:
            return []  # historyId too old
        history_resp.raise_for_status()
        history_data = history_resp.json()

        messages = []
        for record in history_data.get("history", []):
            for added in record.get("messagesAdded", []):
                msg_id = added["message"]["id"]
                try:
                    item = await _fetch_single_email(client, headers, msg_id)
                    if item:
                        # Parse sender name/email from "Name <email>" format
                        sender_full = item.metadata.get("to", "") or ""
                        sender_name = sender_full.split("<")[0].strip().strip('"') or sender_full
                        sender_email = ""
                        if "<" in sender_full and ">" in sender_full:
                            sender_email = sender_full.split("<")[1].split(">")[0].strip()

                        messages.append({
                            "subject": item.metadata.get("subject", "(no subject)"),
                            "sender": sender_name or sender_email,
                            "sender_email": sender_email or sender_full,
                            "body": item.content,
                            "thread_id": item.metadata.get("thread_id"),
                        })
                except Exception:
                    pass
        return messages


# ---------------------------------------------------------------------------
# Gmail connector
# ---------------------------------------------------------------------------

class GmailConnector(BaseConnector):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def fetch_items(
        self,
        clone_id: UUID,
        since_days: int = 180,
    ) -> AsyncIterator[RawItem]:
        token = await _get_valid_token(clone_id, self._session)
        headers = {"Authorization": f"Bearer {token}"}

        # Only SENT mail — these are authored by the user
        since_date = (datetime.now(timezone.utc) - timedelta(days=since_days)).strftime("%Y/%m/%d")
        query = f"in:sent after:{since_date}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            page_token: str | None = None
            fetched = 0

            while True:
                # List message IDs
                params: dict = {"q": query, "maxResults": 100}
                if page_token:
                    params["pageToken"] = page_token

                list_resp = await client.get(
                    f"{_GMAIL_BASE}/users/me/messages",
                    headers=headers,
                    params=params,
                )
                list_resp.raise_for_status()
                list_data = list_resp.json()

                messages = list_data.get("messages", [])
                if not messages:
                    break

                for msg_ref in messages:
                    try:
                        item = await _fetch_single_email(client, headers, msg_ref["id"])
                        if item:
                            yield item
                            fetched += 1
                    except Exception as e:
                        print(f"[gmail] Failed to fetch message {msg_ref['id']}: {e}")

                page_token = list_data.get("nextPageToken")
                if not page_token:
                    break

        print(f"[gmail] Fetched {fetched} sent emails for clone {clone_id}")


async def _fetch_single_email(
    client: httpx.AsyncClient,
    headers: dict,
    message_id: str,
) -> RawItem | None:
    """Fetch a full email message and convert to RawItem."""
    resp = await client.get(
        f"{_GMAIL_BASE}/users/me/messages/{message_id}",
        headers=headers,
        params={"format": "full"},
    )
    resp.raise_for_status()
    msg = resp.json()

    payload = msg.get("payload", {})
    headers_list = payload.get("headers", [])

    subject = _get_header(headers_list, "Subject") or "(no subject)"
    date_str = _get_header(headers_list, "Date") or ""
    to_header = _get_header(headers_list, "To") or ""

    created_at = _parse_date(date_str)
    body = _extract_body(payload)

    if not body or len(body.strip()) < 20:
        return None  # Skip empty/trivial emails

    return RawItem(
        content=body,
        content_type="html" if "<" in body and ">" in body else "text",
        source="gmail",
        authored_by_user=True,
        context_type="email_reply",
        created_at=created_at,
        metadata={
            "subject": subject,
            "to": to_header,
            "message_id": message_id,
            "thread_id": msg.get("threadId"),
        },
    )


def _get_header(headers: list[dict], name: str) -> str | None:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value")
    return None


def _extract_body(payload: dict) -> str:
    """
    Recursively extract the email body from a Gmail message payload.
    Prefers plain text; falls back to HTML.
    """
    mime_type = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if mime_type == "text/plain" and body_data:
        return _decode_base64(body_data)

    if mime_type == "text/html" and body_data:
        return _decode_base64(body_data)

    # Multipart: recurse into parts
    parts = payload.get("parts", [])
    plain = ""
    html = ""
    for part in parts:
        result = _extract_body(part)
        if part.get("mimeType") == "text/plain" and result:
            plain = result
        elif part.get("mimeType") == "text/html" and result:
            html = result
        elif result and not plain and not html:
            plain = result  # unknown part, use it

    return plain or html


def _decode_base64(data: str) -> str:
    """Decode Gmail's URL-safe base64 encoding."""
    try:
        padded = data + "=" * (-len(data) % 4)
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _parse_date(date_str: str) -> datetime:
    """Parse RFC 2822 email date, fall back to now."""
    from email.utils import parsedate_to_datetime
    try:
        return parsedate_to_datetime(date_str).replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)
