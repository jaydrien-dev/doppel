"""
Doppel Brain — FastAPI application entry point.

Routes:
  GET  /clones/{handle}                  — public clone info
  POST /clones                           — create a new clone
  GET  /clones/me?user_id=...            — owner's clone lookup

  POST /brain/chat                       — main chat/question endpoint
  POST /brain/feedback                   — submit feedback on a response
  POST /brain/ingest                     — add a single content chunk to memory

  GET  /ingestion/gmail/auth-url         — get Google OAuth URL
  GET  /ingestion/gmail/callback         — OAuth callback (redirect from Google)
  POST /ingestion/gmail/sync             — trigger Gmail ingestion (background)
  POST /ingestion/text                   — paste raw text directly into memory
  POST /ingestion/extract-style          — recompute StyleFingerprint from corpus
  GET  /ingestion/jobs/{job_id}          — poll ingestion job status

  GET  /health                           — health check
"""
from __future__ import annotations

import asyncio
import csv
import hashlib
import hmac
import io
import json
import logging
import os
import pathlib
import secrets
from contextlib import asynccontextmanager
from datetime import date, timedelta
from uuid import UUID, uuid4

_log = logging.getLogger(__name__)

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import text as sql_text
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.security.encryption import encrypt_field, decrypt_field
from doppel.brain.context import (
    load_clone_keys,
    get_github_client_id, get_github_client_secret,
    get_notion_client_id, get_notion_client_secret,
    get_slack_client_id, get_slack_client_secret,
    get_recall_key,
)
from doppel.brain.db.connection import AsyncSessionLocal, get_session
from doppel.brain.learning.feedback import record_feedback, should_trigger_training
from doppel.brain.memory import episodic as episodic_store
from doppel.brain.models.types import BrainInput, BrainOutput, FeedbackSignal
from doppel.brain.orchestrator import DoppelBrain
from doppel.config import settings
from doppel.ingestion.connectors.gmail import (
    GmailConnector,
    get_auth_url,
    handle_callback,
    send_email as gmail_send_email,
    setup_watch as gmail_setup_watch,
    fetch_messages_since as gmail_fetch_since,
)
from doppel.ingestion.pipeline import IngestionPipeline
from doppel.ingestion.status import create_job, get_job_status
from doppel.ingestion.style_extractor import extract_style_fingerprint, fetch_sample_texts
from doppel.brain.company.role_brain import extract_role_knowledge, compute_freshness
from doppel.brain.company.skills_extractor import (
    extract_skills_from_role,
    query_skills,
    validate_action,
)

_SCHEMA_FILE = pathlib.Path(__file__).parent / "brain" / "db" / "schemas.sql"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run DB migrations on startup (all statements are idempotent IF NOT EXISTS)."""
    import logging
    from doppel.brain.db.connection import engine
    _log = logging.getLogger(__name__)
    try:
        schema_sql = _SCHEMA_FILE.read_text()
        # Strip comment lines, then split into individual statements
        stripped_lines = "\n".join(
            line for line in schema_sql.splitlines()
            if not line.strip().startswith("--")
        )
        statements = [
            s.strip() for s in stripped_lines.split(";")
            if s.strip()
        ]
        # Use AUTOCOMMIT so each statement is its own transaction —
        # a failed statement doesn't abort subsequent ones.
        async with engine.connect() as conn:
            await conn.execution_options(isolation_level="AUTOCOMMIT")
            ok = 0
            for stmt in statements:
                try:
                    await conn.execute(sql_text(stmt))
                    ok += 1
                except Exception as e:
                    _log.warning("Migration stmt skipped (%s): %.200s", type(e).__name__, stmt[:120])
        _log.info("DB schema migration: %d/%d statements applied", ok, len(statements))
    except Exception as exc:
        _log.warning("Schema migration failed entirely: %s", exc)
    yield


app = FastAPI(
    title="Doppel Brain API",
    version="0.2.0",
    description="The cognitive core of Doppel AI clones.",
    lifespan=lifespan,
)

_cors_origins: list[str] = (
    ["*"]
    if settings.app_env == "development"
    else [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Security helpers — rate limiting, access control, audit logging
# ---------------------------------------------------------------------------

async def _write_audit_event(
    session: AsyncSession,
    clone_id: str,
    event_type: str,
    actor_user_id: str | None = None,
    actor_ip: str | None = None,
    request_surface: str = "chat",
    metadata: dict | None = None,
) -> None:
    """Fire-and-forget audit log write. Swallows errors so it never breaks the main request."""
    try:
        await session.execute(
            sql_text("""
                INSERT INTO access_audit_log
                  (clone_id, event_type, actor_user_id, actor_ip, request_surface, metadata)
                VALUES
                  (:clone_id, :event_type, :actor_user_id, :actor_ip, :request_surface, CAST(:metadata AS jsonb))
            """),
            {
                "clone_id": clone_id,
                "event_type": event_type,
                "actor_user_id": actor_user_id,
                "actor_ip": actor_ip,
                "request_surface": request_surface,
                "metadata": json.dumps(metadata or {}),
            },
        )
        # Don't commit here — caller commits as part of its own transaction,
        # or a separate session commit follows.
    except Exception:
        pass  # audit log must never break the main request


TIER_MONTHLY_LIMITS: dict[str, int] = {
    "free": 50,
    "personal": 250,
    "enterprise_pro": 1250,
    "enterprise_max": 5000,
}


async def _check_rate_limit(clone_id: UUID, session: AsyncSession) -> None:
    """Raise HTTP 429 if this clone has exceeded its daily or monthly query limit."""
    row = await session.execute(
        sql_text("SELECT rate_limit_per_day, subscription_tier FROM clone_identity WHERE clone_id = :id"),
        {"id": str(clone_id)},
    )
    rec = (row.mappings().first() or {})
    daily_limit = rec.get("rate_limit_per_day", 0) or 0
    tier = rec.get("subscription_tier") or "free"

    monthly_limit = TIER_MONTHLY_LIMITS.get(tier, 100)

    # Monthly tier check
    if monthly_limit > 0:
        month_row = await session.execute(
            sql_text(
                "SELECT COUNT(*) FROM reasoning_traces "
                "WHERE clone_id = :id AND created_at >= date_trunc('month', NOW())"
            ),
            {"id": str(clone_id)},
        )
        month_count = month_row.scalar() or 0
        if month_count >= monthly_limit:
            raise HTTPException(
                status_code=429,
                detail=f"Monthly query limit of {monthly_limit} reached for the {tier} plan. Upgrade or wait until next month.",
                headers={"Retry-After": "86400"},
            )

    # Per-day custom limit (deploy page rate limiting control)
    if daily_limit > 0:
        count_row = await session.execute(
            sql_text(
                "SELECT COUNT(*) FROM reasoning_traces "
                "WHERE clone_id = :id AND created_at > NOW() - INTERVAL '1 day'"
            ),
            {"id": str(clone_id)},
        )
        count = count_row.scalar() or 0
        if count >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail=f"Daily query limit of {daily_limit} reached for this clone. Try again tomorrow.",
                headers={"Retry-After": "86400"},
            )


async def _check_clone_access(
    clone_id: UUID,
    caller_user_id: str | None,
    caller_email: str | None,
    session: AsyncSession,
) -> None:
    """
    Enforce access_mode on every chat request.
    Raises HTTP 403 if access is denied.
    """
    row = await session.execute(
        sql_text("""
            SELECT c.access_mode, c.user_id AS owner_user_id, c.allowed_emails,
                   c.clone_id,
                   om.org_id AS caller_org_id,
                   om2.org_id AS owner_org_id
            FROM clone_identity c
            LEFT JOIN org_memberships om ON om.user_id = :caller AND om.org_id = (
                SELECT org_id FROM org_memberships WHERE user_id = c.user_id LIMIT 1
            )
            LEFT JOIN org_memberships om2 ON om2.user_id = c.user_id
            WHERE c.clone_id = :clone_id
            LIMIT 1
        """),
        {"clone_id": str(clone_id), "caller": caller_user_id or ""},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")

    mode = rec["access_mode"]

    if mode == "public":
        return  # anyone

    owner_id = rec["owner_user_id"]
    if caller_user_id and caller_user_id == owner_id:
        return  # always allow owner

    if mode == "private":
        raise HTTPException(status_code=403, detail="This clone is private.")

    if mode == "allowlist":
        allowed = rec["allowed_emails"] or []
        if not caller_email or caller_email.lower() not in [e.lower() for e in allowed]:
            raise HTTPException(status_code=403, detail="You don't have access to this clone.")
        return

    if mode == "org_scoped":
        # Both caller and owner must be in the same org
        if not rec["caller_org_id"] or rec["caller_org_id"] != rec["owner_org_id"]:
            raise HTTPException(status_code=403, detail="This clone is restricted to org members.")
        return


# ---------------------------------------------------------------------------
# Clone management
# ---------------------------------------------------------------------------

class CreateCloneRequest(BaseModel):
    user_id: str
    handle: str
    display_name: str


@app.post("/clones", status_code=201)
async def create_clone(
    body: CreateCloneRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Create a new clone for a user. handle must be globally unique."""
    from uuid import uuid4

    # Validate handle: alphanumeric + hyphens, 3-32 chars
    import re
    if not re.match(r"^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$", body.handle):
        raise HTTPException(
            status_code=422,
            detail="handle must be 3-32 chars, lowercase alphanumeric and hyphens, no leading/trailing hyphens",
        )

    clone_id = uuid4()
    # Inherit org's default access_mode if user is in an org
    org_row = await session.execute(
        sql_text("""
            SELECT o.default_clone_access_mode
            FROM orgs o JOIN org_memberships m ON m.org_id = o.id
            WHERE m.user_id = :uid LIMIT 1
        """),
        {"uid": body.user_id},
    )
    org_rec = org_row.mappings().first()
    initial_access_mode = (org_rec["default_clone_access_mode"] if org_rec else None) or "private"

    try:
        await session.execute(
            sql_text("""
                INSERT INTO clone_identity
                  (clone_id, display_name, handle, user_id, access_mode,
                   style_fingerprint, value_system)
                VALUES
                  (:clone_id, :display_name, :handle, :user_id, :access_mode,
                   '{}', '{}')
            """),
            {
                "clone_id": str(clone_id),
                "display_name": body.display_name,
                "handle": body.handle,
                "user_id": body.user_id,
                "access_mode": initial_access_mode,
            },
        )
        await session.commit()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="handle already taken")
        _log.error("clone creation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"clone_id": str(clone_id), "handle": body.handle}


@app.get("/clones/me")
async def get_my_clone(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the authenticated owner's clone record."""

    row = await session.execute(
        sql_text("""
            SELECT clone_id, display_name, handle, access_mode,
                   style_fingerprint, value_system, allowed_emails,
                   rate_limit_per_day, subscription_tier, stripe_customer_id,
                   created_at, updated_at
            FROM clone_identity
            WHERE user_id = :user_id
            LIMIT 1
        """),
        {"user_id": user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    return {
        "clone_id": str(record["clone_id"]),
        "display_name": record["display_name"],
        "handle": record["handle"],
        "access_mode": record["access_mode"],
        "style_fingerprint": record["style_fingerprint"],
        "value_system": record["value_system"],
        "allowed_emails": list(record["allowed_emails"] or []),
        "rate_limit_per_day": int(record["rate_limit_per_day"] or 0),
        "subscription_tier": record["subscription_tier"] or "free",
        "stripe_customer_id": record["stripe_customer_id"],
        "created_at": record["created_at"].isoformat() if record["created_at"] else None,
        "updated_at": record["updated_at"].isoformat() if record["updated_at"] else None,
    }


@app.get("/clones/{handle}")
async def get_clone_by_handle(
    handle: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Public clone info — safe to expose to anyone."""

    row = await session.execute(
        sql_text("""
            SELECT clone_id, display_name, handle, access_mode, allowed_emails
            FROM clone_identity
            WHERE handle = :handle
        """),
        {"handle": handle},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Clone not found")

    return {
        "clone_id": str(record["clone_id"]),
        "display_name": record["display_name"],
        "handle": record["handle"],
        "access_mode": record["access_mode"],
        "allowed_emails": record["allowed_emails"] or [],
    }


@app.patch("/clones/{handle}")
async def update_clone(
    handle: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Update clone fields (access_mode, display_name). Caller must be owner (enforced by Next.js proxy)."""

    allowed = {"access_mode", "display_name", "allowed_emails", "is_onboarding_resource", "expertise_tags"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=422, detail="No valid fields to update")

    if "access_mode" in updates and updates["access_mode"] not in ("private", "allowlist", "public", "org_scoped"):
        raise HTTPException(status_code=422, detail="access_mode must be private | allowlist | public")

    # Build SET clause — handle Postgres array fields specially
    set_parts = []
    updates_exec: dict = {}
    for k, v in updates.items():
        if k == "allowed_emails":
            emails = [str(e).lower().strip() for e in (v or [])]
            set_parts.append("allowed_emails = :allowed_emails_arr")
            updates_exec["allowed_emails_arr"] = emails
        elif k == "expertise_tags":
            tags = [str(t).strip() for t in (v or [])]
            set_parts.append("expertise_tags = :expertise_tags_arr")
            updates_exec["expertise_tags_arr"] = tags
        else:
            set_parts.append(f"{k} = :{k}")
            updates_exec[k] = v
    set_clause = ", ".join(set_parts)
    updates_exec["handle"] = handle
    await session.execute(
        sql_text(f"UPDATE clone_identity SET {set_clause}, updated_at = NOW() WHERE handle = :handle"),
        updates_exec,
    )
    await session.commit()
    return {"status": "updated"}


# ---------------------------------------------------------------------------
# Clone API keys (BYOK)
# ---------------------------------------------------------------------------

_VALID_PROVIDERS = {
    "anthropic", "openai",
    "google_client_id", "google_client_secret",
    "github_client_id", "github_client_secret",
    "notion_client_id", "notion_client_secret",
    "slack_client_id", "slack_client_secret",
    "recall", "elevenlabs",
}


def _mask(key: str) -> str:
    """Return first 8 chars + **** so users can recognise their key without exposing it."""
    if not key:
        return ""
    return key[:8] + "****"


@app.get("/clones/me/keys")
async def get_my_keys(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return masked API keys for the authenticated owner's clone."""

    row = await session.execute(
        sql_text("SELECT clone_id, api_keys FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    raw: dict = record["api_keys"] or {}
    return {provider: _mask(raw.get(provider, "")) for provider in _VALID_PROVIDERS}


class SaveKeyRequest(BaseModel):
    user_id: str
    provider: str
    key: str


@app.post("/clones/me/keys", status_code=200)
async def save_my_key(
    body: SaveKeyRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Save (or overwrite) a single API key for the owner's clone."""

    if body.provider not in _VALID_PROVIDERS:
        raise HTTPException(
            status_code=422,
            detail=f"provider must be one of: {', '.join(sorted(_VALID_PROVIDERS))}",
        )

    row = await session.execute(
        sql_text("SELECT clone_id, api_keys FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    current: dict = dict(record["api_keys"] or {})
    current[body.provider] = body.key

    await session.execute(
        sql_text("UPDATE clone_identity SET api_keys = :keys WHERE clone_id = :id"),
        {"keys": json.dumps(current), "id": str(record["clone_id"])},
    )
    await session.commit()
    return {"status": "saved", "provider": body.provider}


@app.delete("/clones/me/keys/{provider}", status_code=200)
async def delete_my_key(
    provider: str,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Remove a stored API key (falls back to platform key)."""

    if provider not in _VALID_PROVIDERS:
        raise HTTPException(
            status_code=422,
            detail=f"provider must be one of: {', '.join(sorted(_VALID_PROVIDERS))}",
        )

    row = await session.execute(
        sql_text("SELECT clone_id, api_keys FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    current: dict = dict(record["api_keys"] or {})
    current.pop(provider, None)

    await session.execute(
        sql_text("UPDATE clone_identity SET api_keys = :keys WHERE clone_id = :id"),
        {"keys": json.dumps(current), "id": str(record["clone_id"])},
    )
    await session.commit()
    return {"status": "removed", "provider": provider}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env, "version": "0.2.0"}


# ---------------------------------------------------------------------------
# Brain — chat
# ---------------------------------------------------------------------------

@app.post("/brain/chat/stream")
async def chat_stream(
    body: BrainInput,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    SSE streaming chat endpoint. Yields events:
      data: {"event": "start", "path": "fast"|"slow"}
      data: {"event": "thinking"}
      data: {"event": "token", "text": "..."}
      data: {"event": "done", "trace_id": "...", "confidence": ..., "sources": [...], ...}
    """
    caller_user_id = request.headers.get("X-User-Id")
    await _check_clone_access(body.clone_id, caller_user_id, None, session)
    await _check_rate_limit(body.clone_id, session)
    await load_clone_keys(session, body.clone_id)
    brain = DoppelBrain(session=session, clone_id=body.clone_id)
    try:
        return StreamingResponse(
            brain.process_stream(body),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/brain/chat", response_model=BrainOutput)
async def chat(
    body: BrainInput,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> BrainOutput:
    """
    Process a message through the full cognitive pipeline.
    Routes to fast (System 1) or slow (System 2) path automatically.
    """
    caller_user_id = request.headers.get("X-User-Id")
    await _check_clone_access(body.clone_id, caller_user_id, None, session)
    await _check_rate_limit(body.clone_id, session)
    await load_clone_keys(session, body.clone_id)
    brain = DoppelBrain(session=session, clone_id=body.clone_id)
    try:
        return await brain.process(body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.error("brain.process failed clone_id=%s: %s", body.clone_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Brain processing error")


# ---------------------------------------------------------------------------
# Brain — activity / reasoning traces
# ---------------------------------------------------------------------------

@app.get("/brain/traces")
async def get_traces(
    clone_id: UUID = Query(...),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return recent reasoning traces for the activity log."""

    rows = await session.execute(
        sql_text("""
            SELECT id, session_id, path, confidence, feedback_signal,
                   brain_input->>'message' AS input_message,
                   response, latency_ms, needs_escalation, created_at
            FROM reasoning_traces
            WHERE clone_id = :clone_id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"clone_id": str(clone_id), "limit": limit, "offset": offset},
    )
    traces = []
    for row in rows.mappings():
        r = dict(row)
        if r.get("created_at"):
            r["created_at"] = r["created_at"].isoformat()
        traces.append(r)
    return {"traces": traces, "offset": offset, "limit": limit}


# ---------------------------------------------------------------------------
# Brain — quality / improvement metrics
# ---------------------------------------------------------------------------

@app.get("/brain/quality")
async def get_brain_quality(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Aggregate quality metrics: approval rate, correction counts, 7-day trend."""

    stats_row = await session.execute(
        sql_text("""
            SELECT
                COUNT(*)                                                            AS total,
                COUNT(feedback_signal)                                              AS has_feedback,
                COUNT(CASE WHEN feedback_signal = 'approved'  THEN 1 END)          AS approved,
                COUNT(CASE WHEN feedback_signal = 'edited'    THEN 1 END)          AS edited,
                COUNT(CASE WHEN feedback_signal = 'rejected'  THEN 1 END)          AS rejected,
                COUNT(CASE WHEN feedback_signal IS NULL        THEN 1 END)          AS pending,
                AVG(confidence)                                                     AS avg_confidence,
                COUNT(CASE WHEN needs_escalation = true        THEN 1 END)          AS escalations
            FROM reasoning_traces
            WHERE clone_id = :cid
        """),
        {"cid": str(clone_id)},
    )
    s = dict(stats_row.mappings().first() or {})

    daily_rows = await session.execute(
        sql_text("""
            SELECT
                date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
                COUNT(*)                                                        AS total,
                COUNT(CASE WHEN feedback_signal = 'approved' THEN 1 END)       AS approved,
                COUNT(CASE WHEN feedback_signal = 'edited'   THEN 1 END)       AS edited
            FROM reasoning_traces
            WHERE clone_id = :cid
              AND created_at >= NOW() - INTERVAL '7 days'
            GROUP BY day
            ORDER BY day ASC
        """),
        {"cid": str(clone_id)},
    )
    trend = []
    for row in daily_rows.mappings():
        r = dict(row)
        trend.append({
            "day": r["day"].strftime("%Y-%m-%d"),
            "total": int(r["total"]),
            "approved": int(r["approved"]),
            "edited": int(r["edited"]),
        })

    total = int(s.get("total") or 0)
    has_fb = int(s.get("has_feedback") or 0)
    approved = int(s.get("approved") or 0)
    approval_rate = round(approved / has_fb * 100, 1) if has_fb > 0 else None
    avg_conf = s.get("avg_confidence")

    return {
        "total_responses": total,
        "has_feedback": has_fb,
        "pending_review": int(s.get("pending") or 0),
        "approved": approved,
        "edited": int(s.get("edited") or 0),
        "rejected": int(s.get("rejected") or 0),
        "approval_rate": approval_rate,
        "avg_confidence": round(float(avg_conf) * 100, 1) if avg_conf else None,
        "escalations": int(s.get("escalations") or 0),
        "trend_7d": trend,
    }


# ---------------------------------------------------------------------------
# Brain — feedback
# ---------------------------------------------------------------------------

@app.post("/brain/feedback", status_code=204)
async def feedback(
    body: FeedbackSignal,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Submit feedback (approve / edit / reject) on a clone response."""
    await record_feedback(session, body)
    if await should_trigger_training(session, body.clone_id):
        print(f"[training] Clone {body.clone_id} has enough feedback — queuing training run")


# ---------------------------------------------------------------------------
# Admin — access audit log
# ---------------------------------------------------------------------------

@app.get("/admin/audit-log")
async def get_audit_log(
    clone_id: UUID = Query(...),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return access audit events for a clone (owner-only)."""
    rows = await session.execute(
        sql_text("""
            SELECT id, event_type, actor_user_id, actor_ip, request_surface, metadata, created_at
            FROM access_audit_log
            WHERE clone_id = :cid
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"cid": str(clone_id), "limit": limit, "offset": offset},
    )
    events = [dict(r) for r in rows.mappings()]
    for e in events:
        if e.get("created_at"):
            e["created_at"] = e["created_at"].isoformat()
    return {"events": events, "count": len(events)}


@app.get("/admin/audit-log/export.csv")
async def export_audit_log_csv(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Download full audit log as CSV."""
    import io
    import csv as _csv

    rows = await session.execute(
        sql_text("""
            SELECT event_type, actor_user_id, actor_ip, request_surface, metadata, created_at
            FROM access_audit_log
            WHERE clone_id = :cid
            ORDER BY created_at DESC
        """),
        {"cid": str(clone_id)},
    )
    buf = io.StringIO()
    writer = _csv.writer(buf)
    writer.writerow(["event_type", "actor_user_id", "actor_ip", "request_surface", "metadata", "created_at"])
    for row in rows.mappings():
        r = dict(row)
        writer.writerow([
            r.get("event_type", ""),
            r.get("actor_user_id", ""),
            r.get("actor_ip", ""),
            r.get("request_surface", ""),
            json.dumps(r.get("metadata") or {}),
            r["created_at"].isoformat() if r.get("created_at") else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_log_{clone_id}.csv"},
    )


# ---------------------------------------------------------------------------
# Brain — single chunk ingest (manual / programmatic)
# ---------------------------------------------------------------------------

class IngestRequest(BaseModel):
    clone_id: UUID
    content: str
    source: str = "upload"
    authored_by_user: bool = True
    context_type: str | None = None
    entities: list[str] = []
    topics: list[str] = []
    is_pinned: bool = False


@app.post("/brain/ingest", status_code=201)
async def ingest(
    body: IngestRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Add a single content chunk to episodic memory."""
    chunk_id = await episodic_store.store_chunk(
        session=session,
        clone_id=body.clone_id,
        content=body.content,
        source=body.source,
        authored_by_user=body.authored_by_user,
        context_type=body.context_type,
        entities=body.entities,
        topics=body.topics,
        is_pinned=body.is_pinned,
    )
    await session.commit()
    return {"chunk_id": str(chunk_id)}


# ---------------------------------------------------------------------------
# Billing — Stripe
# ---------------------------------------------------------------------------

# Map price IDs → tier name (populated lazily so settings are read at runtime)
def _price_to_tier() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for price_id, tier in [
        (settings.stripe_pro_monthly_price_id, "pro"),
        (settings.stripe_pro_yearly_price_id, "pro"),
        (settings.stripe_creator_monthly_price_id, "creator"),
        (settings.stripe_creator_yearly_price_id, "creator"),
    ]:
        if price_id:
            mapping[price_id] = tier
    return mapping


class CheckoutRequest(BaseModel):
    user_id: str
    price_id: str


@app.post("/billing/checkout-session")
async def create_checkout_session(
    body: CheckoutRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Create a Stripe Checkout Session and return the redirect URL."""
    import stripe as stripe_lib

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    stripe_lib.api_key = settings.stripe_secret_key

    # Validate price_id belongs to a known plan
    if body.price_id not in _price_to_tier():
        raise HTTPException(status_code=422, detail="Unknown price_id")

    # Fetch clone to get / create Stripe customer
    row = await session.execute(
        sql_text("""
            SELECT clone_id, display_name, stripe_customer_id
            FROM clone_identity WHERE user_id = :uid LIMIT 1
        """),
        {"uid": body.user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    customer_id: str | None = record["stripe_customer_id"]

    # Find-or-create Stripe customer
    if not customer_id:
        customer = stripe_lib.Customer.create(
            metadata={"user_id": body.user_id, "clone_id": str(record["clone_id"])},
        )
        customer_id = customer.id
        await session.execute(
            sql_text("UPDATE clone_identity SET stripe_customer_id = :cid WHERE clone_id = :id"),
            {"cid": customer_id, "id": str(record["clone_id"])},
        )
        await session.commit()

    checkout = stripe_lib.checkout.Session.create(
        customer=customer_id,
        line_items=[{"price": body.price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.app_url}/dashboard/billing?success=1",
        cancel_url=f"{settings.app_url}/dashboard/billing?canceled=1",
        metadata={"user_id": body.user_id},
    )

    return {"url": checkout.url}


class PortalRequest(BaseModel):
    user_id: str


@app.post("/billing/customer-portal")
async def create_customer_portal(
    body: PortalRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Create a Stripe Billing Portal session for subscription management."""
    import stripe as stripe_lib

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    stripe_lib.api_key = settings.stripe_secret_key

    row = await session.execute(
        sql_text("SELECT stripe_customer_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    record = row.mappings().first()
    if not record or not record["stripe_customer_id"]:
        raise HTTPException(status_code=404, detail="No Stripe customer found")

    portal = stripe_lib.billing_portal.Session.create(
        customer=record["stripe_customer_id"],
        return_url=f"{settings.app_url}/dashboard/billing",
    )
    return {"url": portal.url}


@app.post("/billing/webhook")
async def stripe_webhook(request: Request) -> dict:
    """Handle Stripe webhook events to update subscription state."""
    import stripe as stripe_lib

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    stripe_lib.api_key = settings.stripe_secret_key

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe_lib.Webhook.construct_event(
            payload, sig, settings.stripe_webhook_secret
        )
    except stripe_lib.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    async with AsyncSessionLocal() as session:
        if event["type"] == "checkout.session.completed":
            obj = event["data"]["object"]
            user_id = obj.get("metadata", {}).get("user_id")
            subscription_id = obj.get("subscription")
            if user_id and subscription_id:
                await session.execute(
                    sql_text("""
                        UPDATE clone_identity
                        SET stripe_subscription_id = :sid
                        WHERE user_id = :uid
                    """),
                    {"sid": subscription_id, "uid": user_id},
                )
                await session.commit()

        elif event["type"] in ("customer.subscription.updated", "customer.subscription.created"):
            sub = event["data"]["object"]
            customer_id = sub.get("customer")
            # Get price ID from first item
            items = sub.get("items", {}).get("data", [])
            price_id = items[0]["price"]["id"] if items else None
            tier = _price_to_tier().get(price_id, "free") if price_id else "free"
            if customer_id:
                await session.execute(
                    sql_text("""
                        UPDATE clone_identity
                        SET subscription_tier = :tier,
                            stripe_subscription_id = :sid
                        WHERE stripe_customer_id = :cid
                    """),
                    {"tier": tier, "sid": sub["id"], "cid": customer_id},
                )
                await session.commit()

        elif event["type"] == "customer.subscription.deleted":
            sub = event["data"]["object"]
            customer_id = sub.get("customer")
            if customer_id:
                await session.execute(
                    sql_text("""
                        UPDATE clone_identity
                        SET subscription_tier = 'free',
                            stripe_subscription_id = NULL
                        WHERE stripe_customer_id = :cid
                    """),
                    {"cid": customer_id},
                )
                await session.commit()

    return {"received": True}


@app.get("/billing/status")
async def billing_status(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return current subscription tier for the user's clone."""

    row = await session.execute(
        sql_text("""
            SELECT subscription_tier, stripe_customer_id, stripe_subscription_id
            FROM clone_identity WHERE user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    return {
        "tier": record["subscription_tier"] or "free",
        "stripe_customer_id": record["stripe_customer_id"],
        "stripe_subscription_id": record["stripe_subscription_id"],
    }


@app.get("/usage")
async def get_usage(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return current-month query usage and limits for the user's clone."""
    row = await session.execute(
        sql_text("""
            SELECT clone_id, subscription_tier, rate_limit_per_day,
                   created_at
            FROM clone_identity WHERE user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    clone_id = str(record["clone_id"])
    tier = record["subscription_tier"] or "free"
    monthly_limit = TIER_MONTHLY_LIMITS.get(tier, 100)

    # Queries this month
    month_row = await session.execute(
        sql_text(
            "SELECT COUNT(*) FROM reasoning_traces "
            "WHERE clone_id = :id AND created_at >= date_trunc('month', NOW())"
        ),
        {"id": clone_id},
    )
    queries_this_month = int(month_row.scalar() or 0)

    # Queries today
    today_row = await session.execute(
        sql_text(
            "SELECT COUNT(*) FROM reasoning_traces "
            "WHERE clone_id = :id AND created_at >= CURRENT_DATE"
        ),
        {"id": clone_id},
    )
    queries_today = int(today_row.scalar() or 0)

    # Total all-time
    total_row = await session.execute(
        sql_text("SELECT COUNT(*) FROM reasoning_traces WHERE clone_id = :id"),
        {"id": clone_id},
    )
    queries_total = int(total_row.scalar() or 0)

    # Memory chunks ingested
    mem_row = await session.execute(
        sql_text("SELECT COUNT(*) FROM episodic_memory WHERE clone_id = :id AND is_excluded = FALSE"),
        {"id": clone_id},
    )
    memory_chunks = int(mem_row.scalar() or 0)

    return {
        "tier": tier,
        "queries_this_month": queries_this_month,
        "queries_today": queries_today,
        "queries_total": queries_total,
        "monthly_limit": monthly_limit,  # 0 = unlimited
        "rate_limit_per_day": int(record["rate_limit_per_day"] or 0),
        "memory_chunks": memory_chunks,
        "member_since": record["created_at"].isoformat() if record["created_at"] else None,
    }


# ---------------------------------------------------------------------------
# Admin — manual plan override
# ---------------------------------------------------------------------------

VALID_TIERS = {"free", "personal", "enterprise_pro", "enterprise_max"}


def _require_admin(caller_user_id: str) -> None:
    """Raise 403 unless caller_user_id matches ADMIN_USER_ID in config."""
    admin_id = settings.admin_user_id
    if not admin_id or caller_user_id != admin_id:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.patch("/admin/users/{clerk_user_id}/plan")
async def admin_set_plan(
    clerk_user_id: str,
    body: dict,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Override subscription_tier for any user. caller_user_id must match ADMIN_USER_ID."""
    _require_admin(caller_user_id)

    tier = body.get("tier")
    if tier not in VALID_TIERS:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {', '.join(VALID_TIERS)}")

    result = await session.execute(
        sql_text("""
            UPDATE clone_identity
            SET subscription_tier = :tier, updated_at = now()
            WHERE user_id = :uid
        """),
        {"tier": tier, "uid": clerk_user_id},
    )
    await session.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    return {"ok": True, "user_id": clerk_user_id, "tier": tier}


@app.post("/admin/migrate")
async def admin_run_migration() -> dict:
    """Force re-run the DB schema migration without restarting."""
    from doppel.brain.db.connection import engine
    schema_sql = _SCHEMA_FILE.read_text()
    stripped_lines = "\n".join(
        line for line in schema_sql.splitlines()
        if not line.strip().startswith("--")
    )
    statements = [s.strip() for s in stripped_lines.split(";") if s.strip()]
    ok, skipped, errors = 0, 0, []
    async with engine.connect() as conn:
        await conn.execution_options(isolation_level="AUTOCOMMIT")
        for stmt in statements:
            try:
                await conn.execute(sql_text(stmt))
                ok += 1
            except Exception as e:
                skipped += 1
                errors.append(f"{type(e).__name__}: {stmt[:80]}")
    return {"applied": ok, "skipped": skipped, "errors": errors[-20:]}


@app.get("/admin/users")
async def admin_list_users(
    caller_user_id: str = Query(...),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List all users with their current plan. caller_user_id must match ADMIN_USER_ID."""
    _require_admin(caller_user_id)

    try:
        rows = await session.execute(
            sql_text("""
                SELECT user_id, display_name, handle,
                       COALESCE(subscription_tier, 'free') AS subscription_tier,
                       stripe_customer_id, created_at
                FROM clone_identity
                ORDER BY created_at DESC
                LIMIT :lim OFFSET :off
            """),
            {"lim": limit, "off": offset},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    users = [
        {
            "user_id": r["user_id"],
            "display_name": r["display_name"],
            "handle": r["handle"],
            "subscription_tier": r["subscription_tier"] or "free",
            "stripe_customer_id": r["stripe_customer_id"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows.mappings().all()
    ]
    return {"users": users, "count": len(users)}


# ---------------------------------------------------------------------------
# Ingestion — Gmail OAuth
# ---------------------------------------------------------------------------

@app.get("/ingestion/gmail/auth-url")
async def gmail_auth_url(
    clone_id: UUID = Query(...),
    return_path: str = Query(default="/dashboard"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Get the Google OAuth consent URL for a clone.
    return_path is encoded in the OAuth state so the callback knows where to redirect.
    """
    await load_clone_keys(session, clone_id)
    from doppel.brain.context import get_google_client_id
    if not get_google_client_id():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth not configured. Add your Client ID in Settings or set GOOGLE_CLIENT_ID in .env.",
        )
    # Encode return_path into state: "{clone_id}|{return_path}"
    state = f"{clone_id}|{return_path}"
    url = get_auth_url(clone_id, state=state)
    return {"url": url, "clone_id": str(clone_id)}


@app.get("/ingestion/gmail/callback")
async def gmail_callback(
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """
    OAuth callback handler — Google redirects here after consent.
    Exchanges the code for tokens and stores them.
    Redirects to a success page (or returns JSON in dev).
    """
    # Decode state: "{clone_id}|{return_path}" or just "{clone_id}"
    parts = state.split("|", 1)
    clone_id_str = parts[0]
    return_path = parts[1] if len(parts) > 1 else "/dashboard"

    try:
        from uuid import UUID as _UUID
        await load_clone_keys(session, _UUID(clone_id_str))
        clone_id = await handle_callback(code=code, state=clone_id_str, session=session)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth failed: {e}")

    redirect_url = f"{settings.app_url}{return_path}?gmail_connected=1&clone_id={clone_id}"
    return RedirectResponse(url=redirect_url)


# ---------------------------------------------------------------------------
# Ingestion — Gmail sync
# ---------------------------------------------------------------------------

class GmailSyncRequest(BaseModel):
    clone_id: UUID
    clone_name: str = "unknown"     # used for style extraction prompt


@app.post("/ingestion/gmail/sync", status_code=202)
async def gmail_sync(
    body: GmailSyncRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Trigger a Gmail ingestion job in the background.
    Returns immediately with a job_id — poll /ingestion/jobs/{job_id} for progress.

    Prerequisites:
      1. Clone must exist in clone_identity
      2. Gmail must be connected via /ingestion/gmail/auth-url
    """
    job_id = await create_job(body.clone_id, "gmail", session)

    background_tasks.add_task(
        _run_gmail_ingestion,
        clone_id=body.clone_id,
        clone_name=body.clone_name,
        job_id=job_id,
    )

    return {
        "job_id": str(job_id),
        "status": "queued",
        "poll": f"GET /ingestion/jobs/{job_id}",
    }


async def _run_gmail_ingestion(
    clone_id: UUID,
    clone_name: str,
    job_id: UUID,
) -> None:
    """Runs in the background — creates its own DB session."""
    from doppel.brain.db.connection import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        await load_clone_keys(session, clone_id)
        connector = GmailConnector(session)
        pipeline = IngestionPipeline(session)
        await pipeline.run(
            clone_id=clone_id,
            connector=connector,
            job_id=job_id,
            clone_name=clone_name,
        )


# ---------------------------------------------------------------------------
# Ingestion — Gmail Push (Pub/Sub watch + webhook)
# ---------------------------------------------------------------------------

@app.post("/ingestion/gmail/watch")
async def gmail_watch(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Subscribe the clone's Gmail inbox to Pub/Sub push notifications."""
    if not settings.gmail_pubsub_topic:
        raise HTTPException(status_code=503, detail="GMAIL_PUBSUB_TOPIC not configured.")
    try:
        result = await gmail_setup_watch(clone_id, settings.gmail_pubsub_topic, session)
    except Exception as e:
        _log.error("gmail_watch failed for clone %s: %s", clone_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to set up Gmail watch")
    import datetime as _dt
    expiry_ts = result.get("expiration")
    expires_at = (
        _dt.datetime.fromtimestamp(int(expiry_ts) / 1000, tz=_dt.timezone.utc).isoformat()
        if expiry_ts
        else None
    )
    return {"watch_active": True, "expires_at": expires_at}


@app.post("/ingestion/gmail/push-event", status_code=200)
async def gmail_push_event(
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Receive Google Cloud Pub/Sub push notifications for new Gmail messages.
    Authenticates via Bearer token in Authorization header.
    Auto-generates a draft for each new inbound email.
    """
    # Verify Pub/Sub token
    if settings.pubsub_verification_token:
        auth_header = request.headers.get("Authorization", "")
        expected = f"Bearer {settings.pubsub_verification_token}"
        if auth_header != expected:
            raise HTTPException(status_code=403, detail="Invalid Pub/Sub token")

    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}  # Always return 200 to avoid Pub/Sub retries on bad payloads

    # Decode Pub/Sub message
    try:
        message_b64 = payload.get("message", {}).get("data", "")
        import base64 as _b64
        notification = json.loads(_b64.b64decode(message_b64 + "==").decode("utf-8"))
        gmail_address: str = notification.get("emailAddress", "")
        history_id: str = str(notification.get("historyId", ""))
    except Exception:
        return {"status": "ok"}

    if not gmail_address or not history_id:
        return {"status": "ok"}

    # Look up clone by Gmail address stored in oauth_tokens metadata
    result = await session.execute(
        sql_text("""
            SELECT clone_id FROM oauth_tokens
            WHERE provider = 'gmail'
              AND (metadata->>'email') = :email
        """),
        {"email": gmail_address},
    )
    row = result.mappings().first()
    if not row:
        return {"status": "ok"}  # Unknown clone — ignore

    clone_id = UUID(str(row["clone_id"]))
    background_tasks.add_task(_process_push_emails, clone_id, history_id)
    return {"status": "ok"}


async def _process_push_emails(clone_id: UUID, history_id: str) -> None:
    """Background: fetch new emails and generate drafts for each one."""
    from doppel.brain.db.connection import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        try:
            messages = await gmail_fetch_since(clone_id, history_id, session)
            for msg in messages:
                await _generate_and_store_draft(
                    clone_id=clone_id,
                    sender=msg["sender"],
                    sender_email=msg["sender_email"],
                    subject=msg["subject"],
                    body=msg["body"],
                    thread_id=msg.get("thread_id"),
                    session=session,
                )
        except Exception as e:
            _log.error("_process_push_emails failed clone=%s: %s", clone_id, e, exc_info=True)


async def _generate_and_store_draft(
    clone_id: UUID,
    sender: str,
    sender_email: str,
    subject: str,
    body: str,
    thread_id: str | None,
    session: AsyncSession,
) -> str:
    """Shared logic: generate a brain draft and store it. Returns draft_id."""
    row = await session.execute(
        sql_text("SELECT display_name FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    record = row.mappings().first()
    if not record:
        raise ValueError(f"Clone {clone_id} not found")
    display_name = record["display_name"]

    await load_clone_keys(session, clone_id)
    brain = DoppelBrain(session=session, clone_id=clone_id)
    prompt = (
        f"You received an email from {sender} <{sender_email}>.\n"
        f"Subject: {subject}\n\n"
        f"Email body:\n{body}\n\n"
        f"Draft a reply as {display_name}. Be concise and authentic to their voice. "
        f"Do not include a subject line or greeting — just the reply body."
    )
    brain_input = BrainInput(
        clone_id=clone_id,
        message=prompt,
        context_type="email_draft",
        metadata={"subject": subject, "sender": sender},
    )
    result = await brain.process(brain_input)
    trace_id = str(result.reasoning_trace_id) if result.reasoning_trace_id else None

    insert = await session.execute(
        sql_text("""
            INSERT INTO email_drafts
                (clone_id, sender, sender_email, subject, body, thread_id, draft, reasoning, trace_id)
            VALUES
                (:cid, :sender, :sender_email, :subject, :body, :thread_id, :draft, :reasoning, :trace_id)
            RETURNING id
        """),
        {
            "cid": str(clone_id),
            "sender": sender,
            "sender_email": sender_email,
            "subject": subject,
            "body": body,
            "thread_id": thread_id,
            "draft": encrypt_field(result.response.strip()),
            "reasoning": f"Drafted based on email from {sender} about '{subject}'.",
            "trace_id": trace_id,
        },
    )
    draft_id = str(insert.scalar())
    await session.commit()
    return draft_id


# ---------------------------------------------------------------------------
# Ingestion — GitHub OAuth + sync
# ---------------------------------------------------------------------------

@app.get("/ingestion/github/auth-url")
async def github_auth_url(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from doppel.ingestion.connectors.github import get_auth_url as gh_get_auth_url
    if not get_github_client_id():
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth not configured. Add GITHUB_CLIENT_ID to .env.",
        )
    url = gh_get_auth_url(clone_id, state=str(clone_id))
    return {"url": url, "clone_id": str(clone_id)}


@app.get("/ingestion/github/callback")
async def github_callback(
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    from doppel.ingestion.connectors.github import handle_callback as gh_handle_callback
    try:
        clone_uuid = UUID(state)
        await gh_handle_callback(code=code, session=session, clone_id=clone_uuid)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"GitHub OAuth failed: {e}")
    return RedirectResponse(url=f"{settings.app_url}/dashboard/train?github_connected=1")


class GitHubSyncRequest(BaseModel):
    clone_id: UUID


@app.post("/ingestion/github/sync", status_code=202)
async def github_sync(
    body: GitHubSyncRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    job_id = await create_job(body.clone_id, "github", session)
    background_tasks.add_task(
        _run_github_ingestion,
        clone_id=body.clone_id,
        job_id=job_id,
    )
    return {"job_id": str(job_id), "status": "queued", "poll": f"GET /ingestion/jobs/{job_id}"}


async def _run_github_ingestion(clone_id: UUID, job_id: UUID) -> None:
    from doppel.brain.db.connection import AsyncSessionLocal
    from doppel.ingestion.connectors.github import get_access_token, fetch_items
    from doppel.ingestion.pipeline import _store_chunk_with_embedding
    from doppel.brain.db.vector import embed_batch
    from doppel.ingestion.pii_redactor import redact_pii
    from doppel.ingestion.status import start_job, update_job, complete_job, fail_job

    async with AsyncSessionLocal() as session:
        await load_clone_keys(session, clone_id)
        token = await get_access_token(session, clone_id)
        if not token:
            await fail_job(job_id, "GitHub not connected", session)
            return

        items = []
        async for item in fetch_items(clone_id, token):
            items.append(item)

        await start_job(job_id, len(items), session)

        processed = 0
        failed = 0
        batch_size = settings.ingestion_batch_size

        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            texts = [redact_pii(it.content) for it in batch]
            try:
                embeddings = await embed_batch(texts)
                for item, text, embedding in zip(batch, texts, embeddings):
                    await _store_chunk_with_embedding(
                        session=session,
                        clone_id=clone_id,
                        content=text,
                        embedding=embedding,
                        item=item,
                        formality=0.6,
                    )
                processed += len(batch)
            except Exception:
                failed += len(batch)
            await update_job(job_id, processed, failed, session)

        await complete_job(job_id, session)


# ---------------------------------------------------------------------------
# Ingestion — Notion OAuth + sync
# ---------------------------------------------------------------------------

@app.get("/ingestion/notion/auth-url")
async def notion_auth_url(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from doppel.ingestion.connectors.notion import get_auth_url as notion_get_auth_url
    if not get_notion_client_id():
        raise HTTPException(
            status_code=503,
            detail="Notion OAuth not configured. Add NOTION_CLIENT_ID to .env.",
        )
    url = notion_get_auth_url(clone_id)
    return {"url": url, "clone_id": str(clone_id)}


@app.get("/ingestion/notion/callback")
async def notion_callback(
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    from doppel.ingestion.connectors.notion import handle_callback as notion_handle_callback
    try:
        clone_uuid = UUID(state)
        await notion_handle_callback(code=code, session=session, clone_id=clone_uuid)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Notion OAuth failed: {e}")
    return RedirectResponse(url=f"{settings.app_url}/dashboard/train?notion_connected=1")


class NotionSyncRequest(BaseModel):
    clone_id: UUID


@app.post("/ingestion/notion/sync", status_code=202)
async def notion_sync(
    body: NotionSyncRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    job_id = await create_job(body.clone_id, "notion", session)
    background_tasks.add_task(
        _run_notion_ingestion,
        clone_id=body.clone_id,
        job_id=job_id,
    )
    return {"job_id": str(job_id), "status": "queued", "poll": f"GET /ingestion/jobs/{job_id}"}


async def _run_notion_ingestion(clone_id: UUID, job_id: UUID) -> None:
    from doppel.brain.db.connection import AsyncSessionLocal
    from doppel.ingestion.connectors.notion import get_access_token, fetch_items
    from doppel.ingestion.pipeline import _store_chunk_with_embedding
    from doppel.brain.db.vector import embed_batch
    from doppel.ingestion.pii_redactor import redact_pii
    from doppel.ingestion.status import start_job, update_job, complete_job, fail_job

    async with AsyncSessionLocal() as session:
        await load_clone_keys(session, clone_id)
        token = await get_access_token(session, clone_id)
        if not token:
            await fail_job(job_id, "Notion not connected", session)
            return

        items = []
        async for item in fetch_items(clone_id, token):
            items.append(item)

        await start_job(job_id, len(items), session)

        processed = 0
        failed = 0
        batch_size = settings.ingestion_batch_size

        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            texts = [redact_pii(it.content) for it in batch]
            try:
                embeddings = await embed_batch(texts)
                for item, text, embedding in zip(batch, texts, embeddings):
                    await _store_chunk_with_embedding(
                        session=session,
                        clone_id=clone_id,
                        content=text,
                        embedding=embedding,
                        item=item,
                        formality=0.5,
                    )
                processed += len(batch)
            except Exception:
                failed += len(batch)
            await update_job(job_id, processed, failed, session)

        await complete_job(job_id, session)


# ---------------------------------------------------------------------------
# Ingestion — raw text upload
# ---------------------------------------------------------------------------

class TextUploadRequest(BaseModel):
    clone_id: UUID
    text: str
    source: str = "upload"          # upload | paste | document
    context_type: str = "document"
    authored_by_user: bool = True
    is_pinned: bool = False


@app.post("/ingestion/text", status_code=201)
async def ingest_text(
    body: TextUploadRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Paste or upload raw text directly into a clone's memory.
    Automatically chunks, embeds, and stores.
    Useful for: documents, notes, blog posts, transcripts.
    """
    from doppel.ingestion.chunker import chunk_text
    from doppel.ingestion.pipeline import _store_chunk_with_embedding
    from doppel.brain.db.vector import embed_batch
    from doppel.ingestion.preprocessor import estimate_formality
    from doppel.ingestion.pii_redactor import redact_pii
    from datetime import datetime, timezone

    await load_clone_keys(session, body.clone_id)
    chunks = chunk_text(body.text, max_chars=settings.ingestion_chunk_max_chars)
    if not chunks:
        raise HTTPException(status_code=400, detail="Text too short or empty after processing.")

    chunks = [redact_pii(c) for c in chunks]
    embeddings = await embed_batch(chunks)
    formality = estimate_formality(body.text)
    now = datetime.now(timezone.utc)

    for chunk, embedding in zip(chunks, embeddings):
        from doppel.ingestion.connectors.base import RawItem
        item = RawItem(
            content=chunk,
            source=body.source,
            authored_by_user=body.authored_by_user,
            context_type=body.context_type,
            created_at=now,
        )
        await _store_chunk_with_embedding(
            session=session,
            clone_id=body.clone_id,
            content=chunk,
            embedding=embedding,
            item=item,
            formality=formality,
        )

    await session.commit()
    return {"chunks_stored": len(chunks)}


# ---------------------------------------------------------------------------
# Ingestion — file upload (PDF, DOCX, XLSX, PPTX, TXT, CSV, …)
# ---------------------------------------------------------------------------

def _extract_text_from_file(filename: str, content: bytes) -> str:
    """Extract plain text from uploaded file bytes. Raises ValueError on unsupported type."""
    import io
    ext = pathlib.Path(filename).suffix.lower() if filename else ""

    if ext == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n\n".join(p for p in pages if p.strip())
        except Exception as e:
            raise ValueError(f"Could not parse PDF: {e}")

    if ext in (".docx",):
        try:
            import docx
            doc = docx.Document(io.BytesIO(content))
            return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            raise ValueError(f"Could not parse DOCX: {e}")

    if ext in (".xlsx", ".xls"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            lines: list[str] = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    row_text = "\t".join(str(c) for c in row if c is not None)
                    if row_text.strip():
                        lines.append(row_text)
            return "\n".join(lines)
        except Exception as e:
            raise ValueError(f"Could not parse XLSX: {e}")

    if ext in (".pptx",):
        try:
            from pptx import Presentation
            prs = Presentation(io.BytesIO(content))
            slides: list[str] = []
            for slide in prs.slides:
                texts = [shape.text for shape in slide.shapes if hasattr(shape, "text") and shape.text.strip()]
                if texts:
                    slides.append("\n".join(texts))
            return "\n\n".join(slides)
        except Exception as e:
            raise ValueError(f"Could not parse PPTX: {e}")

    if ext in (".csv",):
        import csv, io as _io
        reader = csv.reader(_io.StringIO(content.decode("utf-8", errors="replace")))
        return "\n".join("\t".join(row) for row in reader)

    # Fallback: treat as plain text (txt, md, json, html, etc.)
    try:
        return content.decode("utf-8", errors="replace")
    except Exception:
        raise ValueError(f"Cannot extract text from file type '{ext}'")


from fastapi import File, Form, UploadFile


@app.post("/ingestion/file", status_code=201)
async def ingest_file(
    clone_id: str = Form(...),
    file: UploadFile = File(...),
    source: str = Form(default="upload"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Upload a file (PDF, DOCX, XLSX, PPTX, TXT, CSV, MD, …) and ingest it into a clone's memory.
    Text is extracted, chunked, embedded, and stored.
    """
    from doppel.ingestion.chunker import chunk_text
    from doppel.ingestion.pipeline import _store_chunk_with_embedding
    from doppel.brain.db.vector import embed_batch
    from doppel.ingestion.preprocessor import estimate_formality
    from doppel.ingestion.pii_redactor import redact_pii
    from doppel.ingestion.connectors.base import RawItem
    from datetime import datetime, timezone
    import uuid as _uuid

    _MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
    content = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit.")
    filename = file.filename or "upload"

    try:
        text = _extract_text_from_file(filename, content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text could be extracted from the file.")

    clone_uuid = _uuid.UUID(clone_id)
    await load_clone_keys(session, clone_uuid)

    chunks = chunk_text(text, max_chars=settings.ingestion_chunk_max_chars)
    chunks = [redact_pii(c) for c in chunks]
    embeddings = await embed_batch(chunks)
    formality = estimate_formality(text)
    now = datetime.now(timezone.utc)

    for chunk, embedding in zip(chunks, embeddings):
        item = RawItem(
            content=chunk,
            source=source,
            authored_by_user=True,
            context_type="document",
            created_at=now,
        )
        await _store_chunk_with_embedding(
            session=session,
            clone_id=clone_uuid,
            content=chunk,
            embedding=embedding,
            item=item,
            formality=formality,
        )

    await session.commit()
    return {"chunks_stored": len(chunks), "filename": filename, "chars_extracted": len(text)}


# ---------------------------------------------------------------------------
# Ingestion — extract / recompute style fingerprint
# ---------------------------------------------------------------------------

class ExtractStyleRequest(BaseModel):
    clone_id: UUID
    clone_name: str = "this person"


@app.post("/ingestion/extract-style")
async def extract_style(
    body: ExtractStyleRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    (Re)compute the StyleFingerprint from the clone's ingested corpus.
    Call this after bulk ingestion or whenever you want to refresh the style model.
    Requires at least 10 authored chunks in episodic memory.
    """
    await load_clone_keys(session, body.clone_id)
    samples = await fetch_sample_texts(session, body.clone_id, limit=200)
    if len(samples) < 10:
        raise HTTPException(
            status_code=422,
            detail=f"Not enough authored content ({len(samples)} chunks). Ingest more data first.",
        )

    fingerprint = await extract_style_fingerprint(
        session=session,
        clone_id=body.clone_id,
        sample_texts=samples,
        clone_name=body.clone_name,
    )

    return {
        "status": "updated",
        "samples_used": len(samples),
        "fingerprint": fingerprint.model_dump(),
    }


# ---------------------------------------------------------------------------
# Ingestion — job status
# ---------------------------------------------------------------------------

@app.get("/ingestion/jobs/{job_id}")
async def ingestion_job_status(
    job_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Poll the status of an ingestion job."""
    status = await get_job_status(job_id, session)
    if "error" in status and status["error"] == "Job not found":
        raise HTTPException(status_code=404, detail="Job not found")
    return status


# ---------------------------------------------------------------------------
# Brain — memory graph (nodes + edges for visualization)
# ---------------------------------------------------------------------------

@app.get("/brain/graph")
async def get_brain_graph(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Return all memory nodes with 2D PCA positions and cosine-similarity edges.
    Used by the frontend brain visualization.
    """
    import numpy as np

    nodes: list[dict] = []
    raw_embeddings: list[str] = []  # pgvector text: "[v1,v2,...]"

    # -- Episodic (capped at 150, pinned first) --
    ep_result = await session.execute(
        sql_text("""
            SELECT id, content, source, topics, is_pinned, ingested_at,
                   embedding::text AS emb
            FROM episodic_memory
            WHERE clone_id = :cid AND is_excluded = false AND embedding IS NOT NULL
            ORDER BY is_pinned DESC, ingested_at DESC
            LIMIT 150
        """),
        {"cid": str(clone_id)},
    )
    for r in ep_result.mappings():
        text_content = r["content"] or ""
        nodes.append({
            "id": str(r["id"]),
            "type": "episodic",
            "label": text_content[:80],
            "content": text_content[:500],
            "meta": {
                "source": r["source"],
                "topics": list(r["topics"] or []),
                "is_pinned": bool(r["is_pinned"]),
            },
            "created_at": str(r["ingested_at"] or ""),
        })
        raw_embeddings.append(r["emb"])

    # -- Semantic --
    sem_result = await session.execute(
        sql_text("""
            SELECT id, fact, domain, confidence, created_at,
                   embedding::text AS emb
            FROM semantic_memory
            WHERE clone_id = :cid AND embedding IS NOT NULL
            LIMIT 100
        """),
        {"cid": str(clone_id)},
    )
    for r in sem_result.mappings():
        nodes.append({
            "id": str(r["id"]),
            "type": "semantic",
            "label": (r["fact"] or "")[:80],
            "content": r["fact"] or "",
            "meta": {
                "domain": r["domain"] or "general",
                "confidence": float(r["confidence"] or 0.8),
            },
            "created_at": str(r["created_at"] or ""),
        })
        raw_embeddings.append(r["emb"])

    # -- Procedural --
    proc_result = await session.execute(
        sql_text("""
            SELECT id, pattern_type, description, confidence,
                   occurrence_count, created_at, embedding::text AS emb
            FROM procedural_memory
            WHERE clone_id = :cid AND embedding IS NOT NULL
            LIMIT 50
        """),
        {"cid": str(clone_id)},
    )
    for r in proc_result.mappings():
        nodes.append({
            "id": str(r["id"]),
            "type": "procedural",
            "label": (r["description"] or "")[:80],
            "content": r["description"] or "",
            "meta": {
                "pattern_type": r["pattern_type"],
                "confidence": float(r["confidence"] or 0.7),
                "occurrence_count": int(r["occurrence_count"] or 1),
            },
            "created_at": str(r["created_at"] or ""),
        })
        raw_embeddings.append(r["emb"])

    # -- Relational (no embedding — placed at periphery) --
    rel_result = await session.execute(
        sql_text("""
            SELECT id, contact_name, contact_identifier,
                   relationship_type, notes, created_at
            FROM relational_memory
            WHERE clone_id = :cid
            LIMIT 50
        """),
        {"cid": str(clone_id)},
    )
    relational_nodes: list[dict] = []
    for r in rel_result.mappings():
        relational_nodes.append({
            "id": str(r["id"]),
            "type": "relational",
            "label": r["contact_name"] or r["contact_identifier"] or "Unknown",
            "content": "\n".join(filter(None, [
                f"{r['contact_name'] or 'Unknown'} ({r['contact_identifier']})",
                f"Relationship: {r['relationship_type'] or 'unknown'}",
                r["notes"] or "",
            ])),
            "meta": {
                "contact": r["contact_identifier"],
                "relationship_type": r["relationship_type"],
            },
            "created_at": str(r["created_at"] or ""),
        })

    # -- PCA projection to 2D --
    edges: list[dict] = []

    if len(raw_embeddings) >= 2:
        emb_arrays: list[list[float]] = []
        for emb_text in raw_embeddings:
            vals = [float(x) for x in emb_text.strip("[]").split(",")]
            emb_arrays.append(vals)

        X = np.array(emb_arrays, dtype=np.float32)
        X_centered = X - X.mean(axis=0)

        try:
            _, _, Vt = np.linalg.svd(X_centered, full_matrices=False)
            coords_2d = X_centered @ Vt[:2].T
        except Exception:
            rng = np.random.default_rng(42)
            coords_2d = rng.standard_normal((len(emb_arrays), 2)).astype(np.float32)

        # Scale to ±500 range
        for dim in range(2):
            col = coords_2d[:, dim]
            rng_val = col.max() - col.min()
            if rng_val > 0:
                coords_2d[:, dim] = (col - col.min()) / rng_val * 1000 - 500

        for i, node in enumerate(nodes):
            node["x"] = float(coords_2d[i, 0])
            node["y"] = float(coords_2d[i, 1])

        # Cosine similarity edges (top-3 per node, threshold 0.6)
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        X_norm = X / (norms + 1e-8)
        sim_matrix = X_norm @ X_norm.T

        seen_edges: set[tuple[int, int]] = set()
        for i in range(len(emb_arrays)):
            sims = sim_matrix[i].copy()
            sims[i] = -1.0
            top_k = np.argsort(sims)[-3:][::-1]
            for j in top_k:
                if sims[j] > 0.6:
                    key = (min(int(i), int(j)), max(int(i), int(j)))
                    if key not in seen_edges:
                        seen_edges.add(key)
                        edges.append({
                            "source": nodes[i]["id"],
                            "target": nodes[j]["id"],
                            "weight": float(sims[j]),
                        })
    else:
        import random
        for node in nodes:
            node["x"] = random.uniform(-500, 500)
            node["y"] = random.uniform(-500, 500)

    # Place relational nodes in a ring at the periphery
    import math
    count_rel = len(relational_nodes)
    for i, rn in enumerate(relational_nodes):
        angle = (i / max(count_rel, 1)) * 2 * math.pi
        rn["x"] = math.cos(angle) * 650
        rn["y"] = math.sin(angle) * 650

    return {
        "nodes": nodes + relational_nodes,
        "edges": edges,
        "stats": {
            "episodic": sum(1 for n in nodes if n["type"] == "episodic"),
            "semantic": sum(1 for n in nodes if n["type"] == "semantic"),
            "procedural": sum(1 for n in nodes if n["type"] == "procedural"),
            "relational": len(relational_nodes),
        },
    }


# ---------------------------------------------------------------------------
# Brain — memory stats (chunk counts + sources)
# ---------------------------------------------------------------------------

@app.get("/brain/stats")
async def get_brain_stats(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return memory counts and connected sources for the Brain Health card."""

    counts = await session.execute(
        sql_text("""
            SELECT
                (SELECT COUNT(*) FROM episodic_memory  WHERE clone_id = :cid AND is_excluded = false) AS episodic,
                (SELECT COUNT(*) FROM semantic_memory  WHERE clone_id = :cid)                         AS semantic,
                (SELECT COUNT(*) FROM procedural_memory WHERE clone_id = :cid)                        AS procedural,
                (SELECT COUNT(*) FROM relational_memory WHERE clone_id = :cid)                        AS relational
        """),
        {"cid": str(clone_id)},
    )
    row = dict(counts.mappings().first() or {})

    sources_row = await session.execute(
        sql_text("""
            SELECT DISTINCT source
            FROM episodic_memory
            WHERE clone_id = :cid AND is_excluded = false
        """),
        {"cid": str(clone_id)},
    )
    sources = [r["source"] for r in sources_row.mappings()]

    total = sum(int(row.get(k) or 0) for k in ("episodic", "semantic", "procedural", "relational"))

    return {
        "total": total,
        "episodic": int(row.get("episodic") or 0),
        "semantic": int(row.get("semantic") or 0),
        "procedural": int(row.get("procedural") or 0),
        "relational": int(row.get("relational") or 0),
        "sources": sources,
    }


# ---------------------------------------------------------------------------
# Brain — memory inspector (list + pin/exclude individual chunks)
# ---------------------------------------------------------------------------

@app.get("/brain/memories")
async def list_memories(
    clone_id: UUID = Query(...),
    pinned_only: bool = Query(default=False),
    include_excluded: bool = Query(default=False),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List episodic memory chunks for the Memory Inspector."""

    params: dict = {"cid": str(clone_id), "limit": limit, "offset": offset}
    where_parts = ["clone_id = :cid"]
    if pinned_only:
        where_parts.append("is_pinned = true")
    if not include_excluded:
        where_parts.append("is_excluded = false")
    if search:
        where_parts.append("content ILIKE :search")
        params["search"] = f"%{search}%"
    where = " AND ".join(where_parts)

    rows = await session.execute(
        sql_text(f"""
            SELECT id, content, source, is_pinned, is_excluded, topics,
                   created_at, ingested_at
            FROM episodic_memory
            WHERE {where}
            ORDER BY is_pinned DESC, ingested_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    memories = []
    for r in rows.mappings():
        memories.append({
            "id": str(r["id"]),
            "content": r["content"],
            "source": r["source"],
            "is_pinned": bool(r["is_pinned"]),
            "is_excluded": bool(r["is_excluded"]),
            "topics": list(r["topics"] or []),
            "created_at": (r["ingested_at"] or r["created_at"]).isoformat()
            if (r["ingested_at"] or r["created_at"]) else None,
        })

    total_row = await session.execute(
        sql_text(f"SELECT COUNT(*) AS n FROM episodic_memory WHERE {where}"),
        {k: v for k, v in params.items() if k != "limit" and k != "offset"},
    )
    total = int((total_row.mappings().first() or {}).get("n") or 0)

    return {"memories": memories, "total": total, "offset": offset, "limit": limit}


@app.get("/brain/topics")
async def get_topics(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Topic coverage map — aggregate topics from episodic memory."""

    # Top topics by count (from episodic memory topics array)
    topic_rows = await session.execute(
        sql_text("""
            SELECT t AS topic, COUNT(*) AS count,
                   COUNT(*) FILTER (WHERE source = 'gmail')   AS gmail,
                   COUNT(*) FILTER (WHERE source = 'upload')  AS upload,
                   COUNT(*) FILTER (WHERE source = 'seed_qa') AS seed_qa,
                   COUNT(*) FILTER (WHERE source = 'chat')    AS chat
            FROM episodic_memory, unnest(topics) AS t
            WHERE clone_id = :cid AND is_excluded = false AND t != ''
            GROUP BY t
            ORDER BY count DESC
            LIMIT 40
        """),
        {"cid": str(clone_id)},
    )
    topics = [
        {
            "name": r["topic"],
            "count": int(r["count"]),
            "sources": {
                "gmail": int(r["gmail"] or 0),
                "upload": int(r["upload"] or 0),
                "seed_qa": int(r["seed_qa"] or 0),
                "chat": int(r["chat"] or 0),
            },
        }
        for r in topic_rows.mappings()
    ]

    # Total memories
    total_row = await session.execute(
        sql_text("SELECT COUNT(*) AS n FROM episodic_memory WHERE clone_id = :cid AND is_excluded = false"),
        {"cid": str(clone_id)},
    )
    total = int((total_row.mappings().first() or {}).get("n") or 0)

    # Semantic domains with low confidence = knowledge gaps
    gap_rows = await session.execute(
        sql_text("""
            SELECT domain, COUNT(*) AS facts, AVG(confidence) AS avg_confidence
            FROM semantic_memory
            WHERE clone_id = :cid
            GROUP BY domain
            HAVING AVG(confidence) < 0.6 OR COUNT(*) < 3
            ORDER BY avg_confidence ASC
            LIMIT 10
        """),
        {"cid": str(clone_id)},
    )
    gaps = [
        {
            "domain": r["domain"] or "general",
            "facts": int(r["facts"]),
            "avg_confidence": round(float(r["avg_confidence"] or 0), 2),
        }
        for r in gap_rows.mappings()
    ]

    return {"topics": topics, "gaps": gaps, "total_memories": total}


class MemoryUpdateRequest(BaseModel):
    clone_id: UUID
    is_pinned: bool | None = None
    is_excluded: bool | None = None


@app.patch("/brain/memories/{memory_id}", status_code=200)
async def update_memory(
    memory_id: UUID,
    body: MemoryUpdateRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Toggle is_pinned or is_excluded on a single memory chunk."""

    parts, params = [], {"mid": str(memory_id), "cid": str(body.clone_id)}
    if body.is_pinned is not None:
        parts.append("is_pinned = :is_pinned")
        params["is_pinned"] = body.is_pinned
    if body.is_excluded is not None:
        parts.append("is_excluded = :is_excluded")
        params["is_excluded"] = body.is_excluded

    if not parts:
        raise HTTPException(status_code=422, detail="Provide is_pinned or is_excluded")

    result = await session.execute(
        sql_text(
            f"UPDATE episodic_memory SET {', '.join(parts)} "
            f"WHERE id = :mid AND clone_id = :cid"
        ),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Memory not found")
    await session.commit()
    return {"status": "updated"}


# ---------------------------------------------------------------------------
# MEETING BOT — Recall.ai integration
# ---------------------------------------------------------------------------

import httpx as _httpx

@app.websocket("/meetings/stream")
async def meeting_stream_ws(
    websocket: WebSocket,
    clone_id: str,
    platform: str = "zoom",
) -> None:
    """
    WebSocket endpoint for browser-based meeting transcription.

    Browser sends: {"type": "transcript", "speaker": "You", "text": "...", "is_final": true}
    Server sends:  {"type": "transcript_ack"}
                   {"type": "response", "question": "...", "answer": "...", "ts": "..."}
                   {"type": "session_started", "session_id": "..."}
                   {"type": "error", "message": "..."}
    """
    import datetime as _dt
    import uuid as _uuid_mod

    await websocket.accept()

    session_id = str(_uuid_mod.uuid4())

    # Verify clone exists
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            sql_text("SELECT display_name FROM clone_identity WHERE clone_id = :cid"),
            {"cid": clone_id},
        )
        rec = row.mappings().first()
    if not rec:
        await websocket.send_json({"type": "error", "message": "Clone not found"})
        await websocket.close()
        return

    display_name: str = rec["display_name"]
    first_name = display_name.split()[0]

    # Create session record
    async with AsyncSessionLocal() as db:
        await db.execute(
            sql_text("""
                INSERT INTO meeting_sessions
                    (bot_id, clone_id, meeting_url, meeting_platform, status)
                VALUES (:sid, :cid, :url, :platform, 'in_call')
            """),
            {"sid": session_id, "cid": clone_id, "url": f"local://{platform}", "platform": platform},
        )
        await db.commit()

    await websocket.send_json({"type": "session_started", "session_id": session_id})

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") != "transcript":
                continue

            text: str = (data.get("text") or "").strip()
            if not text:
                continue

            speaker: str = data.get("speaker") or "You"
            ts = _dt.datetime.utcnow().isoformat()
            entry = {"speaker": speaker, "text": text, "ts": ts}

            # Persist transcript line
            async with AsyncSessionLocal() as db:
                await db.execute(
                    sql_text("""
                        UPDATE meeting_sessions
                        SET transcript = transcript || CAST(:entry AS jsonb)
                        WHERE bot_id = :sid
                    """),
                    {"entry": json.dumps([entry]), "sid": session_id},
                )
                await db.commit()

            # Check trigger
            triggered = (
                first_name.lower() in text.lower()
                or display_name.lower() in text.lower()
                or "doppel" in text.lower()
            )
            if not triggered:
                continue

            # Query clone brain
            try:
                async with AsyncSessionLocal() as db:
                    trow = await db.execute(
                        sql_text("SELECT transcript FROM meeting_sessions WHERE bot_id = :sid"),
                        {"sid": session_id},
                    )
                    trec = trow.mappings().first()
                    recent = list((trec["transcript"] if trec else None) or [])[-30:]

                context = "\n".join(f"{e['speaker']}: {e['text']}" for e in recent)

                from doppel.brain.models.types import BrainInput
                async with AsyncSessionLocal() as db:
                    await load_clone_keys(db, UUID(clone_id))
                    brain = DoppelBrain(session=db, clone_id=UUID(clone_id))
                    result = await brain.process(BrainInput(
                        clone_id=UUID(clone_id),
                        message=text,
                        context_type="meeting",
                        metadata={"meeting_context": context, "platform": platform},
                    ))

                if not result.response.strip():
                    continue

                response_entry = {
                    "question": text,
                    "answer": result.response.strip(),
                    "ts": _dt.datetime.utcnow().isoformat(),
                }

                async with AsyncSessionLocal() as db:
                    await db.execute(
                        sql_text("""
                            UPDATE meeting_sessions
                            SET responses = responses || CAST(:entry AS jsonb)
                            WHERE bot_id = :sid
                        """),
                        {"entry": json.dumps([response_entry]), "sid": session_id},
                    )
                    await db.commit()

                await websocket.send_json({"type": "response", **response_entry})

            except Exception as exc:
                _log.error("Meeting brain error: %s", exc)
                await websocket.send_json({"type": "error", "message": "Brain unavailable — try again"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        _log.error("Meeting WebSocket error: %s", exc)
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(
                sql_text(
                    "UPDATE meeting_sessions SET status = 'ended', ended_at = NOW() WHERE bot_id = :sid"
                ),
                {"sid": session_id},
            )
            await db.commit()


@app.post("/meetings/{session_id}/leave")
async def leave_meeting(
    session_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """End a meeting session (marks as ended in DB)."""
    await session.execute(
        sql_text(
            "UPDATE meeting_sessions SET status = 'ended', ended_at = NOW() WHERE bot_id = :sid"
        ),
        {"sid": session_id},
    )
    await session.commit()
    return {"status": "ended"}


@app.get("/meetings/sessions")
async def list_meeting_sessions(
    clone_id: UUID = Query(...),
    limit: int = Query(default=20, le=100),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List past and active meeting sessions for a clone."""

    rows = await session.execute(
        sql_text("""
            SELECT bot_id, meeting_url, meeting_platform, status,
                   transcript, responses, started_at, ended_at
            FROM meeting_sessions
            WHERE clone_id = :cid
            ORDER BY started_at DESC
            LIMIT :limit
        """),
        {"cid": str(clone_id), "limit": limit},
    )
    sessions = []
    for r in rows.mappings():
        sessions.append({
            "bot_id": r["bot_id"],
            "meeting_url": r["meeting_url"],
            "platform": r["meeting_platform"],
            "status": r["status"],
            "transcript": list(r["transcript"] or []),
            "responses": list(r["responses"] or []),
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
            "ended_at": r["ended_at"].isoformat() if r["ended_at"] else None,
        })
    return {"sessions": sessions}


@app.get("/meetings/{bot_id}")
async def get_meeting_session(
    bot_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get a single meeting session with live transcript."""

    row = await session.execute(
        sql_text("""
            SELECT bot_id, meeting_url, meeting_platform, status,
                   transcript, responses, started_at, ended_at
            FROM meeting_sessions
            WHERE bot_id = :bid
        """),
        {"bid": bot_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "bot_id": record["bot_id"],
        "meeting_url": record["meeting_url"],
        "platform": record["meeting_platform"],
        "status": record["status"],
        "transcript": list(record["transcript"] or []),
        "responses": list(record["responses"] or []),
        "started_at": record["started_at"].isoformat() if record["started_at"] else None,
        "ended_at": record["ended_at"].isoformat() if record["ended_at"] else None,
    }


# ---------------------------------------------------------------------------
# EMAIL DRAFTS — Draft replies generated by the clone brain
# ---------------------------------------------------------------------------

class EmailDraftReviewRequest(BaseModel):
    status: str  # approved | edited | rejected
    edited_version: str | None = None


class GenerateDraftRequest(BaseModel):
    clone_id: UUID
    sender: str
    sender_email: str
    subject: str
    body: str
    thread_id: str | None = None


@app.post("/email/generate-draft")
async def generate_email_draft(
    body: GenerateDraftRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Generate a draft reply for an email using the clone brain. Store it as pending."""
    try:
        draft_id = await _generate_and_store_draft(
            clone_id=body.clone_id,
            sender=body.sender,
            sender_email=body.sender_email,
            subject=body.subject,
            body=body.body,
            thread_id=body.thread_id,
            session=session,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Fetch back the stored draft text for the response
    row = await session.execute(
        sql_text("SELECT draft, reasoning FROM email_drafts WHERE id = :id"),
        {"id": draft_id},
    )
    r = row.mappings().first()
    return {"draft_id": draft_id, "draft": decrypt_field(r["draft"]) if r else "", "reasoning": r["reasoning"] if r else ""}


@app.get("/email/drafts")
async def list_email_drafts(
    clone_id: UUID = Query(...),
    status: str | None = Query(default=None),
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List email drafts for a clone."""

    where_parts = ["clone_id = :cid"]
    params: dict = {"cid": str(clone_id), "limit": limit, "offset": offset}
    if status:
        where_parts.append("status = :status")
        params["status"] = status
    where = " AND ".join(where_parts)

    rows = await session.execute(
        sql_text(f"""
            SELECT id, sender, sender_email, subject, body, draft, reasoning,
                   status, edited_version, received_at, reviewed_at, created_at
            FROM email_drafts
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    drafts = []
    for r in rows.mappings():
        drafts.append({
            "id": str(r["id"]),
            "sender": r["sender"],
            "sender_email": r["sender_email"],
            "subject": r["subject"],
            "body": r["body"],
            "draft": decrypt_field(r["draft"]),
            "reasoning": r["reasoning"],
            "status": r["status"],
            "edited_version": decrypt_field(r["edited_version"]),
            "received_at": r["received_at"].isoformat() if r["received_at"] else None,
            "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None,
        })

    total_row = await session.execute(
        sql_text(f"SELECT COUNT(*) AS n FROM email_drafts WHERE {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int((total_row.mappings().first() or {}).get("n") or 0)
    return {"drafts": drafts, "total": total}


@app.patch("/email/drafts/{draft_id}")
async def review_email_draft(
    draft_id: UUID,
    body: EmailDraftReviewRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Mark a draft as approved, edited, or rejected. Wires feedback to learning loop."""

    if body.status not in ("approved", "edited", "rejected"):
        raise HTTPException(status_code=422, detail="status must be approved, edited, or rejected")

    # Fetch trace_id and clone_id before update for learning loop
    meta_row = await session.execute(
        sql_text("SELECT trace_id, clone_id FROM email_drafts WHERE id = :id"),
        {"id": str(draft_id)},
    )
    meta = meta_row.mappings().first()
    if not meta:
        raise HTTPException(status_code=404, detail="Draft not found")

    result = await session.execute(
        sql_text("""
            UPDATE email_drafts
            SET status = :status,
                edited_version = :edited,
                reviewed_at = NOW()
            WHERE id = :id
        """),
        {"status": body.status, "edited": encrypt_field(body.edited_version), "id": str(draft_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    await session.commit()

    # Wire feedback into DPO learning pipeline if we have a trace
    if meta["trace_id"]:
        signal_map = {"approved": "approve", "edited": "edit", "rejected": "reject"}
        try:
            from doppel.brain.learning.feedback import record_feedback
            await record_feedback(
                session,
                FeedbackSignal(
                    trace_id=UUID(str(meta["trace_id"])),
                    clone_id=UUID(str(meta["clone_id"])),
                    signal_type=signal_map[body.status],
                    corrected_response=body.edited_version if body.status == "edited" else None,
                ),
            )
        except Exception as e:
            _log.warning("Email draft feedback recording failed: %s", e)

    return {"status": body.status}


@app.post("/email/drafts/{draft_id}/send")
async def send_email_draft(
    draft_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Send an approved or edited draft via Gmail API."""
    row = await session.execute(
        sql_text("""
            SELECT clone_id, sender_email, subject, draft, edited_version, status, thread_id
            FROM email_drafts WHERE id = :id
        """),
        {"id": str(draft_id)},
    )
    draft = row.mappings().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft["status"] not in ("approved", "edited"):
        raise HTTPException(status_code=422, detail="Draft must be approved or edited before sending")

    final_text = decrypt_field(draft["edited_version"]) if draft["status"] == "edited" else decrypt_field(draft["draft"])
    subject = draft["subject"]
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    try:
        await gmail_send_email(
            clone_id=UUID(str(draft["clone_id"])),
            to=draft["sender_email"],
            subject=subject,
            body=final_text,
            thread_id=draft["thread_id"],
            session=session,
        )
    except Exception as e:
        _log.error("Gmail send failed draft_id=%s: %s", draft_id, e, exc_info=True)
        raise HTTPException(status_code=502, detail="Failed to send email via Gmail")

    await session.execute(
        sql_text("UPDATE email_drafts SET status = 'sent', reviewed_at = COALESCE(reviewed_at, NOW()) WHERE id = :id"),
        {"id": str(draft_id)},
    )
    await session.commit()
    return {"sent": True}


# ---------------------------------------------------------------------------
# RATE LIMITING — Public clone queries per visitor per day
# ---------------------------------------------------------------------------

@app.patch("/clones/{handle}/rate-limit")
async def set_rate_limit(
    handle: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Set queries-per-day rate limit for a clone's public page."""

    body = await request.json()
    limit = int(body.get("rate_limit_per_day", 0))

    result = await session.execute(
        sql_text(
            "UPDATE clone_identity SET rate_limit_per_day = :lim WHERE handle = :handle"
        ),
        {"lim": limit, "handle": handle},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Clone not found")
    await session.commit()
    return {"rate_limit_per_day": limit}


# ---------------------------------------------------------------------------
# DEVELOPER API KEYS
# External access tokens for programmatic clone API usage.
# ---------------------------------------------------------------------------

import secrets as _secrets


class CreateDevKeyRequest(BaseModel):
    user_id: str
    name: str


@app.get("/developer/keys")
async def list_dev_keys(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List all developer API keys for the user's clone (secrets masked)."""

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    clone_id = record["clone_id"]
    keys_row = await session.execute(
        sql_text("""
            SELECT id, name, key_preview, created_at, last_used_at
            FROM developer_api_keys
            WHERE clone_id = :cid
            ORDER BY created_at DESC
        """),
        {"cid": str(clone_id)},
    )
    keys = [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "key_preview": r["key_preview"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "last_used_at": r["last_used_at"].isoformat() if r["last_used_at"] else None,
        }
        for r in keys_row.mappings().all()
    ]
    return {"keys": keys}


@app.post("/developer/keys")
async def create_dev_key(
    body: CreateDevKeyRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Generate a new developer API key. Returns the full secret ONCE."""

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    import hashlib as _hashlib
    clone_id = record["clone_id"]
    raw_key = "dak_" + _secrets.token_urlsafe(32)
    key_hash = _hashlib.sha256(raw_key.encode()).hexdigest()
    key_preview = raw_key[:12] + "…"

    row2 = await session.execute(
        sql_text("""
            INSERT INTO developer_api_keys (clone_id, name, key_hash, key_preview)
            VALUES (:cid, :name, :hash, :preview)
            RETURNING id, created_at
        """),
        {"cid": str(clone_id), "name": body.name, "hash": key_hash, "preview": key_preview},
    )
    result = row2.mappings().first()
    await session.commit()
    return {
        "id": str(result["id"]),
        "name": body.name,
        "key": raw_key,          # shown only once
        "key_preview": key_preview,
        "created_at": result["created_at"].isoformat() if result["created_at"] else None,
    }


@app.delete("/developer/keys/{key_id}")
async def revoke_dev_key(
    key_id: str,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Revoke a developer API key."""

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    result = await session.execute(
        sql_text(
            "DELETE FROM developer_api_keys WHERE id = :kid AND clone_id = :cid"
        ),
        {"kid": key_id, "cid": str(record["clone_id"])},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    await session.commit()
    return {"status": "revoked"}


# ---------------------------------------------------------------------------
# ORG WORKSPACE
# B2B team workspace: invite members, list clones, cross-clone search.
# ---------------------------------------------------------------------------

class CreateOrgRequest(BaseModel):
    user_id: str
    name: str
    slug: str


class InviteOrgMemberRequest(BaseModel):
    org_id: str
    invited_email: str
    role: str = "member"


@app.post("/org")
async def create_org(
    body: CreateOrgRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Create a new org (team workspace)."""

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    try:
        row2 = await session.execute(
            sql_text("""
                INSERT INTO orgs (name, slug, owner_user_id)
                VALUES (:name, :slug, :uid)
                RETURNING id, created_at
            """),
            {"name": body.name, "slug": body.slug, "uid": body.user_id},
        )
        org = row2.mappings().first()
        # Auto-add owner as admin member
        await session.execute(
            sql_text("""
                INSERT INTO org_memberships (org_id, user_id, clone_id, role)
                VALUES (:oid, :uid, :cid, 'admin')
            """),
            {"oid": str(org["id"]), "uid": body.user_id, "cid": str(record["clone_id"])},
        )
        await session.commit()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Org slug already taken")
        _log.error("org creation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"org_id": str(org["id"]), "name": body.name, "slug": body.slug}


@app.get("/org")
async def get_my_org(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get the org the user belongs to (first match)."""

    row = await session.execute(
        sql_text("""
            SELECT o.id, o.name, o.slug, o.owner_user_id, o.created_at
            FROM orgs o
            JOIN org_memberships m ON m.org_id = o.id
            WHERE m.user_id = :uid
            LIMIT 1
        """),
        {"uid": user_id},
    )
    record = row.mappings().first()
    if not record:
        return {"org": None}

    return {
        "org": {
            "id": str(record["id"]),
            "name": record["name"],
            "slug": record["slug"],
            "is_owner": record["owner_user_id"] == user_id,
            "created_at": record["created_at"].isoformat() if record["created_at"] else None,
        }
    }


@app.get("/org/members")
async def get_org_members(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get all members + their clones in the user's org."""

    # Find org
    org_row = await session.execute(
        sql_text("""
            SELECT org_id FROM org_memberships WHERE user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    org_rec = org_row.mappings().first()
    if not org_rec:
        return {"members": []}

    org_id = org_rec["org_id"]
    members_row = await session.execute(
        sql_text("""
            SELECT m.user_id, m.role, m.joined_at,
                   c.clone_id, c.display_name, c.handle, c.access_mode,
                   COALESCE(c.is_onboarding_resource, FALSE) AS is_onboarding_resource
            FROM org_memberships m
            LEFT JOIN clone_identity c ON c.clone_id = m.clone_id
            WHERE m.org_id = :oid
            ORDER BY m.joined_at ASC
        """),
        {"oid": str(org_id)},
    )
    members = [
        {
            "user_id": r["user_id"],
            "role": r["role"],
            "joined_at": r["joined_at"].isoformat() if r["joined_at"] else None,
            "clone": {
                "clone_id": str(r["clone_id"]) if r["clone_id"] else None,
                "display_name": r["display_name"],
                "handle": r["handle"],
                "access_mode": r["access_mode"],
                "is_onboarding_resource": bool(r["is_onboarding_resource"]),
            } if r["clone_id"] else None,
        }
        for r in members_row.mappings().all()
    ]
    return {"members": members, "org_id": str(org_id)}


class UpdateMemberRoleRequest(BaseModel):
    admin_user_id: str   # must be org admin
    target_user_id: str
    new_role: str        # 'admin' | 'member'


@app.patch("/org/members/role")
async def update_member_role(
    body: UpdateMemberRoleRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Change a member's role. Only org admins can do this."""
    if body.new_role not in ("admin", "member"):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'member'")

    # Verify admin_user_id is an org admin
    admin_row = (await session.execute(
        sql_text("""
            SELECT m.org_id, m.role
            FROM org_memberships m
            WHERE m.user_id = :uid
            LIMIT 1
        """),
        {"uid": body.admin_user_id},
    )).mappings().first()

    if not admin_row or admin_row["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only org admins can change member roles")

    org_id = admin_row["org_id"]

    # Don't allow demoting yourself if you're the only admin
    if body.admin_user_id == body.target_user_id and body.new_role != "admin":
        admin_count = (await session.execute(
            sql_text("SELECT COUNT(*) FROM org_memberships WHERE org_id = :oid AND role = 'admin'"),
            {"oid": str(org_id)},
        )).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="Cannot demote the only admin")

    result = await session.execute(
        sql_text("""
            UPDATE org_memberships
            SET role = :role
            WHERE org_id = :org_id AND user_id = :target_uid
            RETURNING user_id, role
        """),
        {"role": body.new_role, "org_id": str(org_id), "target_uid": body.target_user_id},
    )
    updated = result.mappings().first()
    if not updated:
        raise HTTPException(status_code=404, detail="Member not found in your org")

    await session.commit()
    return {"status": "updated", "user_id": body.target_user_id, "role": body.new_role}


@app.get("/org/knowledge-directory")
async def get_knowledge_directory(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return org clones marked as onboarding resources, visible to org members."""
    # Find caller's org
    org_row = (await session.execute(
        sql_text("""
            SELECT m.org_id FROM org_memberships m
            WHERE m.user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )).mappings().first()
    if not org_row:
        return {"clones": []}

    org_id = str(org_row["org_id"])
    rows = await session.execute(
        sql_text("""
            SELECT c.clone_id, c.display_name, c.handle, c.expertise_tags, m.role
            FROM org_memberships m
            JOIN clone_identity c ON c.clone_id = m.clone_id
            WHERE m.org_id = :oid
              AND c.is_onboarding_resource = TRUE
            ORDER BY c.display_name
        """),
        {"oid": org_id},
    )
    clones = [
        {
            "clone_id": str(r["clone_id"]),
            "display_name": r["display_name"],
            "handle": r["handle"],
            "expertise_tags": list(r["expertise_tags"] or []),
            "member_role": r["role"],
        }
        for r in rows.mappings()
    ]
    return {"clones": clones}


@app.post("/org/invite")
async def invite_org_member(
    body: InviteOrgMemberRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Invite a user to join the org by email (stub — real flow would send email)."""

    # Find the invitee's clone by email match via Clerk — stubbed here.
    # In production: look up user_id from Clerk by email, then INSERT org_membership.
    # For now, record a pending invite.
    await session.execute(
        sql_text("""
            INSERT INTO org_invites (org_id, invited_email, role)
            VALUES (:oid, :email, :role)
            ON CONFLICT (org_id, invited_email) DO NOTHING
        """),
        {"oid": body.org_id, "email": body.invited_email, "role": body.role},
    )
    await session.commit()
    return {"status": "invited", "email": body.invited_email}


@app.get("/org/pending-invite")
async def get_pending_invite(
    email: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Check if an email has a pending org invite. Returns org info if found."""
    row = await session.execute(
        sql_text("""
            SELECT i.org_id, i.role, i.invited_at,
                   o.name AS org_name, o.slug AS org_slug
            FROM org_invites i
            JOIN orgs o ON o.id = i.org_id
            WHERE LOWER(i.invited_email) = LOWER(:email)
            ORDER BY i.invited_at DESC
            LIMIT 1
        """),
        {"email": email},
    )
    rec = row.mappings().first()
    if not rec:
        return {"invite": None}
    return {
        "invite": {
            "org_id": str(rec["org_id"]),
            "org_name": rec["org_name"],
            "org_slug": rec["org_slug"],
            "role": rec["role"],
        }
    }


class JoinOrgRequest(BaseModel):
    user_id: str
    email: str


@app.post("/org/join")
async def join_org(
    body: JoinOrgRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Accept a pending invite and add user to the org."""
    # Find invite
    inv_row = await session.execute(
        sql_text("""
            SELECT i.org_id, i.role, o.name, o.slug, o.owner_user_id
            FROM org_invites i
            JOIN orgs o ON o.id = i.org_id
            WHERE LOWER(i.invited_email) = LOWER(:email)
            ORDER BY i.invited_at DESC
            LIMIT 1
        """),
        {"email": body.email},
    )
    inv = inv_row.mappings().first()
    if not inv:
        raise HTTPException(status_code=404, detail="No pending invite found for this email")

    # Check if already a member
    existing = await session.execute(
        sql_text("SELECT 1 FROM org_memberships WHERE org_id = :oid AND user_id = :uid"),
        {"oid": str(inv["org_id"]), "uid": body.user_id},
    )
    if existing.first():
        return {
            "status": "already_member",
            "org": {"id": str(inv["org_id"]), "name": inv["name"], "slug": inv["slug"],
                    "is_owner": inv["owner_user_id"] == body.user_id, "created_at": None},
        }

    # Get clone_id for this user
    clone_row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    clone_rec = clone_row.mappings().first()

    await session.execute(
        sql_text("""
            INSERT INTO org_memberships (org_id, user_id, clone_id, role)
            VALUES (:oid, :uid, :cid, :role)
            ON CONFLICT (org_id, user_id) DO NOTHING
        """),
        {
            "oid": str(inv["org_id"]),
            "uid": body.user_id,
            "cid": str(clone_rec["clone_id"]) if clone_rec else None,
            "role": inv["role"],
        },
    )
    # Remove the used invite
    await session.execute(
        sql_text("DELETE FROM org_invites WHERE org_id = :oid AND LOWER(invited_email) = LOWER(:email)"),
        {"oid": str(inv["org_id"]), "email": body.email},
    )
    await session.commit()

    return {
        "status": "joined",
        "org": {
            "id": str(inv["org_id"]),
            "name": inv["name"],
            "slug": inv["slug"],
            "is_owner": inv["owner_user_id"] == body.user_id,
            "created_at": None,
        },
    }


class OrgSearchRequest(BaseModel):
    user_id: str
    query: str
    top_k: int = 5


@app.post("/org/search")
async def org_cross_clone_search(
    body: OrgSearchRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Semantic search across all clones in the user's org."""

    # Get org
    org_row = await session.execute(
        sql_text("SELECT org_id FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    org_rec = org_row.mappings().first()
    if not org_rec:
        raise HTTPException(status_code=404, detail="Not in an org")

    # Get all clone_ids in org
    clones_row = await session.execute(
        sql_text("""
            SELECT m.clone_id, c.display_name, c.handle
            FROM org_memberships m
            JOIN clone_identity c ON c.clone_id = m.clone_id
            WHERE m.org_id = :oid AND m.clone_id IS NOT NULL
        """),
        {"oid": str(org_rec["org_id"])},
    )
    clones = clones_row.mappings().all()
    if not clones:
        return {"results": []}

    # Embed query and search across all clones
    from doppel.brain.memory.episodic import embed_text
    try:
        embedding = await embed_text(body.query)
    except Exception:
        raise HTTPException(status_code=503, detail="Embedding service unavailable")

    clone_ids = [str(c["clone_id"]) for c in clones]
    clone_map = {str(c["clone_id"]): {"display_name": c["display_name"], "handle": c["handle"]} for c in clones}

    results_row = await session.execute(
        sql_text("""
            SELECT clone_id, content, source,
                   1 - (embedding <=> CAST(:emb AS vector)) AS similarity
            FROM episodic_memory
            WHERE clone_id = ANY(:ids)
              AND is_excluded = FALSE
              AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:emb AS vector)
            LIMIT :k
        """),
        {"emb": str(embedding), "ids": clone_ids, "k": body.top_k},
    )
    results = [
        {
            "clone_id": str(r["clone_id"]),
            "clone_name": clone_map.get(str(r["clone_id"]), {}).get("display_name"),
            "clone_handle": clone_map.get(str(r["clone_id"]), {}).get("handle"),
            "content": r["content"],
            "source": r["source"],
            "similarity": float(r["similarity"]),
        }
        for r in results_row.mappings().all()
    ]
    return {"results": results}


# ---------------------------------------------------------------------------
# Org policies (admin)
# ---------------------------------------------------------------------------

class OrgPoliciesRequest(BaseModel):
    user_id: str
    default_clone_access_mode: str = "org_scoped"


@app.patch("/org/policies")
async def update_org_policies(
    body: OrgPoliciesRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Org admin: set default access mode for all new clones."""
    valid_modes = ("private", "allowlist", "public", "org_scoped")
    if body.default_clone_access_mode not in valid_modes:
        raise HTTPException(status_code=422, detail=f"access_mode must be one of: {', '.join(valid_modes)}")

    row = await session.execute(
        sql_text("""
            SELECT o.id, o.owner_user_id FROM orgs o
            JOIN org_memberships m ON m.org_id = o.id
            WHERE m.user_id = :uid AND m.role = 'admin'
            LIMIT 1
        """),
        {"uid": body.user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=403, detail="Must be org admin")

    await session.execute(
        sql_text("UPDATE orgs SET default_clone_access_mode = :mode WHERE id = :id"),
        {"mode": body.default_clone_access_mode, "id": str(rec["id"])},
    )
    await session.commit()
    return {"status": "updated", "default_clone_access_mode": body.default_clone_access_mode}


# ---------------------------------------------------------------------------
# v1 PUBLIC DEVELOPER API
# Authenticated via `Authorization: Bearer dak_...` header.
# Designed for external apps and SDK usage.
# ---------------------------------------------------------------------------

import hashlib as _hashlib


async def _auth_dev_key(
    request: Request,
    session: AsyncSession,
) -> tuple[str, str]:
    """Validate Bearer dak_ token, return (clone_id, handle)."""

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    raw_key = auth_header.removeprefix("Bearer ").strip()
    key_hash = _hashlib.sha256(raw_key.encode()).hexdigest()

    row = await session.execute(
        sql_text("""
            SELECT k.clone_id, c.handle
            FROM developer_api_keys k
            JOIN clone_identity c ON c.clone_id = k.clone_id
            WHERE k.key_hash = :hash
        """),
        {"hash": key_hash},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Update last_used_at asynchronously (best-effort)
    await session.execute(
        sql_text("UPDATE developer_api_keys SET last_used_at = NOW() WHERE key_hash = :hash"),
        {"hash": key_hash},
    )
    await session.commit()
    return str(rec["clone_id"]), rec["handle"]


class V1ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    context_type: str = "chat"
    metadata: dict = {}


@app.post("/v1/clones/{handle}/chat")
async def v1_clone_chat(
    handle: str,
    body: V1ChatRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Developer API: chat with a clone.
    Authenticate with: Authorization: Bearer dak_...
    """
    clone_id, _ = await _auth_dev_key(request, session)
    await _check_rate_limit(UUID(clone_id), session)

    import uuid as _uuid
    await load_clone_keys(session, _uuid.UUID(clone_id))
    brain = DoppelBrain(clone_id=_uuid.UUID(clone_id), session=session)
    brain_input = BrainInput(
        clone_id=clone_id,
        session_id=body.session_id or str(_uuid.uuid4()),
        message=body.message,
        context_type=body.context_type,  # type: ignore[arg-type]
        metadata=body.metadata,
    )
    try:
        result: BrainOutput = await brain.process(brain_input)
    except Exception as e:
        _log.error("v1_clone_chat brain.process failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Brain processing error: {e}")

    return {
        "response": result.response,
        "confidence": float(result.confidence) if result.confidence is not None else None,
        "path_taken": result.path_taken,
        "needs_escalation": bool(result.needs_escalation),
        "sources": [
            {"content": s.excerpt, "source": s.source, "similarity": float(s.similarity_score) if s.similarity_score is not None else None}
            for s in (result.sources or [])
        ],
        "trace_id": str(result.reasoning_trace_id) if result.reasoning_trace_id else None,
        "latency_ms": int(result.latency_ms) if result.latency_ms is not None else None,
    }


class V1DraftRequest(BaseModel):
    prompt: str
    context: str = ""
    context_type: str = "document"


@app.post("/v1/clones/{handle}/draft")
async def v1_clone_draft(
    handle: str,
    body: V1DraftRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Developer API: generate any text output in the clone's voice.
    Useful for emails, docs, replies — any format, not just chat.
    """
    clone_id, _ = await _auth_dev_key(request, session)

    import uuid as _uuid
    brain = DoppelBrain(clone_id=_uuid.UUID(clone_id), session=session)
    message = body.prompt
    if body.context:
        message = f"Context:\n{body.context}\n\nTask:\n{body.prompt}"

    brain_input = BrainInput(
        clone_id=clone_id,
        session_id=str(_uuid.uuid4()),
        message=message,
        context_type=body.context_type,  # type: ignore[arg-type]
    )
    result: BrainOutput = await brain.process(brain_input)
    return {
        "draft": result.response,
        "confidence": result.confidence,
        "trace_id": result.reasoning_trace_id,
    }


@app.get("/v1/clones/{handle}/eval")
async def v1_clone_eval(
    handle: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Developer API: retrieve style + grounding quality scores for this clone.
    """
    clone_id, _ = await _auth_dev_key(request, session)

    stats_row = await session.execute(
        sql_text("""
            SELECT
                COUNT(*)                                                    AS total,
                COUNT(feedback_signal)                                      AS has_feedback,
                COUNT(CASE WHEN feedback_signal = 'approved' THEN 1 END)   AS approved,
                COUNT(CASE WHEN feedback_signal = 'edited'   THEN 1 END)   AS edited,
                AVG(confidence)                                             AS avg_confidence,
                AVG(style_score)                                            AS avg_style_score
            FROM reasoning_traces
            WHERE clone_id = :cid
        """),
        {"cid": clone_id},
    )
    s = dict(stats_row.mappings().first() or {})

    mem_row = await session.execute(
        sql_text("SELECT COUNT(*) AS total FROM episodic_memory WHERE clone_id = :cid AND is_excluded = FALSE"),
        {"cid": clone_id},
    )
    mem_count = int((mem_row.mappings().first() or {}).get("total") or 0)

    total = int(s.get("total") or 0)
    has_fb = int(s.get("has_feedback") or 0)
    approved = int(s.get("approved") or 0)
    edited = int(s.get("edited") or 0)
    avg_conf = s.get("avg_confidence")
    avg_style = s.get("avg_style_score")

    return {
        "clone_handle": handle,
        "memory_chunks": mem_count,
        "total_responses": total,
        "approval_rate": round(approved / has_fb * 100, 1) if has_fb > 0 else None,
        "correction_rate": round(edited / has_fb * 100, 1) if has_fb > 0 else None,
        "avg_confidence": round(float(avg_conf) * 100, 1) if avg_conf else None,
        "avg_style_score": round(float(avg_style) * 100, 1) if avg_style else None,
        "quality_grade": (
            "A" if (avg_conf or 0) > 0.8
            else "B" if (avg_conf or 0) > 0.65
            else "C" if (avg_conf or 0) > 0.5
            else "D"
        ),
    }


# ---------------------------------------------------------------------------
# IDENTITY LAYERS — epistemic profile, values, relational context
# ---------------------------------------------------------------------------

@app.get("/identity")
async def get_identity(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return all identity layers for the owner's clone."""

    row = await session.execute(
        sql_text("""
            SELECT clone_id, style_fingerprint, value_system,
                   epistemic_profile, admin_policies,
                   COALESCE(relational_profile, '{}') AS relational_profile,
                   is_preserved, legal_hold_until,
                   retention_days_episodic, retention_days_traces
            FROM clone_identity WHERE user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="No clone found")

    return {
        "clone_id": str(rec["clone_id"]),
        "style_fingerprint": rec["style_fingerprint"] or {},
        "value_system": rec["value_system"] or {},
        "epistemic_profile": rec["epistemic_profile"] or {},
        "relational_profile": rec["relational_profile"] or {},
        "admin_policies": rec["admin_policies"] or {},
        "is_preserved": bool(rec["is_preserved"]),
        "legal_hold_until": rec["legal_hold_until"].isoformat() if rec["legal_hold_until"] else None,
        "retention_days_episodic": rec["retention_days_episodic"] or 730,
        "retention_days_traces": rec["retention_days_traces"] or 365,
    }


class PatchIdentityRequest(BaseModel):
    user_id: str
    layer: str  # style_fingerprint | value_system | epistemic_profile
    data: dict


@app.patch("/identity")
async def patch_identity(
    body: PatchIdentityRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Partial-update one identity layer (merges with existing)."""

    allowed = {"style_fingerprint", "value_system", "epistemic_profile", "relational_profile"}
    if body.layer not in allowed:
        raise HTTPException(status_code=422, detail=f"layer must be one of: {allowed}")

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="No clone found")

    await session.execute(
        sql_text(f"""
            UPDATE clone_identity
            SET {body.layer} = {body.layer} || CAST(:data AS jsonb),
                updated_at = NOW()
            WHERE clone_id = :cid
        """),
        {"data": json.dumps(body.data), "cid": str(rec["clone_id"])},
    )
    await session.commit()
    return {"status": "updated", "layer": body.layer}


class PatchAdminPoliciesRequest(BaseModel):
    user_id: str
    policies: dict


@app.patch("/identity/policies")
async def patch_admin_policies(
    body: PatchAdminPoliciesRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Update admin policies (topic blocks, escalation threshold, etc.)."""

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="No clone found")

    await session.execute(
        sql_text("""
            UPDATE clone_identity
            SET admin_policies = admin_policies || CAST(:data AS jsonb),
                updated_at = NOW()
            WHERE clone_id = :cid
        """),
        {"data": json.dumps(body.policies), "cid": str(rec["clone_id"])},
    )
    await session.commit()
    return {"status": "updated"}


# ---------------------------------------------------------------------------
# SLACK INTEGRATION
# OAuth install flow + app_mention event handler.
# ---------------------------------------------------------------------------

@app.get("/ingestion/status")
async def ingestion_connector_status(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return which OAuth connectors are connected for a clone."""
    rows = await session.execute(
        sql_text("SELECT provider, created_at FROM oauth_tokens WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    connected: dict[str, dict] = {}
    for r in rows.mappings():
        connected[r["provider"]] = {"connected_at": r["created_at"].isoformat() if r["created_at"] else None}
    return {
        "gmail": {"connected": "gmail" in connected, **connected.get("gmail", {})},
        "github": {"connected": "github" in connected, **connected.get("github", {})},
        "notion": {"connected": "notion" in connected, **connected.get("notion", {})},
    }


@app.get("/slack/install-url")
async def slack_install_url(
    clone_id: str = Query(...),
) -> dict:
    """Return the Slack OAuth install URL for this clone."""
    if not get_slack_client_id():
        raise HTTPException(status_code=503, detail="Slack not configured — set SLACK_CLIENT_ID in .env")

    scopes = "app_mentions:read,chat:write,channels:history"
    state = clone_id  # pass clone_id through OAuth state
    url = (
        f"https://slack.com/oauth/v2/authorize"
        f"?client_id={get_slack_client_id()}"
        f"&scope={scopes}"
        f"&redirect_uri={settings.slack_redirect_uri}"
        f"&state={state}"
    )
    return {"url": url}


@app.get("/slack/callback")
async def slack_callback(
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """Handle Slack OAuth callback. Exchange code for bot token and store it."""

    if not get_slack_client_secret():
        raise HTTPException(status_code=503, detail="Slack not configured")

    clone_id = state

    # Exchange code for token
    async with _httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={
                "client_id": get_slack_client_id(),
                "client_secret": get_slack_client_secret(),
                "code": code,
                "redirect_uri": settings.slack_redirect_uri,
            },
        )
    data = resp.json()
    if not data.get("ok"):
        raise HTTPException(status_code=400, detail=f"Slack OAuth error: {data.get('error')}")

    team_id = data["team"]["id"]
    team_name = data["team"]["name"]
    bot_token = data["access_token"]
    bot_user_id = data["bot_user_id"]

    await session.execute(
        sql_text("""
            INSERT INTO slack_installations
                (clone_id, team_id, team_name, bot_token, bot_user_id)
            VALUES (:cid, :team_id, :team_name, :token, :bot_uid)
            ON CONFLICT (team_id, clone_id) DO UPDATE
            SET bot_token = EXCLUDED.bot_token,
                bot_user_id = EXCLUDED.bot_user_id,
                team_name = EXCLUDED.team_name,
                installed_at = NOW()
        """),
        {
            "cid": clone_id,
            "team_id": team_id,
            "team_name": team_name,
            "token": encrypt_field(bot_token),
            "bot_uid": bot_user_id,
        },
    )
    await session.commit()

    # Redirect to the dashboard with success flag
    return RedirectResponse(url="/dashboard/settings?slack_connected=1")


@app.get("/slack/status")
async def slack_status(
    clone_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Check if this clone has a Slack workspace connected."""

    row = await session.execute(
        sql_text("""
            SELECT team_id, team_name, bot_user_id, installed_at
            FROM slack_installations
            WHERE clone_id = :cid
            ORDER BY installed_at DESC
            LIMIT 1
        """),
        {"cid": clone_id},
    )
    rec = row.mappings().first()
    if not rec:
        return {"connected": False}

    return {
        "connected": True,
        "team_id": rec["team_id"],
        "team_name": rec["team_name"],
        "bot_user_id": rec["bot_user_id"],
        "installed_at": rec["installed_at"].isoformat() if rec["installed_at"] else None,
    }


@app.post("/slack/events")
async def slack_events(
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """
    Handle Slack events API webhooks.
    Supports: url_verification challenge, app_mention events.
    """
    import hashlib as _hs
    import hmac as _hm
    import time as _tm

    body_bytes = await request.body()

    # Verify Slack signature
    if settings.slack_signing_secret:
        timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
        if abs(_tm.time() - int(timestamp or 0)) > 300:
            raise HTTPException(status_code=403, detail="Request too old")
        sig_base = f"v0:{timestamp}:{body_bytes.decode()}"
        expected = "v0=" + _hm.new(
            settings.slack_signing_secret.encode(),
            sig_base.encode(),
            _hs.sha256,
        ).hexdigest()
        received = request.headers.get("X-Slack-Signature", "")
        if not _hm.compare_digest(expected, received):
            raise HTTPException(status_code=403, detail="Invalid signature")

    payload = json.loads(body_bytes)

    # URL verification handshake
    if payload.get("type") == "url_verification":
        return {"challenge": payload["challenge"]}

    event = payload.get("event", {})
    event_type = event.get("type")

    if event_type == "app_mention":
        # Find installation for this workspace
        team_id = payload.get("team_id") or payload.get("authorizations", [{}])[0].get("team_id", "")
        row = await session.execute(
            sql_text("""
                SELECT si.clone_id, si.bot_token, si.bot_user_id, ci.display_name
                FROM slack_installations si
                JOIN clone_identity ci ON ci.clone_id = si.clone_id
                WHERE si.team_id = :team_id
                LIMIT 1
            """),
            {"team_id": team_id},
        )
        rec = row.mappings().first()
        if not rec:
            return {"ok": True}

        # Strip the bot mention from the text
        text = event.get("text", "")
        bot_uid = rec["bot_user_id"]
        clean_text = text.replace(f"<@{bot_uid}>", "").strip()
        if not clean_text:
            return {"ok": True}

        channel = event.get("channel")
        thread_ts = event.get("thread_ts") or event.get("ts")

        background_tasks.add_task(
            _respond_in_slack,
            clone_id=str(rec["clone_id"]),
            display_name=rec["display_name"],
            bot_token=decrypt_field(rec["bot_token"]) or "",
            channel=channel,
            thread_ts=thread_ts,
            message=clean_text,
            session_factory=AsyncSessionLocal,
        )

    return {"ok": True}


async def _respond_in_slack(
    clone_id: str,
    display_name: str,
    bot_token: str,
    channel: str,
    thread_ts: str,
    message: str,
    session_factory,
) -> None:
    """Background: query the brain and post a Slack reply with confidence + sources."""
    try:
        # Fetch recent channel history for context (best-effort)
        thread_context: list[str] = []
        try:
            async with _httpx.AsyncClient(timeout=10) as hx:
                hist_resp = await hx.get(
                    "https://slack.com/api/conversations.history",
                    headers={"Authorization": f"Bearer {bot_token}"},
                    params={"channel": channel, "limit": 10},
                )
                if hist_resp.status_code == 200:
                    hist_data = hist_resp.json()
                    for msg in reversed(hist_data.get("messages", [])):
                        text_val = msg.get("text", "").strip()
                        if text_val and msg.get("ts") != thread_ts:
                            thread_context.append(text_val)
        except Exception:
            pass

        async with session_factory() as db:
            _clone_uuid = UUID(clone_id)
            await load_clone_keys(db, _clone_uuid)
            brain = DoppelBrain(clone_id=_clone_uuid, session=db)
            meta: dict = {}
            if thread_context:
                meta["thread_context"] = thread_context[-10:]
            brain_input = BrainInput(
                clone_id=_clone_uuid,
                message=message,
                context_type="chat",
                metadata=meta if meta else None,
            )
            result: BrainOutput = await brain.process(brain_input)

        conf = result.confidence
        if conf >= 0.8:
            conf_label = "🟢 High confidence"
        elif conf >= 0.6:
            conf_label = "🟡 Moderate confidence"
        else:
            conf_label = "🔴 Low confidence — may need review"

        # Build Slack Block Kit blocks
        blocks = [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": result.response},
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"{conf_label} · {round(conf * 100)}% · via *{display_name}'s Doppel*",
                    }
                ],
            },
        ]

        # Add top sources if available
        if result.sources:
            source_lines = []
            for s in result.sources[:2]:
                snippet = s.content[:80].replace("\n", " ")
                pct = round(s.similarity * 100)
                source_lines.append(f"• {snippet}… ({pct}% match, {s.source})")
            if source_lines:
                blocks.append({
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": "_Sources:_\n" + "\n".join(source_lines),
                        }
                    ],
                })

        async with _httpx.AsyncClient(timeout=15) as client:
            await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {bot_token}", "Content-Type": "application/json"},
                json={
                    "channel": channel,
                    "thread_ts": thread_ts,
                    "blocks": blocks,
                    "text": result.response,  # fallback for notifications
                },
            )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Slack respond error: %s", exc)


# ---------------------------------------------------------------------------
# Proposals — code reviews, calendar actions, onboarding feedback
# ---------------------------------------------------------------------------

class CreateProposalRequest(BaseModel):
    clone_id: UUID
    proposal_type: str   # 'code_review' | 'calendar' | 'onboarding' | 'other'
    title: str
    content: str
    context: dict = {}
    confidence: float | None = None


class ReviewProposalRequest(BaseModel):
    status: str          # 'approved' | 'edited' | 'rejected'
    edited_content: str | None = None


@app.get("/proposals")
async def list_proposals(
    clone_id: UUID = Query(...),
    status: str | None = Query(default=None),
    proposal_type: str | None = Query(default=None),
    limit: int = Query(default=30, le=100),
    session: AsyncSession = Depends(get_session),
) -> dict:
    where_parts = ["clone_id = :cid"]
    params: dict = {"cid": str(clone_id), "limit": limit}
    if status:
        where_parts.append("status = :status")
        params["status"] = status
    if proposal_type:
        where_parts.append("proposal_type = :ptype")
        params["ptype"] = proposal_type
    where = " AND ".join(where_parts)

    rows = await session.execute(
        sql_text(f"""
            SELECT id, proposal_type, status, title, content, context,
                   edited_content, confidence, executed_at, reviewed_at, created_at
            FROM proposals WHERE {where}
            ORDER BY created_at DESC LIMIT :limit
        """),
        params,
    )
    items = [dict(r) for r in rows.mappings()]
    for item in items:
        for k in ("id", "executed_at", "reviewed_at", "created_at"):
            if item.get(k) is not None:
                item[k] = str(item[k])
    return {"proposals": items, "total": len(items)}


@app.post("/proposals", status_code=201)
async def create_proposal(
    body: CreateProposalRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    import json as _json
    row = await session.execute(
        sql_text("""
            INSERT INTO proposals (clone_id, proposal_type, title, content, context, confidence)
            VALUES (:cid, :ptype, :title, :content, :ctx, :conf)
            RETURNING id
        """),
        {
            "cid": str(body.clone_id),
            "ptype": body.proposal_type,
            "title": body.title,
            "content": body.content,
            "ctx": _json.dumps(body.context),
            "conf": body.confidence,
        },
    )
    proposal_id = str(row.scalar())
    await session.commit()
    return {"proposal_id": proposal_id}


@app.patch("/proposals/{proposal_id}")
async def review_proposal(
    proposal_id: UUID,
    body: ReviewProposalRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.status not in ("approved", "edited", "rejected"):
        raise HTTPException(status_code=400, detail="status must be approved | edited | rejected")
    await session.execute(
        sql_text("""
            UPDATE proposals
            SET status = :status,
                edited_content = :edited,
                reviewed_at = now()
            WHERE id = :id
        """),
        {"id": str(proposal_id), "status": body.status, "edited": body.edited_content},
    )
    await session.commit()
    return {"status": body.status}


class CodeReviewRequest(BaseModel):
    clone_id: UUID


@app.post("/proposals/generate-code-review", status_code=202)
async def generate_code_review_proposals(
    body: CodeReviewRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Fetch open GitHub PRs and generate a review proposal for each."""
    background_tasks.add_task(_run_code_review_proposals, clone_id=body.clone_id)
    return {"status": "queued"}


async def _run_code_review_proposals(clone_id: UUID) -> None:
    import json as _json
    from doppel.brain.db.connection import AsyncSessionLocal
    from doppel.ingestion.connectors.github import get_access_token

    async with AsyncSessionLocal() as db:
        await load_clone_keys(db, clone_id)
        token = await get_access_token(db, clone_id)
        if not token:
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        import httpx as _httpx_local
        async with _httpx_local.AsyncClient(timeout=20, headers=headers) as client:
            # Get authenticated user
            me = (await client.get("https://api.github.com/user")).json()
            username = me.get("login", "")

            # Get repos
            repos_resp = await client.get(
                "https://api.github.com/user/repos",
                params={"affiliation": "owner,collaborator", "per_page": 30, "sort": "pushed"},
            )
            if repos_resp.status_code != 200:
                return
            repos = [r["full_name"] for r in repos_resp.json() if not r.get("archived")]

            for repo in repos[:10]:
                try:
                    prs_resp = await client.get(
                        f"https://api.github.com/repos/{repo}/pulls",
                        params={"state": "open", "per_page": 5},
                    )
                    if prs_resp.status_code != 200:
                        continue
                    for pr in prs_resp.json():
                        if pr.get("user", {}).get("login") == username:
                            continue  # skip own PRs
                        title = pr.get("title", "")
                        body_text = (pr.get("body") or "").strip()[:1200]
                        pr_number = pr.get("number")
                        pr_url = pr.get("html_url", "")

                        # Brain generates review
                        brain = DoppelBrain(clone_id=clone_id, session=db)
                        prompt = (
                            f"You are reviewing a pull request in {repo}.\n"
                            f"PR #{pr_number}: {title}\n"
                            f"{('Description: ' + body_text) if body_text else ''}\n\n"
                            f"Write a concise code review comment: what looks good, "
                            f"what to check, and whether you'd approve, request changes, or comment."
                        )
                        result = await brain.process(BrainInput(
                            clone_id=clone_id,
                            message=prompt,
                            context_type="document",
                        ))

                        import json as _j
                        await db.execute(
                            sql_text("""
                                INSERT INTO proposals
                                  (clone_id, proposal_type, title, content, context, confidence)
                                VALUES (:cid, 'code_review', :title, :content, :ctx, :conf)
                                ON CONFLICT DO NOTHING
                            """),
                            {
                                "cid": str(clone_id),
                                "title": f"Review PR #{pr_number}: {title[:80]}",
                                "content": result.response,
                                "ctx": _j.dumps({"repo": repo, "pr": pr_number, "url": pr_url, "pr_title": title}),
                                "conf": result.confidence,
                            },
                        )
                except Exception:
                    continue

        await db.commit()


class CalendarProposalRequest(BaseModel):
    clone_id: UUID
    meeting_title: str
    meeting_time: str   # e.g. "Tomorrow 2pm"
    attendees: str = ""
    description: str = ""


@app.post("/proposals/generate-calendar", status_code=201)
async def generate_calendar_proposal(
    body: CalendarProposalRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Clone proposes whether to accept, decline, or reschedule a meeting."""
    import json as _json
    await load_clone_keys(session, body.clone_id)
    brain = DoppelBrain(clone_id=body.clone_id, session=session)
    prompt = (
        f"You have a meeting invite: '{body.meeting_title}' at {body.meeting_time}."
        + (f" Attendees: {body.attendees}." if body.attendees else "")
        + (f" Description: {body.description}" if body.description else "")
        + "\n\nPropose one action: Accept, Decline, or Reschedule — and give a one-sentence reason why."
    )
    result = await brain.process(BrainInput(
        clone_id=body.clone_id, message=prompt, context_type="decision",
    ))
    row = await session.execute(
        sql_text("""
            INSERT INTO proposals (clone_id, proposal_type, title, content, context, confidence)
            VALUES (:cid, 'calendar', :title, :content, :ctx, :conf)
            RETURNING id
        """),
        {
            "cid": str(body.clone_id),
            "title": f"Calendar: {body.meeting_title}",
            "content": result.response,
            "ctx": _json.dumps({"meeting_time": body.meeting_time, "attendees": body.attendees}),
            "conf": result.confidence,
        },
    )
    proposal_id = str(row.scalar())
    await session.commit()
    return {"proposal_id": proposal_id, "content": result.response}


# ---------------------------------------------------------------------------
# Impact metrics
# ---------------------------------------------------------------------------

@app.get("/brain/impact")
async def get_impact_metrics(
    clone_id: UUID = Query(...),
    days: int = Query(default=30, le=365),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Compute impact metrics for a clone over the last N days.
    Derives: queries answered, emails approved, hours saved, decisions offloaded.
    """
    since = f"now() - interval '{days} days'"

    # Queries answered
    q_total = (await session.execute(
        sql_text(f"SELECT COUNT(*) FROM reasoning_traces WHERE clone_id = :cid AND created_at > {since}"),
        {"cid": str(clone_id)},
    )).scalar() or 0

    # High-confidence (decisions offloaded = clone answered without escalation)
    q_decided = (await session.execute(
        sql_text(f"""
            SELECT COUNT(*) FROM reasoning_traces
            WHERE clone_id = :cid AND created_at > {since}
            AND needs_escalation = FALSE AND confidence >= 0.65
        """),
        {"cid": str(clone_id)},
    )).scalar() or 0

    # Emails approved/edited (acted on)
    emails_actioned = (await session.execute(
        sql_text(f"""
            SELECT COUNT(*) FROM email_drafts
            WHERE clone_id = :cid AND created_at > {since}
            AND status IN ('approved', 'edited')
        """),
        {"cid": str(clone_id)},
    )).scalar() or 0

    # Proposals approved/edited
    proposals_actioned = (await session.execute(
        sql_text(f"""
            SELECT COUNT(*) FROM proposals
            WHERE clone_id = :cid AND created_at > {since}
            AND status IN ('approved', 'edited')
        """),
        {"cid": str(clone_id)},
    )).scalar() or 0

    # Active days (days with at least one query)
    active_days = (await session.execute(
        sql_text(f"""
            SELECT COUNT(DISTINCT DATE(created_at)) FROM reasoning_traces
            WHERE clone_id = :cid AND created_at > {since}
        """),
        {"cid": str(clone_id)},
    )).scalar() or 0

    # Memory size
    memory_chunks = (await session.execute(
        sql_text("SELECT COUNT(*) FROM episodic_memory WHERE clone_id = :cid AND is_excluded = FALSE"),
        {"cid": str(clone_id)},
    )).scalar() or 0

    # Hours saved: 5 min per query + 15 min per email actioned + 10 min per proposal
    minutes_saved = (q_total * 5) + (emails_actioned * 15) + (proposals_actioned * 10)
    hours_saved = round(minutes_saved / 60, 1)

    return {
        "days": days,
        "queries_answered": int(q_total),
        "decisions_offloaded": int(q_decided),
        "emails_actioned": int(emails_actioned),
        "proposals_actioned": int(proposals_actioned),
        "active_days": int(active_days),
        "memory_chunks": int(memory_chunks),
        "hours_saved": hours_saved,
        "minutes_saved": int(minutes_saved),
    }


# ===========================================================================
# PHASE 3 — COMPANY BRAIN: Role Brains
# ===========================================================================

class CreateRoleBrainRequest(BaseModel):
    org_id: UUID
    role_name: str
    description: str = ""
    member_clone_ids: list[UUID] = []


@app.post("/org/roles", status_code=201)
async def create_role_brain(
    body: CreateRoleBrainRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Create or update a role brain for an org (e.g. 'support_lead', 'incident_commander')."""
    # Embed array literal directly — asyncpg mis-infers CAST(:param AS uuid[]) as
    # a native array binding in INSERT VALUES context, expecting a Python list.
    # UUIDs are Pydantic-validated so there's no injection risk.
    ids_literal = "{" + ",".join(str(c) for c in body.member_clone_ids) + "}"
    try:
        result = await session.execute(
            sql_text(f"""
                INSERT INTO role_brains (org_id, role_name, description, member_clone_ids)
                VALUES (:org_id, :role_name, :description, '{ids_literal}'::uuid[])
                ON CONFLICT (org_id, role_name) DO UPDATE
                  SET description = EXCLUDED.description,
                      member_clone_ids = EXCLUDED.member_clone_ids
                RETURNING id, org_id, role_name, description,
                          COALESCE(freshness_score, 1.0) AS freshness_score, created_at
            """),
            {
                "org_id": str(body.org_id),
                "role_name": body.role_name,
                "description": body.description,
            },
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=422, detail="Org not found — make sure you're in a team workspace")
        await session.commit()
    except HTTPException:
        raise
    except Exception as e:
        _log.error("create_role_brain failed org_id=%s: %s", body.org_id, e, exc_info=True)
        if "foreign key" in str(e).lower() or "violates" in str(e).lower():
            raise HTTPException(status_code=422, detail="Org not found — make sure you're in a team workspace")
        if "role_brains" in str(e).lower() and "does not exist" in str(e).lower():
            raise HTTPException(status_code=503, detail="Database migration pending — restart the backend to apply schema changes")
        raise HTTPException(status_code=500, detail="Internal server error")
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "role_name": row["role_name"],
        "description": row["description"] or "",
        "freshness_score": float(row["freshness_score"]),
        "created_at": row["created_at"].isoformat(),
    }


@app.get("/org/roles")
async def list_role_brains(
    org_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """List all role brains for an org with freshness scores and skill counts."""
    result = await session.execute(
        sql_text("""
            SELECT rb.id, rb.role_name, rb.description, rb.member_clone_ids,
                   rb.freshness_score, rb.last_extracted_at, rb.created_at,
                   rb.knowledge_summary,
                   (SELECT COUNT(*) FROM org_skills os WHERE os.role_brain_id = rb.id) AS skill_count
            FROM role_brains rb
            WHERE rb.org_id = :org_id
            ORDER BY rb.created_at DESC
        """),
        {"org_id": str(org_id)},
    )
    rows = result.mappings().all()

    # Fetch member names separately
    output = []
    for r in rows:
        member_ids = list(r["member_clone_ids"] or [])
        member_names: list[str] = []
        if member_ids:
            ids_lit = "{" + ",".join(str(c) for c in member_ids) + "}"
            names_result = await session.execute(
                sql_text(f"""
                    SELECT display_name FROM clone_identity
                    WHERE clone_id = ANY('{ids_lit}'::uuid[])
                    ORDER BY display_name
                """),
            )
            member_names = [row[0] for row in names_result.fetchall()]

        ks = r["knowledge_summary"]
        output.append({
            "id": str(r["id"]),
            "role_name": r["role_name"],
            "description": r["description"] or "",
            "member_clone_ids": [str(c) for c in member_ids],
            "member_names": member_names,
            "member_count": len(member_ids),
            "freshness_score": float(r["freshness_score"] or 0),
            "last_extracted_at": r["last_extracted_at"].isoformat() if r["last_extracted_at"] else None,
            "skill_count": int(r["skill_count"] or 0),
            "has_knowledge": bool(ks and ks != {}),
            "knowledge_summary": ks if (ks and ks != {}) else None,
            "created_at": r["created_at"].isoformat(),
        })
    return output


@app.get("/org/roles/{role_id}")
async def get_role_brain(
    role_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get full role brain knowledge summary."""
    row = (await session.execute(
        sql_text("""
            SELECT rb.*, o.name AS org_name
            FROM role_brains rb
            JOIN orgs o ON o.id = rb.org_id
            WHERE rb.id = :id
        """),
        {"id": str(role_id)},
    )).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Role brain not found")

    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "org_name": row["org_name"],
        "role_name": row["role_name"],
        "description": row["description"] or "",
        "member_clone_ids": [str(c) for c in (row["member_clone_ids"] or [])],
        "knowledge_summary": row["knowledge_summary"] or {},
        "freshness_score": float(row["freshness_score"] or 0),
        "last_extracted_at": row["last_extracted_at"].isoformat() if row["last_extracted_at"] else None,
        "created_at": row["created_at"].isoformat(),
    }


@app.patch("/org/roles/{role_id}/members")
async def update_role_members(
    role_id: UUID,
    body: dict,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Update the member clones for a role brain."""
    member_ids = body.get("member_clone_ids", [])
    ids_literal = "{" + ",".join(str(c) for c in member_ids) + "}"
    await session.execute(
        sql_text(f"""
            UPDATE role_brains
            SET member_clone_ids = '{ids_literal}'::uuid[], updated_at = NOW()
            WHERE id = :id
        """),
        {"id": str(role_id)},
    )
    await session.commit()
    return {"status": "updated", "member_count": len(member_ids)}


@app.post("/org/roles/{role_id}/extract")
async def extract_role_brain_route(
    role_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Trigger knowledge extraction for a role brain.
    Aggregates memories from all member clones → structured knowledge + skills.
    """
    row = (await session.execute(
        sql_text("""
            SELECT rb.*, o.name AS org_name
            FROM role_brains rb JOIN orgs o ON o.id = rb.org_id
            WHERE rb.id = :id
        """),
        {"id": str(role_id)},
    )).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Role brain not found")

    member_ids = list(row["member_clone_ids"] or [])
    if member_ids:
        await load_clone_keys(session, member_ids[0])

    try:
        knowledge = await extract_role_knowledge(
            session=session,
            org_id=row["org_id"],
            role_brain_id=role_id,
            role_name=row["role_name"],
            member_clone_ids=member_ids,
        )
    except Exception as e:
        _log.error("extract_role_knowledge failed role_id=%s: %s", role_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Knowledge extraction failed — check your Anthropic API key is configured")

    if knowledge.get("error"):
        raise HTTPException(status_code=422, detail=knowledge["error"])

    skills_error: str | None = None
    try:
        skills = await extract_skills_from_role(
            session=session,
            org_id=row["org_id"],
            role_brain_id=role_id,
            role_name=row["role_name"],
            org_name=row["org_name"],
            knowledge_summary=knowledge,
        )
    except Exception as e:
        _log.error("extract_skills_from_role failed role_id=%s: %s", role_id, e, exc_info=True)
        skills = []
        skills_error = str(e)

    knowledge_keys = [k for k, v in knowledge.items() if v]
    _log.info(
        "extract result role_id=%s: knowledge_keys=%s parse_error=%s skills=%d error=%s",
        role_id, knowledge_keys, knowledge.get("parse_error"), len(skills), skills_error,
    )

    return {
        "status": "extracted",
        "role_name": row["role_name"],
        "procedures_found": len(knowledge.get("decision_procedures") or []),
        "skills_extracted": len(skills),
        "knowledge_keys": knowledge_keys,
        "parse_error": knowledge.get("parse_error", False),
        "skills_error": skills_error,
    }


@app.patch("/org/roles/{role_id}")
async def rename_role_brain(
    role_id: UUID,
    body: dict,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Rename a role brain."""
    new_name = (body.get("role_name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="role_name is required")
    await session.execute(
        sql_text("UPDATE role_brains SET role_name = :name WHERE id = :id"),
        {"name": new_name, "id": str(role_id)},
    )
    await session.commit()
    return {"id": str(role_id), "role_name": new_name}


@app.delete("/org/roles/{role_id}", status_code=204)
async def delete_role_brain(
    role_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a role brain and its associated skills."""
    await session.execute(
        sql_text("DELETE FROM role_brains WHERE id = :id"),
        {"id": str(role_id)},
    )
    await session.commit()


# ===========================================================================
# PHASE 4 — SKILLS API: Agent Integration
# ===========================================================================

@app.get("/v1/org/{org_id}/skills")
async def list_org_skills(
    org_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    List all executable skills for an organization.
    Primary endpoint for AI agents to discover what this company knows how to do.
    """
    result = await session.execute(
        sql_text("""
            SELECT os.id, os.skill_name, os.trigger_context, os.inputs_required,
                   os.confidence, os.source_count, os.last_verified_at, os.created_at,
                   rb.role_name
            FROM org_skills os
            LEFT JOIN role_brains rb ON rb.id = os.role_brain_id
            WHERE os.org_id = :org_id
            ORDER BY os.confidence DESC, os.created_at DESC
        """),
        {"org_id": str(org_id)},
    )
    skills = result.mappings().all()

    return {
        "org_id": str(org_id),
        "skill_count": len(skills),
        "skills": [
            {
                "id": str(s["id"]),
                "skill_name": s["skill_name"],
                "role": s["role_name"],
                "trigger_context": list(s["trigger_context"] or []),
                "inputs_required": list(s["inputs_required"] or []),
                "confidence": float(s["confidence"]),
                "source_count": int(s["source_count"]),
                "last_verified_at": s["last_verified_at"].isoformat() if s["last_verified_at"] else None,
            }
            for s in skills
        ],
    }


@app.get("/v1/org/{org_id}/skills/{skill_id}")
async def get_skill(
    org_id: UUID,
    skill_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get full skill definition including decision procedure."""
    row = (await session.execute(
        sql_text("""
            SELECT os.*, rb.role_name
            FROM org_skills os
            LEFT JOIN role_brains rb ON rb.id = os.role_brain_id
            WHERE os.id = :skill_id AND os.org_id = :org_id
        """),
        {"skill_id": str(skill_id), "org_id": str(org_id)},
    )).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Skill not found")

    return {
        "id": str(row["id"]),
        "org_id": str(org_id),
        "skill_name": row["skill_name"],
        "role": row["role_name"],
        "trigger_context": list(row["trigger_context"] or []),
        "inputs_required": list(row["inputs_required"] or []),
        "procedure": row["procedure"] or {},
        "confidence": float(row["confidence"]),
        "source_count": int(row["source_count"]),
        "last_verified_at": row["last_verified_at"].isoformat() if row["last_verified_at"] else None,
        "created_at": row["created_at"].isoformat(),
    }


class AgentQueryRequest(BaseModel):
    situation: str
    context: dict = {}


@app.post("/v1/org/{org_id}/query")
async def agent_query(
    org_id: UUID,
    body: AgentQueryRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Core agent query endpoint. Given a situation, finds the best matching skill
    and returns a concrete, procedure-grounded recommendation.
    AI agents call this before taking action to get company-specific guidance.
    """
    clone_row = (await session.execute(
        sql_text("""
            SELECT om.clone_id FROM org_memberships om
            WHERE om.org_id = :org_id AND om.clone_id IS NOT NULL LIMIT 1
        """),
        {"org_id": str(org_id)},
    )).mappings().first()
    if clone_row and clone_row["clone_id"]:
        await load_clone_keys(session, clone_row["clone_id"])

    result = await query_skills(
        session=session,
        org_id=org_id,
        situation=body.situation,
        context=body.context,
    )

    skill_id = result.get("skill_id")
    await session.execute(
        sql_text("""
            INSERT INTO agent_queries
              (org_id, skill_id, situation, context, response, confidence, escalated, latency_ms)
            VALUES
              (:org_id, :skill_id, :situation, CAST(:context AS jsonb),
               CAST(:response AS jsonb), :confidence, :escalated, :latency_ms)
        """),
        {
            "org_id": str(org_id),
            "skill_id": skill_id,
            "situation": body.situation,
            "context": json.dumps(body.context),
            "response": json.dumps(result),
            "confidence": result.get("confidence", 0.0),
            "escalated": result.get("escalate", False),
            "latency_ms": result.get("latency_ms", 0),
        },
    )
    await session.commit()
    return result


class ValidateActionRequest(BaseModel):
    proposed_action: str
    context: dict = {}


@app.post("/v1/org/{org_id}/validate")
async def validate_agent_action(
    org_id: UUID,
    body: ValidateActionRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Pre-flight check: is this proposed action consistent with company procedure?"""
    clone_row = (await session.execute(
        sql_text("""
            SELECT om.clone_id FROM org_memberships om
            WHERE om.org_id = :org_id AND om.clone_id IS NOT NULL LIMIT 1
        """),
        {"org_id": str(org_id)},
    )).mappings().first()
    if clone_row and clone_row["clone_id"]:
        await load_clone_keys(session, clone_row["clone_id"])

    return await validate_action(
        session=session,
        org_id=org_id,
        proposed_action=body.proposed_action,
        context=body.context,
    )


@app.get("/v1/org/{org_id}/skills.openapi.json")
async def skills_openapi_spec(
    org_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Export skills as an OpenAPI tool spec for LLM function calling.
    Drop into LangChain, Anthropic tool_use, or OpenAI function calling.
    """
    result = await session.execute(
        sql_text("""
            SELECT id, skill_name, trigger_context, inputs_required, confidence
            FROM org_skills WHERE org_id = :org_id ORDER BY confidence DESC
        """),
        {"org_id": str(org_id)},
    )
    skills = result.mappings().all()

    org_row = (await session.execute(
        sql_text("SELECT name FROM orgs WHERE id = :id"),
        {"id": str(org_id)},
    )).mappings().first()
    org_name = org_row["name"] if org_row else str(org_id)

    tools = [
        {
            "name": "query_company_brain",
            "description": (
                f"Query the {org_name} company brain before taking action. "
                "Returns procedure-grounded recommendations based on how this company actually operates."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "situation": {"type": "string", "description": "Describe the situation"},
                    "context": {"type": "object", "description": "Relevant context variables"},
                },
                "required": ["situation"],
            },
        },
        {
            "name": "validate_action",
            "description": (
                "Check whether a proposed action is consistent with company procedure before executing."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "proposed_action": {"type": "string"},
                    "context": {"type": "object"},
                },
                "required": ["proposed_action"],
            },
        },
    ] + [
        {
            "name": f"skill__{s['skill_name']}",
            "description": (
                f"Apply the '{s['skill_name'].replace('_', ' ')}' procedure. "
                f"Confidence: {s['confidence']:.0%}."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    k: {"type": "string"} for k in (s["inputs_required"] or [])
                },
                "required": list(s["inputs_required"] or []),
            },
        }
        for s in skills
    ]

    return {
        "org_id": str(org_id),
        "org_name": org_name,
        "tools": tools,
        "usage": {
            "anthropic": "Pass tools array to anthropic.messages.create(tools=...)",
            "openai": "Adapt input_schema to parameters.properties format",
            "langchain": "Use from_openai_tools([tool]) for each tool",
        },
    }


@app.get("/v1/org/{org_id}/agent-queries")
async def list_agent_queries(
    org_id: UUID,
    limit: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Audit log of all agent queries to this org's company brain."""
    result = await session.execute(
        sql_text("""
            SELECT aq.id, aq.situation, aq.confidence, aq.escalated,
                   aq.latency_ms, aq.created_at, os.skill_name
            FROM agent_queries aq
            LEFT JOIN org_skills os ON os.id = aq.skill_id
            WHERE aq.org_id = :org_id
            ORDER BY aq.created_at DESC
            LIMIT :limit
        """),
        {"org_id": str(org_id), "limit": limit},
    )
    rows = result.mappings().all()
    return {
        "org_id": str(org_id),
        "queries": [
            {
                "id": str(r["id"]),
                "situation": r["situation"],
                "skill_applied": r["skill_name"],
                "confidence": float(r["confidence"] or 0),
                "escalated": bool(r["escalated"]),
                "latency_ms": r["latency_ms"],
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
    }


# ===========================================================================
# BLOCK 5 — Enterprise Features
# ===========================================================================


# ---------------------------------------------------------------------------
# 5.1  Data Retention Policies
# ---------------------------------------------------------------------------

class RetentionSettingsRequest(BaseModel):
    user_id: str
    retention_days_episodic: int = 730
    retention_days_traces: int = 365


@app.patch("/admin/clones/{handle}/retention")
async def update_retention_settings(
    handle: str,
    body: RetentionSettingsRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Set data retention periods for episodic memory and reasoning traces."""
    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    if rec["user_id"] != body.user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    await session.execute(
        sql_text("""
            UPDATE clone_identity
            SET retention_days_episodic = :episodic, retention_days_traces = :traces
            WHERE handle = :h
        """),
        {"episodic": body.retention_days_episodic, "traces": body.retention_days_traces, "h": handle},
    )
    await session.commit()
    return {"status": "updated"}


@app.post("/admin/clones/{handle}/run-retention")
async def run_retention(
    handle: str,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete episodic memories and traces older than the configured retention windows."""
    row = await session.execute(
        sql_text("""
            SELECT clone_id, user_id,
                   retention_days_episodic, retention_days_traces,
                   is_preserved, legal_hold_until
            FROM clone_identity WHERE handle = :h
        """),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    if rec["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")
    if rec["is_preserved"]:
        raise HTTPException(status_code=409, detail="Clone is preserved — retention cannot run")
    hold = rec["legal_hold_until"]
    if hold and hold >= date.today():
        raise HTTPException(status_code=409, detail=f"Clone is under legal hold until {hold}")

    clone_id = str(rec["clone_id"])
    eps_days = rec["retention_days_episodic"] or 730
    trace_days = rec["retention_days_traces"] or 365

    del_eps = await session.execute(
        sql_text("""
            DELETE FROM episodic_memory
            WHERE clone_id = :id AND created_at < NOW() - MAKE_INTERVAL(days => :days)
        """),
        {"id": clone_id, "days": eps_days},
    )
    del_traces = await session.execute(
        sql_text("""
            DELETE FROM reasoning_traces
            WHERE clone_id = :id AND created_at < NOW() - MAKE_INTERVAL(days => :days)
        """),
        {"id": clone_id, "days": trace_days},
    )
    await session.commit()
    return {
        "status": "done",
        "deleted_episodic": del_eps.rowcount,
        "deleted_traces": del_traces.rowcount,
    }


# ---------------------------------------------------------------------------
# 5.2  Legal Hold + Clone Preservation
# ---------------------------------------------------------------------------

@app.post("/admin/clones/{handle}/preserve")
async def preserve_clone(
    handle: str,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Mark a clone as preserved (read-only). Blocks ingestion and data deletion."""
    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    await session.execute(
        sql_text("UPDATE clone_identity SET is_preserved = TRUE, preserved_at = NOW() WHERE handle = :h"),
        {"h": handle},
    )
    await session.commit()
    return {"status": "preserved"}


@app.post("/admin/clones/{handle}/unpreserve")
async def unpreserve_clone(
    handle: str,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")
    await session.execute(
        sql_text("UPDATE clone_identity SET is_preserved = FALSE, preserved_at = NULL WHERE handle = :h"),
        {"h": handle},
    )
    await session.commit()
    return {"status": "unpreserved"}


class LegalHoldRequest(BaseModel):
    user_id: str
    until: str  # ISO date string e.g. "2027-01-01"


@app.post("/admin/clones/{handle}/legal-hold")
async def set_legal_hold(
    handle: str,
    body: LegalHoldRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Set a legal hold that prevents deletion until the given date."""
    try:
        hold_date = date.fromisoformat(body.until)
    except ValueError:
        raise HTTPException(status_code=422, detail="'until' must be an ISO date (YYYY-MM-DD)")

    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != body.user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    await session.execute(
        sql_text("UPDATE clone_identity SET legal_hold_until = :d WHERE handle = :h"),
        {"d": hold_date, "h": handle},
    )
    await session.commit()
    return {"status": "hold_set", "until": body.until}


@app.delete("/admin/clones/{handle}/legal-hold")
async def clear_legal_hold(
    handle: str,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")
    await session.execute(
        sql_text("UPDATE clone_identity SET legal_hold_until = NULL WHERE handle = :h"),
        {"h": handle},
    )
    await session.commit()
    return {"status": "hold_cleared"}


def _guard_preserved(rec: dict, action: str = "modify") -> None:
    """Raise 409 if the clone is preserved or under legal hold."""
    if rec.get("is_preserved"):
        raise HTTPException(status_code=409, detail=f"Clone is preserved — cannot {action}")
    hold = rec.get("legal_hold_until")
    if hold and (isinstance(hold, date) and hold >= date.today()):
        raise HTTPException(status_code=409, detail=f"Clone is under legal hold until {hold} — cannot {action}")


# ---------------------------------------------------------------------------
# Feature C — Knowledge Handoff
# ---------------------------------------------------------------------------

@app.post("/clones/{handle}/capture-handoff", status_code=202)
async def capture_handoff(
    handle: str,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Trigger a knowledge handoff capture for a clone.
    Sets clone as preserved and generates a structured Knowledge Transfer Report.
    Auth: owner or org admin (enforced by Next.js proxy via X-User-Id header).
    """
    triggered_by = request.headers.get("X-User-Id")

    row = await session.execute(
        sql_text("SELECT clone_id, display_name FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Clone not found")
    clone_id = UUID(str(record["clone_id"]))

    # Mark as preserved immediately
    await session.execute(
        sql_text("""
            UPDATE clone_identity
            SET is_preserved = TRUE, preserved_at = COALESCE(preserved_at, NOW())
            WHERE clone_id = :cid
        """),
        {"cid": str(clone_id)},
    )

    # Upsert handoff_reports row
    await session.execute(
        sql_text("""
            INSERT INTO handoff_reports (clone_id, status, triggered_by)
            VALUES (:cid, 'generating', :tby)
            ON CONFLICT (clone_id) DO UPDATE
              SET status = 'generating', triggered_by = EXCLUDED.triggered_by,
                  generated_at = NULL, created_at = NOW()
        """),
        {"cid": str(clone_id), "tby": triggered_by},
    )
    await session.commit()

    background_tasks.add_task(_run_handoff_capture, clone_id, triggered_by)
    return {"status": "generating", "clone_id": str(clone_id)}


async def _run_handoff_capture(clone_id: UUID, triggered_by: str | None) -> None:
    """
    Background: run full ingestion sweep, then generate Knowledge Transfer Report via brain.
    """
    from doppel.brain.db.connection import AsyncSessionLocal
    import datetime as _dt

    async with AsyncSessionLocal() as session:
        try:
            # --- Step 1: full sweep ingestion ---
            # Gmail
            gmail_tok = (await session.execute(
                sql_text("SELECT 1 FROM oauth_tokens WHERE clone_id = :cid AND provider = 'gmail'"),
                {"cid": str(clone_id)},
            )).first()
            if gmail_tok:
                try:
                    row = await session.execute(
                        sql_text("SELECT display_name FROM clone_identity WHERE clone_id = :cid"),
                        {"cid": str(clone_id)},
                    )
                    cname = (row.mappings().first() or {}).get("display_name", "")
                    from doppel.ingestion.status import create_job
                    job_id = await create_job(clone_id, "gmail", session)
                    await _run_gmail_ingestion(clone_id=clone_id, clone_name=cname, job_id=job_id)
                except Exception as e:
                    _log.warning("Handoff Gmail sweep failed: %s", e)

            # --- Step 2: query memory stats ---
            counts = {}
            for table in ("episodic_memory", "semantic_memory", "procedural_memory", "relational_memory"):
                n = (await session.execute(
                    sql_text(f"SELECT COUNT(*) FROM {table} WHERE clone_id = :cid"),
                    {"cid": str(clone_id)},
                )).scalar() or 0
                counts[table] = int(n)

            # --- Step 3: generate report via brain ---
            await load_clone_keys(session, clone_id)
            brain = DoppelBrain(session=session, clone_id=clone_id)
            report_prompt = (
                "You are about to generate a structured Knowledge Transfer Report for yourself. "
                "Based on all of your memories, reasoning traces, and experiences, produce a JSON object "
                "with exactly these keys:\n"
                '- "domain_summary": a 2-3 sentence description of your core areas of expertise\n'
                '- "key_decisions": array of up to 5 objects {title, date, rationale, outcome}\n'
                '- "key_contacts": array of up to 8 objects {name, relationship, context}\n'
                '- "processes_owned": array of up to 5 objects {name, description, steps}\n'
                '- "successor_notes": a paragraph of advice for whoever takes over your responsibilities\n\n'
                "Respond with ONLY valid JSON, no markdown, no explanation."
            )
            result = await brain.process(BrainInput(
                clone_id=clone_id,
                message=report_prompt,
                context_type="handoff_report",
                metadata={"memory_stats": counts},
            ))

            # Parse the brain response as JSON
            report: dict = {}
            try:
                raw = result.response.strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1].lstrip("json").strip()
                report = json.loads(raw)
            except Exception:
                # Brain didn't return pure JSON — use response as domain_summary
                report = {
                    "domain_summary": result.response[:500],
                    "key_decisions": [],
                    "key_contacts": [],
                    "processes_owned": [],
                    "successor_notes": "",
                }

            await session.execute(
                sql_text("""
                    UPDATE handoff_reports SET
                        status = 'complete',
                        domain_summary = :ds,
                        key_decisions = :kd::jsonb,
                        key_contacts = :kc::jsonb,
                        processes_owned = :po::jsonb,
                        successor_notes = :sn,
                        memory_stats = :ms::jsonb,
                        generated_at = NOW()
                    WHERE clone_id = :cid
                """),
                {
                    "cid": str(clone_id),
                    "ds": report.get("domain_summary", ""),
                    "kd": json.dumps(report.get("key_decisions", [])),
                    "kc": json.dumps(report.get("key_contacts", [])),
                    "po": json.dumps(report.get("processes_owned", [])),
                    "sn": report.get("successor_notes", ""),
                    "ms": json.dumps(counts),
                },
            )
            await session.commit()

        except Exception as e:
            _log.error("_run_handoff_capture failed clone=%s: %s", clone_id, e, exc_info=True)
            await session.execute(
                sql_text("UPDATE handoff_reports SET status = 'failed' WHERE clone_id = :cid"),
                {"cid": str(clone_id)},
            )
            await session.commit()


@app.get("/clones/{handle}/handoff-report")
async def get_handoff_report(
    handle: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the handoff report for a clone. Owner or org admin only (enforced by proxy)."""
    row = await session.execute(
        sql_text("""
            SELECT hr.* FROM handoff_reports hr
            JOIN clone_identity c ON c.clone_id = hr.clone_id
            WHERE c.handle = :h
        """),
        {"h": handle},
    )
    report = row.mappings().first()
    if not report:
        return {"status": "not_started"}
    return {
        "status": report["status"],
        "domain_summary": report["domain_summary"],
        "key_decisions": report["key_decisions"] or [],
        "key_contacts": report["key_contacts"] or [],
        "processes_owned": report["processes_owned"] or [],
        "successor_notes": report["successor_notes"],
        "memory_stats": report["memory_stats"] or {},
        "generated_at": report["generated_at"].isoformat() if report["generated_at"] else None,
    }


@app.get("/clones/{handle}/handoff-report.json")
async def download_handoff_report(
    handle: str,
    session: AsyncSession = Depends(get_session),
):
    """Download handoff report as a JSON file."""
    from fastapi.responses import JSONResponse
    data = await get_handoff_report(handle=handle, session=session)
    if data.get("status") != "complete":
        raise HTTPException(status_code=404, detail="Report not complete yet")
    response = JSONResponse(content=data)
    response.headers["Content-Disposition"] = f'attachment; filename="{handle}-handoff.json"'
    return response


# ---------------------------------------------------------------------------
# 5.3  GDPR Data Export (Article 20)
# ---------------------------------------------------------------------------

@app.get("/clones/me/export")
async def gdpr_export(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """Download a full JSON export of all user data (Art. 20 right to portability)."""
    clone_row = await session.execute(
        sql_text("""
            SELECT clone_id, display_name, handle, access_mode,
                   style_fingerprint, value_system, created_at, updated_at,
                   retention_days_episodic, retention_days_traces,
                   is_preserved, legal_hold_until
            FROM clone_identity WHERE user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    clone = clone_row.mappings().first()
    if not clone:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    clone_id = str(clone["clone_id"])

    mem_rows = await session.execute(
        sql_text("SELECT * FROM episodic_memory WHERE clone_id = :id ORDER BY created_at DESC"),
        {"id": clone_id},
    )
    memories = [dict(r) for r in mem_rows.mappings()]
    for m in memories:
        for k, v in list(m.items()):
            if hasattr(v, "isoformat"):
                m[k] = v.isoformat()

    trace_rows = await session.execute(
        sql_text("""
            SELECT id, path, confidence, response, created_at
            FROM reasoning_traces WHERE clone_id = :id
            ORDER BY created_at DESC LIMIT 500
        """),
        {"id": clone_id},
    )
    traces = []
    for r in trace_rows.mappings():
        t = dict(r)
        for k, v in list(t.items()):
            if hasattr(v, "isoformat"):
                t[k] = v.isoformat()
        traces.append(t)

    payload = {
        "export_version": "1.0",
        "exported_at": __import__("datetime").datetime.utcnow().isoformat(),
        "clone": {
            "clone_id": clone_id,
            "display_name": clone["display_name"],
            "handle": clone["handle"],
            "access_mode": clone["access_mode"],
            "style_fingerprint": clone["style_fingerprint"],
            "value_system": clone["value_system"],
            "created_at": clone["created_at"].isoformat() if clone["created_at"] else None,
        },
        "episodic_memories": memories,
        "reasoning_traces": traces,
    }

    content = json.dumps(payload, indent=2, default=str)
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=doppel_export_{clone['handle']}.json"},
    )


# ---------------------------------------------------------------------------
# 5.4  GDPR Data Deletion (Article 17)
# ---------------------------------------------------------------------------

@app.delete("/clones/me")
async def gdpr_delete(
    user_id: str = Query(...),
    x_confirm_delete: str = Header(default="", alias="X-Confirm-Delete"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Permanently delete all user data (Art. 17 right to erasure).
    Requires header: X-Confirm-Delete: I_UNDERSTAND_THIS_IS_PERMANENT
    """
    if x_confirm_delete != "I_UNDERSTAND_THIS_IS_PERMANENT":
        raise HTTPException(
            status_code=400,
            detail="Send header X-Confirm-Delete: I_UNDERSTAND_THIS_IS_PERMANENT to confirm deletion",
        )

    clone_row = await session.execute(
        sql_text("""
            SELECT clone_id, handle, is_preserved, legal_hold_until
            FROM clone_identity WHERE user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    clone = clone_row.mappings().first()
    if not clone:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    _guard_preserved(dict(clone), "delete")

    clone_id = str(clone["clone_id"])

    # Cascade in FK-safe order
    for table in [
        "access_audit_log", "agent_queries", "clone_permissions",
        "developer_api_keys", "email_drafts", "episodic_memory",
        "ingestion_jobs", "meeting_sessions", "oauth_tokens",
        "proposals", "reasoning_traces", "semantic_memory",
        "slack_installations",
    ]:
        await session.execute(
            sql_text(f"DELETE FROM {table} WHERE clone_id = :id"),  # noqa: S608
            {"id": clone_id},
        )

    await session.execute(
        sql_text("DELETE FROM clone_identity WHERE clone_id = :id"),
        {"id": clone_id},
    )
    await session.commit()
    return {"status": "deleted", "clone_id": clone_id}


# ---------------------------------------------------------------------------
# 5.5  SCIM Provisioning
# ---------------------------------------------------------------------------

async def _verify_scim_token(org_id: UUID, token: str, session: AsyncSession) -> None:
    row = await session.execute(
        sql_text("SELECT scim_token_hash, scim_enabled FROM orgs WHERE id = :id"),
        {"id": str(org_id)},
    )
    rec = row.mappings().first()
    if not rec or not rec["scim_enabled"]:
        raise HTTPException(status_code=403, detail="SCIM not enabled for this org")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if not hmac.compare_digest(token_hash, rec["scim_token_hash"] or ""):
        raise HTTPException(status_code=401, detail="Invalid SCIM token")


def _scim_user_from_row(row: dict) -> dict:
    return {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
        "id": str(row.get("user_id", "")),
        "userName": row.get("display_name", ""),
        "active": not row.get("is_preserved", False),
        "meta": {"resourceType": "User"},
    }


@app.post("/scim/v2/orgs/{org_id}/Users", status_code=201)
async def scim_create_user(
    org_id: UUID,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    await _verify_scim_token(org_id, token, session)

    display_name = (body.get("displayName") or body.get("name", {}).get("formatted") or body.get("userName", ""))
    external_id = body.get("externalId") or body.get("id") or str(uuid4())

    handle = f"scim-{external_id[:12].lower().replace('-', '')}"
    clone_id = uuid4()
    try:
        await session.execute(
            sql_text("""
                INSERT INTO clone_identity (clone_id, display_name, handle, user_id, access_mode, style_fingerprint, value_system)
                VALUES (:cid, :name, :handle, :uid, 'org_scoped', '{}', '{}')
            """),
            {"cid": str(clone_id), "name": display_name, "handle": handle, "uid": external_id},
        )
        await session.execute(
            sql_text("INSERT INTO org_memberships (org_id, user_id, clone_id, role) VALUES (:oid, :uid, :cid, 'member')"),
            {"oid": str(org_id), "uid": external_id, "cid": str(clone_id)},
        )
        await session.commit()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="User already exists")
        _log.error("SCIM user creation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

    return _scim_user_from_row({"user_id": external_id, "display_name": display_name})


@app.get("/scim/v2/orgs/{org_id}/Users")
async def scim_list_users(
    org_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    await _verify_scim_token(org_id, token, session)

    rows = await session.execute(
        sql_text("""
            SELECT c.user_id, c.display_name, c.is_preserved
            FROM clone_identity c
            JOIN org_memberships m ON m.user_id = c.user_id AND m.org_id = :oid
        """),
        {"oid": str(org_id)},
    )
    users = [_scim_user_from_row(dict(r)) for r in rows.mappings()]
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(users),
        "Resources": users,
    }


@app.get("/scim/v2/orgs/{org_id}/Users/{user_id}")
async def scim_get_user(
    org_id: UUID,
    user_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    await _verify_scim_token(org_id, token, session)

    row = await session.execute(
        sql_text("""
            SELECT c.user_id, c.display_name, c.is_preserved
            FROM clone_identity c
            JOIN org_memberships m ON m.user_id = c.user_id
            WHERE m.org_id = :oid AND c.user_id = :uid
        """),
        {"oid": str(org_id), "uid": user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="User not found")
    return _scim_user_from_row(dict(rec))


@app.patch("/scim/v2/orgs/{org_id}/Users/{user_id}")
async def scim_patch_user(
    org_id: UUID,
    user_id: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """SCIM PATCH — active: false sets is_preserved = true on the clone."""
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    await _verify_scim_token(org_id, token, session)

    ops = body.get("Operations", [])
    active_val = None
    for op in ops:
        if op.get("path") == "active" or op.get("op", "").lower() == "replace":
            v = op.get("value")
            if isinstance(v, bool):
                active_val = v
            elif isinstance(v, dict) and "active" in v:
                active_val = v["active"]

    if active_val is False:
        await session.execute(
            sql_text("""
                UPDATE clone_identity SET is_preserved = TRUE, preserved_at = NOW()
                WHERE user_id = :uid
            """),
            {"uid": user_id},
        )
        await session.commit()
    elif active_val is True:
        await session.execute(
            sql_text("UPDATE clone_identity SET is_preserved = FALSE, preserved_at = NULL WHERE user_id = :uid"),
            {"uid": user_id},
        )
        await session.commit()

    row = await session.execute(
        sql_text("SELECT user_id, display_name, is_preserved FROM clone_identity WHERE user_id = :uid"),
        {"uid": user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="User not found")
    return _scim_user_from_row(dict(rec))


class EnableScimRequest(BaseModel):
    user_id: str


@app.post("/org/scim/enable")
async def enable_scim(
    body: EnableScimRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Generate a SCIM bearer token for the org. Only the org owner can call this."""
    row = await session.execute(
        sql_text("SELECT id FROM orgs WHERE owner_user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=403, detail="Not an org owner")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    await session.execute(
        sql_text("UPDATE orgs SET scim_token_hash = :h, scim_enabled = TRUE WHERE id = :id"),
        {"h": token_hash, "id": str(rec["id"])},
    )
    await session.commit()
    return {"scim_token": raw_token, "note": "Store this token securely — it will not be shown again"}


# ---------------------------------------------------------------------------
# 5.6  SSO / SAML Configuration (stub)
# ---------------------------------------------------------------------------

class SsoConfigRequest(BaseModel):
    user_id: str
    provider: str
    metadata_url: str | None = None
    entity_id: str | None = None
    certificate: str | None = None


_VALID_SSO_PROVIDERS = {"okta", "azure_ad", "google_workspace", "saml_generic"}


@app.post("/org/sso-config", status_code=201)
async def create_sso_config(
    body: SsoConfigRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.provider not in _VALID_SSO_PROVIDERS:
        raise HTTPException(status_code=422, detail=f"provider must be one of {_VALID_SSO_PROVIDERS}")

    org_row = await session.execute(
        sql_text("SELECT id FROM orgs WHERE owner_user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    org = org_row.mappings().first()
    if not org:
        raise HTTPException(status_code=403, detail="Not an org owner")

    await session.execute(
        sql_text("""
            INSERT INTO sso_configs (org_id, provider, metadata_url, entity_id, certificate)
            VALUES (:org_id, :provider, :metadata_url, :entity_id, :cert)
            ON CONFLICT (org_id) DO UPDATE
            SET provider = EXCLUDED.provider, metadata_url = EXCLUDED.metadata_url,
                entity_id = EXCLUDED.entity_id, certificate = EXCLUDED.certificate
        """),
        {
            "org_id": str(org["id"]),
            "provider": body.provider,
            "metadata_url": body.metadata_url,
            "entity_id": body.entity_id,
            "cert": body.certificate,
        },
    )
    await session.commit()
    return {"status": "saved", "provider": body.provider}


@app.get("/org/sso-config")
async def get_sso_config(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    org_row = await session.execute(
        sql_text("SELECT id FROM orgs WHERE owner_user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    org = org_row.mappings().first()
    if not org:
        raise HTTPException(status_code=403, detail="Not an org owner")

    cfg_row = await session.execute(
        sql_text("SELECT provider, metadata_url, entity_id, enabled FROM sso_configs WHERE org_id = :oid"),
        {"oid": str(org["id"])},
    )
    cfg = cfg_row.mappings().first()
    if not cfg:
        return {"configured": False}

    return {
        "configured": True,
        "provider": cfg["provider"],
        "metadata_url": cfg["metadata_url"],
        "entity_id": cfg["entity_id"],
        "enabled": cfg["enabled"],
    }


@app.post("/org/sso-config/test")
async def test_sso_config(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return {"status": "not_active", "message": "Contact support to activate SSO for your organisation."}


# ---------------------------------------------------------------------------
# 5.7  Role-Based Access Per Clone
# ---------------------------------------------------------------------------

_VALID_CLONE_ROLES = {"viewer", "contributor", "admin"}


@app.get("/clones/{handle}/permissions")
async def list_clone_permissions(
    handle: str,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    clone_row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    clone = clone_row.mappings().first()
    if not clone:
        raise HTTPException(status_code=404, detail="Clone not found")
    if clone["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    rows = await session.execute(
        sql_text("SELECT user_id, role, granted_by, created_at FROM clone_permissions WHERE clone_id = :cid"),
        {"cid": str(clone["clone_id"])},
    )
    perms = [
        {
            "user_id": r["user_id"],
            "role": r["role"],
            "granted_by": r["granted_by"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows.mappings()
    ]
    return {"clone_id": str(clone["clone_id"]), "permissions": perms}


class GrantPermissionRequest(BaseModel):
    owner_user_id: str
    user_id: str
    role: str = "viewer"


@app.post("/clones/{handle}/permissions", status_code=201)
async def grant_clone_permission(
    handle: str,
    body: GrantPermissionRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.role not in _VALID_CLONE_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {_VALID_CLONE_ROLES}")

    clone_row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    clone = clone_row.mappings().first()
    if not clone:
        raise HTTPException(status_code=404, detail="Clone not found")
    if clone["user_id"] != body.owner_user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    await session.execute(
        sql_text("""
            INSERT INTO clone_permissions (clone_id, user_id, role, granted_by)
            VALUES (:cid, :uid, :role, :granted_by)
            ON CONFLICT (clone_id, user_id) DO UPDATE SET role = EXCLUDED.role
        """),
        {
            "cid": str(clone["clone_id"]),
            "uid": body.user_id,
            "role": body.role,
            "granted_by": body.owner_user_id,
        },
    )
    await session.commit()
    return {"status": "granted", "user_id": body.user_id, "role": body.role}


@app.delete("/clones/{handle}/permissions/{target_user_id}")
async def revoke_clone_permission(
    handle: str,
    target_user_id: str,
    owner_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    clone_row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    clone = clone_row.mappings().first()
    if not clone:
        raise HTTPException(status_code=404, detail="Clone not found")
    if clone["user_id"] != owner_user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    await session.execute(
        sql_text("DELETE FROM clone_permissions WHERE clone_id = :cid AND user_id = :uid"),
        {"cid": str(clone["clone_id"]), "uid": target_user_id},
    )
    await session.commit()
    return {"status": "revoked", "user_id": target_user_id}


# ---------------------------------------------------------------------------
# 5.8  Audit Webhook Streaming
# ---------------------------------------------------------------------------

async def _emit_audit_webhook(org_id: str, event: dict) -> None:
    """Fire HMAC-signed POST to all enabled webhooks for this org. Best-effort."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            async with AsyncSessionLocal() as session:
                rows = await session.execute(
                    sql_text("SELECT url, secret FROM audit_webhooks WHERE org_id = :oid AND enabled = TRUE"),
                    {"oid": org_id},
                )
                hooks = list(rows.mappings())

            payload = json.dumps(event, default=str).encode()
            for hook in hooks:
                sig = hmac.new(hook["secret"].encode(), payload, hashlib.sha256).hexdigest()  # type: ignore[attr-defined]
                try:
                    await client.post(
                        hook["url"],
                        content=payload,
                        headers={
                            "Content-Type": "application/json",
                            "X-Doppel-Signature": f"sha256={sig}",
                        },
                    )
                except Exception:
                    pass
    except Exception:
        pass


class RegisterWebhookRequest(BaseModel):
    user_id: str
    url: str
    secret: str


@app.post("/org/audit-webhooks", status_code=201)
async def register_audit_webhook(
    body: RegisterWebhookRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    org_row = await session.execute(
        sql_text("SELECT id FROM orgs WHERE owner_user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    org = org_row.mappings().first()
    if not org:
        raise HTTPException(status_code=403, detail="Not an org owner")

    webhook_id = uuid4()
    await session.execute(
        sql_text("INSERT INTO audit_webhooks (id, org_id, url, secret) VALUES (:id, :oid, :url, :secret)"),
        {"id": str(webhook_id), "oid": str(org["id"]), "url": body.url, "secret": body.secret},
    )
    await session.commit()
    return {"id": str(webhook_id), "url": body.url}


@app.get("/org/audit-webhooks")
async def list_audit_webhooks(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    org_row = await session.execute(
        sql_text("SELECT id FROM orgs WHERE owner_user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    org = org_row.mappings().first()
    if not org:
        raise HTTPException(status_code=403, detail="Not an org owner")

    rows = await session.execute(
        sql_text("SELECT id, url, enabled, created_at FROM audit_webhooks WHERE org_id = :oid"),
        {"oid": str(org["id"])},
    )
    hooks = [
        {
            "id": str(r["id"]),
            "url": r["url"],
            "enabled": r["enabled"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows.mappings()
    ]
    return {"webhooks": hooks}


@app.delete("/org/audit-webhooks/{webhook_id}")
async def delete_audit_webhook(
    webhook_id: UUID,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    org_row = await session.execute(
        sql_text("SELECT id FROM orgs WHERE owner_user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    org = org_row.mappings().first()
    if not org:
        raise HTTPException(status_code=403, detail="Not an org owner")

    await session.execute(
        sql_text("DELETE FROM audit_webhooks WHERE id = :id AND org_id = :oid"),
        {"id": str(webhook_id), "oid": str(org["id"])},
    )
    await session.commit()


# ===========================================================================
# COMPUTER USE AGENT
# ===========================================================================

@app.get("/brain/task/monitors")
async def get_monitors() -> dict:
    """Return available physical monitors for the computer-use agent."""
    from doppel.brain.tasks.computer_agent import list_monitors
    try:
        monitors = list_monitors()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not enumerate monitors: {exc}")
    return {"monitors": monitors}


@app.websocket("/brain/task/stream")
async def computer_task_stream(
    websocket: WebSocket,
    clone_id: str,
    monitor_index: int = 1,
    session: AsyncSession = Depends(get_session),
) -> None:
    """
    WebSocket endpoint for the computer-use agent.

    Query params:
      clone_id       — which clone is running the task
      monitor_index  — which physical monitor to control (default 1 = primary)

    Flow:
      1. Client connects: ws://host/brain/task/stream?clone_id=X&monitor_index=1
      2. Client sends JSON: {"instruction": "…"}
      3. Server streams event dicts until done/error
      4. Client sends {"action": "stop"} to abort mid-task
    """
    from doppel.brain.tasks.computer_agent import run_computer_task
    from doppel.brain.db.vector import embed, similarity_search
    from doppel.brain.context import load_clone_keys
    from uuid import UUID

    await websocket.accept()

    # Resolve clone
    clone_row = await session.execute(
        sql_text("SELECT display_name, api_keys FROM clone_identity WHERE clone_id = :cid LIMIT 1"),
        {"cid": clone_id},
    )
    clone = clone_row.mappings().first()
    clone_name: str = clone["display_name"] if clone else "the user"

    # Load all stored API keys into ContextVars so embed() and other helpers use them
    clone_uuid = UUID(clone_id)
    await load_clone_keys(session, clone_uuid)

    # Resolve Anthropic API key for the computer agent (needs it as an explicit arg)
    stored_keys: dict = dict(clone["api_keys"] or {}) if clone else {}
    anthropic_api_key: str = stored_keys.get("anthropic") or settings.anthropic_api_key

    # Receive instruction
    try:
        payload = await asyncio.wait_for(websocket.receive_json(), timeout=30)
    except Exception:
        await websocket.close(code=1008)
        return

    instruction: str = payload.get("instruction", "").strip()
    if not instruction:
        await websocket.send_json({"type": "error", "message": "No instruction provided."})
        await websocket.close()
        return

    # Build brain query fn — queries all 4 memory layers
    async def brain_query(query: str) -> str:
        try:
            q_emb = await embed(query)
            # Vector search on the three tables that have embeddings
            vector_tables = [
                ("episodic_memory",  "AND is_excluded = false", "content"),
                ("semantic_memory",  "",                        "content"),
                ("procedural_memory","",                        "content"),
            ]
            parts: list[str] = []
            for table, extra, col in vector_tables:
                rows = await similarity_search(
                    session, table, clone_uuid, q_emb, limit=4, extra_where=extra
                )
                for row in rows:
                    if row.get("similarity_score", 0) > 0.3:
                        layer = table.replace("_memory", "")
                        parts.append(f"[{layer}] {row.get(col, '')}")
            # relational_memory has no embedding — fetch most recent contacts instead
            rel_rows = await session.execute(
                sql_text(
                    "SELECT contact_name, relationship_type, notes FROM relational_memory "
                    "WHERE clone_id = :cid ORDER BY updated_at DESC LIMIT 6"
                ),
                {"cid": str(clone_uuid)},
            )
            for row in rel_rows.mappings():
                name = row.get("contact_name") or ""
                rel  = row.get("relationship_type") or ""
                note = row.get("notes") or ""
                if name or note:
                    parts.append(f"[relational] {name} ({rel}): {note}")
            if not parts:
                return "No relevant memories found for this query."
            return "\n\n".join(parts[:12])
        except Exception as exc:
            return f"Brain query error: {exc}"

    # Run agent + listen for stop simultaneously
    stop_event = asyncio.Event()

    async def _listen_for_stop() -> None:
        try:
            while True:
                msg = await websocket.receive_json()
                if msg.get("action") == "stop":
                    stop_event.set()
                    break
        except Exception:
            stop_event.set()

    listen_task = asyncio.create_task(_listen_for_stop())

    try:
        async for event in run_computer_task(
            clone_name=clone_name,
            instruction=instruction,
            monitor_index=monitor_index,
            brain_query_fn=brain_query,
            api_key=anthropic_api_key,
        ):
            if stop_event.is_set():
                await websocket.send_json({"type": "done", "result": "Task stopped by user."})
                break
            try:
                await websocket.send_json(event)
            except Exception:
                break
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        listen_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass
    return {"status": "deleted"}
