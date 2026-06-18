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
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from uuid import UUID, uuid4

_log = logging.getLogger(__name__)

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy import text as sql_text
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.security.encryption import encrypt_field, decrypt_field
from doppel.brain.context import (
    load_clone_keys,
    get_google_client_id, get_google_client_secret,
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

# Credit multipliers per response mode (based on actual token usage ratio)
CREDITS_MULTIPLIER: dict[str, int] = {"fast": 1, "pro": 3, "extended": 8}
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

_ALWAYS_ALLOWED = [
    "http://localhost:3000",   # Next.js dev
    "http://localhost:5173",   # Vite dev (Electron renderer)
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]
if settings.app_env == "development":
    _cors_origins = _ALWAYS_ALLOWED
else:
    _explicit = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
    _cors_origins = list(dict.fromkeys(_ALWAYS_ALLOWED + _explicit))  # dedup, keep order

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.doppel\.ai",   # catch all prod subdomains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# In-process access check cache — avoids re-querying clone_identity on every request.
# Access mode doesn't change per-second; 60s TTL is safe.
# ---------------------------------------------------------------------------
import time as _time_module

_ACCESS_CACHE: dict[str, tuple[float, str, str | None]] = {}  # key → (ts, access_mode, owner_id)
_ACCESS_TTL = 60.0


def _access_cache_key(clone_id: UUID, caller_user_id: str | None) -> str:
    return f"{clone_id}:{caller_user_id or ''}"


def invalidate_access_cache(clone_id: UUID) -> None:
    prefix = str(clone_id) + ":"
    for k in list(_ACCESS_CACHE.keys()):
        if k.startswith(prefix):
            del _ACCESS_CACHE[k]


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

# Maximum episodic memory chunks per clone per tier
TIER_MEMORY_LIMITS: dict[str, int] = {
    "free": 500,
    "personal": 5_000,
    "enterprise_pro": 30_000,
    "enterprise_max": 200_000,
}

# Weekly plan credits per tier — resets every Monday, unused do NOT roll over
TIER_WEEKLY_CREDITS: dict[str, int] = {
    "free": 0,
    "personal": 100,
    "enterprise_pro": 500,
    "enterprise_max": 2_000,
}

# Tier rank for comparing (higher = better)
_TIER_RANK: dict[str, int] = {
    "free": 0,
    "personal": 1,
    "enterprise_pro": 2,
    "enterprise_max": 3,
}

# Creator revenue share by billing tier
REV_SHARE: dict[str, float] = {
    "free": 0.70,
    "personal": 0.80,
    "enterprise_pro": 0.80,
    "enterprise_max": 0.80,
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


async def _check_memory_limit(clone_id: UUID, chunks_to_add: int, session: AsyncSession) -> None:
    """Raise HTTP 402 if adding chunks_to_add would exceed this clone's tier memory limit."""
    tier_row = await session.execute(
        sql_text("SELECT subscription_tier FROM clone_identity WHERE clone_id = :id"),
        {"id": str(clone_id)},
    )
    tier = (tier_row.mappings().first() or {}).get("subscription_tier") or "free"
    limit = TIER_MEMORY_LIMITS.get(tier, TIER_MEMORY_LIMITS["free"])

    count_row = await session.execute(
        sql_text("SELECT COUNT(*) FROM episodic_memory WHERE clone_id = :id AND is_excluded = FALSE"),
        {"id": str(clone_id)},
    )
    current = count_row.scalar() or 0

    if current + chunks_to_add > limit:
        raise HTTPException(
            status_code=402,
            detail=f"Memory limit reached ({current}/{limit} chunks on the {tier} plan). Upgrade your plan to store more.",
        )


async def _get_user_tier(user_id: str, session: AsyncSession) -> str:
    """Return the highest subscription_tier among all clones owned by this user."""
    row = await session.execute(
        sql_text("SELECT subscription_tier FROM clone_identity WHERE user_id = :uid"),
        {"uid": user_id},
    )
    tiers = [r["subscription_tier"] or "free" for r in row.mappings()]
    if not tiers:
        return "free"
    return max(tiers, key=lambda t: _TIER_RANK.get(t, 0))


async def _refresh_plan_credits(user_id: str, session: AsyncSession) -> int:
    """
    Lazily refresh plan_credits for user if the week has rolled over.
    Returns current plan credit balance.
    Weekly credits are non-cumulative — unused credits are discarded on rollover.
    """
    tier = await _get_user_tier(user_id, session)
    weekly = TIER_WEEKLY_CREDITS.get(tier, 0)

    row = await session.execute(
        sql_text("SELECT credits, week_start FROM plan_credits WHERE user_id = :uid"),
        {"uid": user_id},
    )
    rec = row.mappings().first()

    current_week = (await session.execute(
        sql_text("SELECT date_trunc('week', NOW()) AS w"),
    )).scalar()

    if rec is None:
        # First time — create row with this week's allowance
        await session.execute(
            sql_text("""
                INSERT INTO plan_credits (user_id, credits, week_start, updated_at)
                VALUES (:uid, :credits, :week, NOW())
                ON CONFLICT (user_id) DO NOTHING
            """),
            {"uid": user_id, "credits": weekly, "week": current_week},
        )
        return weekly
    elif rec["week_start"] < current_week:
        # New week — reset (do NOT carry over unused credits)
        await session.execute(
            sql_text("""
                UPDATE plan_credits
                SET credits = :credits, week_start = :week, updated_at = NOW()
                WHERE user_id = :uid
            """),
            {"uid": user_id, "credits": weekly, "week": current_week},
        )
        return weekly
    else:
        current = int(rec["credits"])
        # Same week — if tier upgraded mid-week, top up to the new allowance immediately.
        # (Never take credits away for downgrades — let them exhaust what they have.)
        if weekly > current:
            await session.execute(
                sql_text("""
                    UPDATE plan_credits
                    SET credits = :credits, updated_at = NOW()
                    WHERE user_id = :uid
                """),
                {"uid": user_id, "credits": weekly},
            )
            return weekly
        return current


async def _deduct_personal_credits(user_id: str, cost: int, session: AsyncSession) -> None:
    """
    Deduct `cost` credits from the caller's personal balance.
    Plan (weekly) credits are consumed first; bought credits are used for the remainder.
    Raises HTTP 402 if combined balance is insufficient.
    """
    plan_bal = await _refresh_plan_credits(user_id, session)

    bought_row = await session.execute(
        sql_text("SELECT credits_remaining FROM query_credits WHERE user_id = :uid"),
        {"uid": user_id},
    )
    bought_bal = int((bought_row.mappings().first() or {}).get("credits_remaining") or 0)

    total = plan_bal + bought_bal
    if total < cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits (need {cost}, have {total})",
        )

    # Drain plan credits first
    plan_used = min(plan_bal, cost)
    bought_used = cost - plan_used

    if plan_used > 0:
        await session.execute(
            sql_text("UPDATE plan_credits SET credits = credits - :used, updated_at = NOW() WHERE user_id = :uid"),
            {"used": plan_used, "uid": user_id},
        )
    if bought_used > 0:
        await session.execute(
            sql_text("UPDATE query_credits SET credits_remaining = credits_remaining - :used, updated_at = NOW() WHERE user_id = :uid"),
            {"used": bought_used, "uid": user_id},
        )


async def _check_clone_access(
    clone_id: UUID,
    caller_user_id: str | None,
    caller_email: str | None,
    session: AsyncSession,
) -> None:
    """
    Enforce access_mode on every chat request.
    Results are cached for 60s — access mode doesn't change per-second.
    Raises HTTP 403 if access is denied.
    """
    cache_key = _access_cache_key(clone_id, caller_user_id)
    cached = _ACCESS_CACHE.get(cache_key)
    if cached and (_time_module.monotonic() - cached[0]) < _ACCESS_TTL:
        mode, owner_id = cached[1], cached[2]
        # Fast path: public or owner — no further checks needed
        if mode == "public":
            return
        if caller_user_id and caller_user_id == owner_id:
            return
        # Non-trivial modes need full re-check (allowlist email/org could change)
        # Fall through to DB below

    # Only include org JOINs for org_scoped clones (avoids expensive JOIN on public clones)
    row = await session.execute(
        sql_text("""
            SELECT access_mode, user_id AS owner_user_id, allowed_emails
            FROM clone_identity
            WHERE clone_id = :clone_id
            LIMIT 1
        """),
        {"clone_id": str(clone_id)},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")

    mode = rec["access_mode"]
    owner_id = rec["owner_user_id"]

    # Cache for fast subsequent requests
    _ACCESS_CACHE[cache_key] = (_time_module.monotonic(), mode, owner_id)

    if mode == "public":
        return  # anyone

    if caller_user_id and caller_user_id == owner_id:
        return  # always allow owner

    if mode == "private":
        if caller_user_id:
            perm_row = await session.execute(
                sql_text("SELECT user_id FROM clone_permissions WHERE clone_id = :cid AND user_id = :uid LIMIT 1"),
                {"cid": str(clone_id), "uid": caller_user_id},
            )
            if perm_row.mappings().first():
                return
        raise HTTPException(status_code=403, detail="This clone is private.")

    if mode == "allowlist":
        allowed = rec["allowed_emails"] or []
        if not caller_email or caller_email.lower() not in [e.lower() for e in allowed]:
            raise HTTPException(status_code=403, detail="You don't have access to this clone.")
        return

    if mode == "org_scoped":
        org_row = await session.execute(
            sql_text("""
                SELECT om.org_id FROM org_memberships om
                WHERE om.user_id = :caller AND om.org_id IN (
                    SELECT org_id FROM org_memberships WHERE user_id = :owner LIMIT 1
                )
                LIMIT 1
            """),
            {"caller": caller_user_id or "", "owner": owner_id or ""},
        )
        if not org_row.mappings().first():
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

    # Enforce per-tier clone limit
    tier_row = await session.execute(
        sql_text("""
            SELECT COUNT(*) AS cnt,
                   MAX(subscription_tier) AS tier
            FROM clone_identity WHERE user_id = :uid
        """),
        {"uid": body.user_id},
    )
    tier_rec = tier_row.mappings().first()
    existing_count = int(tier_rec["cnt"] or 0)
    tier_order = ["free", "personal", "enterprise_pro", "enterprise_max"]
    raw_tier = tier_rec["tier"] or "free"
    highest_tier = raw_tier if raw_tier in CLONE_LIMITS else "free"
    allowed = CLONE_LIMITS.get(highest_tier, 2)
    if existing_count >= allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Clone limit reached for {highest_tier} plan ({allowed} clones). Upgrade to create more.",
        )

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
                   created_at, updated_at,
                   avatar_url, listing_banner_url, listing_title,
                   COALESCE(is_verified, FALSE) AS is_verified,
                   is_listed, price_per_query, category, listing_description
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
        "avatar_url": record["avatar_url"],
        "listing_banner_url": record["listing_banner_url"],
        "listing_title": record["listing_title"],
        "is_verified": bool(record["is_verified"]),
        "is_listed": bool(record["is_listed"]) if record["is_listed"] is not None else False,
        "price_per_query": float(record["price_per_query"] or 0),
        "category": record["category"],
        "listing_description": record["listing_description"],
    }


CLONE_LIMITS: dict[str, int] = {
    "free": 2,
    "personal": 5,
    "enterprise_pro": 20,
    "enterprise_max": 50,
}


@app.get("/clones/mine")
async def list_my_clones(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return all clones owned by the authenticated user."""
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")

    rows = await session.execute(
        sql_text("""
            SELECT clone_id, display_name, handle, access_mode, is_listed,
                   subscription_tier, created_at, updated_at,
                   is_verified, listing_title, price_per_query,
                   avatar_url, listing_banner_url,
                   allowed_emails, rate_limit_per_day,
                   category, listing_description
            FROM clone_identity
            WHERE user_id = :uid
            ORDER BY created_at DESC
        """),
        {"uid": caller_user_id},
    )
    clones = [
        {
            "clone_id": str(r["clone_id"]),
            "display_name": r["display_name"],
            "handle": r["handle"],
            "access_mode": r["access_mode"],
            "is_listed": bool(r["is_listed"]),
            "subscription_tier": r["subscription_tier"] or "free",
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            "is_verified": bool(r["is_verified"]) if r["is_verified"] is not None else False,
            "listing_title": r["listing_title"],
            "price_per_query": float(r["price_per_query"] or 0),
            "avatar_url": r["avatar_url"],
            "listing_banner_url": r["listing_banner_url"],
            "allowed_emails": list(r["allowed_emails"] or []),
            "rate_limit_per_day": int(r["rate_limit_per_day"] or 0),
            "category": r["category"],
            "listing_description": r["listing_description"],
        }
        for r in rows.mappings().all()
    ]

    # Determine plan limit from highest-tier clone (or free default)
    tiers = [c["subscription_tier"] for c in clones]
    tier_order = ["free", "personal", "enterprise_pro", "enterprise_max"]
    highest = max((t for t in tiers), key=lambda t: tier_order.index(t) if t in tier_order else 0, default="free")
    limit = CLONE_LIMITS.get(highest, 2)

    return {"clones": clones, "count": len(clones), "limit": limit, "tier": highest}


@app.get("/clones/{handle}")
async def get_clone_by_handle(
    handle: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Public clone info — safe to expose to anyone."""

    row = await session.execute(
        sql_text("""
            SELECT clone_id, display_name, handle, access_mode, allowed_emails,
                   avatar_url, listing_banner_url, is_listed, listing_title,
                   price_per_query, category, listing_description, is_verified
            FROM clone_identity
            WHERE handle = :handle
        """),
        {"handle": handle},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Clone not found")

    return {
        "clone_id":            str(record["clone_id"]),
        "display_name":        record["display_name"],
        "handle":              record["handle"],
        "access_mode":         record["access_mode"],
        "allowed_emails":      record["allowed_emails"] or [],
        "is_listed":           bool(record["is_listed"]),
        "listing_title":       record["listing_title"],
        "listing_description": record["listing_description"],
        "price_per_query":     float(record["price_per_query"] or 0),
        "category":            record["category"],
        "is_verified":         bool(record["is_verified"]),
        "avatar_url":          record["avatar_url"],
        "listing_banner_url":  record["listing_banner_url"],
    }


@app.patch("/clones/{handle}")
async def update_clone(
    handle: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Update clone fields (access_mode, display_name). Caller must be owner (enforced by Next.js proxy)."""

    allowed = {
        "access_mode", "display_name", "allowed_emails",
        "is_onboarding_resource", "expertise_tags",
        # Marketplace fields
        "is_listed", "listing_title", "price_per_query", "category", "listing_description", "listing_banner_url", "avatar_url",
    }
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

    # Return the updated record so callers don't need a second fetch
    updated_row = await session.execute(
        sql_text("""
            SELECT clone_id, display_name, handle, access_mode, allowed_emails,
                   avatar_url, listing_banner_url, is_listed, listing_title,
                   price_per_query, category, listing_description, is_verified
            FROM clone_identity WHERE handle = :handle
        """),
        {"handle": handle},
    )
    rec = updated_row.mappings().first()
    if not rec:
        return {"status": "updated"}
    return {
        "clone_id":            str(rec["clone_id"]),
        "display_name":        rec["display_name"],
        "handle":              rec["handle"],
        "access_mode":         rec["access_mode"],
        "allowed_emails":      rec["allowed_emails"] or [],
        "is_listed":           bool(rec["is_listed"]),
        "listing_title":       rec["listing_title"],
        "listing_description": rec["listing_description"],
        "price_per_query":     float(rec["price_per_query"] or 0),
        "category":            rec["category"],
        "is_verified":         bool(rec["is_verified"]),
        "avatar_url":          rec["avatar_url"],
        "listing_banner_url":  rec["listing_banner_url"],
    }


# ---------------------------------------------------------------------------
# Consumer Brain — personal knowledge store for consumers
# ---------------------------------------------------------------------------

@app.post("/consumer/brain")
async def consumer_brain_ingest(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Store a memory in the consumer's personal brain."""
    consumer_user_id = request.headers.get("X-User-Id")
    if not consumer_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="content required")
    category = body.get("category", "background")

    from doppel.brain.db.vector import embed_batch
    embeddings = await embed_batch([content])
    vec_literal = "[" + ",".join(str(v) for v in embeddings[0]) + "]"

    result = await session.execute(
        sql_text("""
            INSERT INTO consumer_memory (consumer_user_id, content, embedding, category)
            VALUES (:uid, :content, :emb::vector, :category)
            RETURNING id, created_at
        """),
        {"uid": consumer_user_id, "content": content, "emb": vec_literal, "category": category},
    )
    row = result.mappings().first()
    await session.commit()
    return {"id": str(row["id"]), "created_at": row["created_at"].isoformat()}


@app.get("/consumer/brain")
async def consumer_brain_list(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List all memories in the consumer's personal brain."""
    consumer_user_id = request.headers.get("X-User-Id")
    if not consumer_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    rows = await session.execute(
        sql_text("""
            SELECT id, content, category, source, created_at
            FROM consumer_memory
            WHERE consumer_user_id = :uid
            ORDER BY created_at DESC
        """),
        {"uid": consumer_user_id},
    )
    memories = [
        {
            "id": str(r["id"]),
            "content": r["content"],
            "category": r["category"],
            "source": r["source"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows.mappings()
    ]
    return {"memories": memories}


@app.delete("/consumer/brain/{memory_id}")
async def consumer_brain_delete(
    memory_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete a memory from the consumer's brain."""
    consumer_user_id = request.headers.get("X-User-Id")
    if not consumer_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    await session.execute(
        sql_text("DELETE FROM consumer_memory WHERE id = :mid AND consumer_user_id = :uid"),
        {"mid": memory_id, "uid": consumer_user_id},
    )
    await session.commit()
    return {"ok": True}


@app.post("/consumer/brain/upload")
async def consumer_brain_upload(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(default="background"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upload a document (PDF/DOCX/PPTX/TXT/CSV/MD) and chunk it into consumer memories."""
    consumer_user_id = request.headers.get("X-User-Id")
    if not consumer_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    raw = await file.read()
    fname = (file.filename or "").lower()

    # ---- text extraction by file type ----
    if fname.endswith(".pdf"):
        import io as _io
        from pypdf import PdfReader
        reader = PdfReader(_io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif fname.endswith(".docx"):
        import io as _io
        from docx import Document
        doc = Document(_io.BytesIO(raw))
        text = "\n".join(p.text for p in doc.paragraphs)
    elif fname.endswith(".pptx"):
        import io as _io
        from pptx import Presentation
        prs = Presentation(_io.BytesIO(raw))
        parts = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text.strip():
                    parts.append(shape.text.strip())
        text = "\n".join(parts)
    elif fname.endswith(".csv"):
        import io as _io
        text = raw.decode("utf-8", errors="replace")
    else:
        # .txt, .md, and any other text-based formats
        text = raw.decode("utf-8", errors="replace")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Could not extract any text from this file")

    # ---- chunk into ~400-char segments with 80-char overlap ----
    chunk_size = 400
    overlap = 80
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - overlap
    if not chunks:
        raise HTTPException(status_code=422, detail="No content to store")

    # ---- embed + insert all chunks ----
    from doppel.brain.db.vector import embed_batch
    embeddings = await embed_batch(chunks)
    source_tag = f"document:{file.filename or 'upload'}"

    count = 0
    for chunk_text, emb in zip(chunks, embeddings):
        vec_literal = "[" + ",".join(str(v) for v in emb) + "]"
        await session.execute(
            sql_text("""
                INSERT INTO consumer_memory (consumer_user_id, content, embedding, category, source)
                VALUES (:uid, :content, :emb::vector, :category, :source)
            """),
            {"uid": consumer_user_id, "content": chunk_text, "emb": vec_literal,
             "category": category, "source": source_tag},
        )
        count += 1

    await session.commit()
    return {"chunks_stored": count, "filename": file.filename}


@app.post("/consumer/voice/synthesize")
async def consumer_voice_synthesize(body: dict, request: Request) -> StreamingResponse:
    """Stream ElevenLabs TTS audio for a clone's response text."""
    text = body.get("text", "").strip()
    clone_id = body.get("clone_id", "")
    if not text:
        raise HTTPException(status_code=422, detail="text required")

    from doppel.brain.context import get_elevenlabs_key
    api_key = get_elevenlabs_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="Voice synthesis not configured")

    # Per-clone voice_id if set, else a neutral default
    voice_id = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs "Rachel" — neutral, clear
    if clone_id:
        async with AsyncSessionLocal() as _s:
            rec = await _s.execute(
                sql_text("SELECT elevenlabs_voice_id FROM clone_identity WHERE clone_id = :cid"),
                {"cid": str(clone_id)},
            )
            row = rec.mappings().first()
            if row and row.get("elevenlabs_voice_id"):
                voice_id = row["elevenlabs_voice_id"]

    async def _stream():
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
                headers={"xi-api-key": api_key, "Content-Type": "application/json"},
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                },
            ) as resp:
                if resp.status_code != 200:
                    return
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    yield chunk

    return StreamingResponse(_stream(), media_type="audio/mpeg")


@app.post("/consumer/interview/questions")
async def consumer_interview_questions(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Generate interview questions the clone will ask to onboard this consumer."""
    clone_id = body.get("clone_id", "").strip()
    if not clone_id:
        raise HTTPException(status_code=422, detail="clone_id required")

    rec = await session.execute(
        sql_text("""
            SELECT display_name, category, listing_description
            FROM clone_identity WHERE clone_id = :cid
        """),
        {"cid": clone_id},
    )
    clone = rec.mappings().first()
    if not clone:
        raise HTTPException(status_code=404, detail="Clone not found")

    await load_clone_keys(session, clone_id)
    from doppel.brain.context import get_anthropic_client
    client = get_anthropic_client()

    domain_hint = " ".join(filter(None, [clone.get("category"), clone.get("listing_description")]))
    if not domain_hint:
        domain_hint = "their area of expertise"

    prompt = f"""You are {clone['display_name']}, a specialist known for: {domain_hint}

Before answering questions, you interview the person to calibrate every future answer to them specifically.

Generate exactly 5 interview questions. Each question should reveal something that would fundamentally change how you answer: their level, their context, their specific situation, what they've tried, and what they actually want.

Return ONLY valid JSON — a list of 5 objects:
[
  {{"question": "...", "category": "background"}},
  {{"question": "...", "category": "goal"}},
  {{"question": "...", "category": "experience"}},
  {{"question": "...", "category": "preference"}},
  {{"question": "...", "category": "expertise"}}
]

Categories must be one of: background, goal, experience, preference, expertise
Questions must be specific to your domain — not generic. No preamble, no explanation, JSON only."""

    resp = await client.messages.create(
        model=settings.classification_model,
        max_tokens=700,
        messages=[{"role": "user", "content": prompt}],
    )

    import json as _json
    text = resp.content[0].text.strip()
    start, end = text.find("["), text.rfind("]") + 1
    questions = _json.loads(text[start:end])

    return {"questions": questions, "clone_name": clone["display_name"]}


@app.post("/consumer/interview/save")
async def consumer_interview_save(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Store interview answers as consumer brain memories."""
    consumer_user_id = request.headers.get("X-User-Id")
    if not consumer_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    answers = body.get("answers", [])  # [{question, answer, category}]
    if not answers:
        raise HTTPException(status_code=422, detail="answers required")

    from doppel.brain.db.vector import embed_batch

    valid = [(a["answer"].strip(), a.get("category", "background"))
             for a in answers if a.get("answer", "").strip()]
    if not valid:
        return {"saved": 0}

    texts = [v[0] for v in valid]
    embeddings = await embed_batch(texts)

    for (content, category), emb in zip(valid, embeddings):
        vec = "[" + ",".join(str(v) for v in emb) + "]"
        await session.execute(
            sql_text("""
                INSERT INTO consumer_memory (consumer_user_id, content, embedding, category, source)
                VALUES (:uid, :content, :emb::vector, :cat, 'interview')
            """),
            {"uid": consumer_user_id, "content": content, "emb": vec, "cat": category},
        )

    await session.commit()
    return {"saved": len(valid)}


@app.post("/consumer/teaching/plan")
async def consumer_teaching_plan(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Generate a personalised 5-lesson curriculum for this consumer from this clone."""
    consumer_user_id = request.headers.get("X-User-Id")
    clone_id = body.get("clone_id", "").strip()
    if not clone_id:
        raise HTTPException(status_code=422, detail="clone_id required")

    rec = await session.execute(
        sql_text("SELECT display_name, category, listing_description FROM clone_identity WHERE clone_id = :cid"),
        {"cid": clone_id},
    )
    clone = rec.mappings().first()
    if not clone:
        raise HTTPException(status_code=404, detail="Clone not found")

    # Pull clone's actual semantic knowledge to ground the curriculum
    clone_knowledge: list[str] = []
    rows_sm = await session.execute(
        sql_text("""
            SELECT fact, domain, confidence FROM semantic_memory
            WHERE clone_id = :cid
            ORDER BY confidence DESC, created_at DESC
            LIMIT 30
        """),
        {"cid": clone_id},
    )
    clone_knowledge = [
        f"[{r['domain'] or 'general'}] {r['fact']}"
        for r in rows_sm.mappings()
    ]

    # Read consumer brain for calibration
    consumer_mems: list[str] = []
    if consumer_user_id:
        rows = await session.execute(
            sql_text("SELECT content, category FROM consumer_memory WHERE consumer_user_id = :uid ORDER BY created_at DESC LIMIT 20"),
            {"uid": consumer_user_id},
        )
        consumer_mems = [f"[{r['category']}] {r['content']}" for r in rows.mappings()]

    consumer_profile = "\n".join(consumer_mems) if consumer_mems else "No background known yet."

    await load_clone_keys(session, clone_id)
    from doppel.brain.context import get_anthropic_client
    client = get_anthropic_client()

    domain = " — ".join(filter(None, [clone.get("category"), clone.get("listing_description")])) or "their expertise"
    knowledge_section = "\n".join(clone_knowledge) if clone_knowledge else f"Specialist in: {domain}"

    prompt = f"""You are {clone['display_name']}. This is what you know deeply — your actual knowledge and expertise:

{knowledge_section}

About the student you are teaching:
{consumer_profile}

Design a 5-lesson curriculum drawn specifically from YOUR knowledge above.
Each lesson should teach something concrete you actually know. Build progressively.
Calibrate difficulty to where the student is — start simple if no background is known.

Return ONLY valid JSON — a list of exactly 5 objects:
[
  {{"title": "...", "description": "One-sentence: what they will learn and be able to do", "difficulty": "beginner|intermediate|advanced"}},
  ...
]
No preamble. JSON only."""

    resp = await client.messages.create(
        model=settings.classification_model,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )

    import json as _json
    text = resp.content[0].text.strip()
    start, end = text.find("["), text.rfind("]") + 1
    lessons = _json.loads(text[start:end])
    return {"lessons": lessons, "clone_name": clone["display_name"]}


@app.post("/marketplace/match")
async def marketplace_match(
    body: dict,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Find the best-matched public clones for a specific question."""
    question = body.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=422, detail="question required")

    from doppel.brain.db.vector import embed_batch
    embeddings = await embed_batch([question])
    vec = "[" + ",".join(str(v) for v in embeddings[0]) + "]"

    rows = await session.execute(
        sql_text("""
            SELECT
                ci.clone_id,
                ci.display_name,
                ci.handle,
                ci.category,
                ci.listing_description,
                MAX(1 - (em.embedding <=> :emb::vector)) AS score,
                (SELECT em2.content FROM episodic_memory em2
                 WHERE em2.clone_id = ci.clone_id
                 ORDER BY em2.embedding <=> :emb::vector
                 LIMIT 1) AS top_snippet
            FROM episodic_memory em
            JOIN clone_identity ci ON em.clone_id = ci.clone_id
            WHERE ci.access_mode = 'public'
              AND ci.handle IS NOT NULL
            GROUP BY ci.clone_id, ci.display_name, ci.handle, ci.category, ci.listing_description
            ORDER BY score DESC
            LIMIT 6
        """),
        {"emb": vec},
    )
    results = [
        {
            "clone_id": str(r["clone_id"]),
            "name": r["display_name"],
            "handle": r["handle"],
            "category": r["category"] or "",
            "description": (r["listing_description"] or "")[:180],
            "score": round(float(r["score"]), 3),
            "snippet": (r["top_snippet"] or "")[:140],
        }
        for r in rows.mappings()
        if r["score"] and float(r["score"]) > 0.25
    ]
    return {"matches": results}


@app.get("/consumer/conversations")
async def get_consumer_conversations(
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return clones in the user's home messages.

    UNION of:
      A) Clones explicitly added via consumer_clones (with last message info if any)
      B) Clones chatted with but not yet in consumer_clones (legacy / fallback)

    Sorted: most-recently-messaged first, then most-recently-added.
    """
    rows = await session.execute(
        sql_text("""
            WITH chat_history AS (
                SELECT DISTINCT ON (rt.clone_id)
                    rt.clone_id,
                    rt.session_id,
                    rt.created_at            AS last_message_at,
                    rt.brain_input->>'message' AS last_user_message
                FROM reasoning_traces rt
                WHERE rt.brain_input->>'sender_id' = :uid
                ORDER BY rt.clone_id, rt.created_at DESC
            ),
            added AS (
                SELECT cc.clone_id, cc.added_at
                FROM consumer_clones cc
                WHERE cc.consumer_user_id = :uid
            ),
            combined AS (
                -- Added clones (with optional chat history)
                SELECT
                    ci.clone_id,
                    COALESCE(ch.session_id, uuid_generate_v4()) AS session_id,
                    ch.last_message_at,
                    ch.last_user_message,
                    ci.display_name, ci.handle, ci.avatar_url, ci.category,
                    COALESCE(ci.price_per_query, 0) AS price_per_query,
                    COALESCE(ch.last_message_at, a.added_at) AS sort_key
                FROM added a
                JOIN clone_identity ci ON ci.clone_id = a.clone_id
                LEFT JOIN chat_history ch ON ch.clone_id = a.clone_id

                UNION

                -- Chats with clones not explicitly added (legacy)
                SELECT
                    ci.clone_id,
                    ch.session_id,
                    ch.last_message_at,
                    ch.last_user_message,
                    ci.display_name, ci.handle, ci.avatar_url, ci.category,
                    COALESCE(ci.price_per_query, 0) AS price_per_query,
                    ch.last_message_at AS sort_key
                FROM chat_history ch
                JOIN clone_identity ci ON ci.clone_id = ch.clone_id
                WHERE ch.clone_id NOT IN (SELECT clone_id FROM added)
            )
            SELECT DISTINCT ON (clone_id)
                clone_id, session_id, last_message_at, last_user_message,
                display_name, handle, avatar_url, category, price_per_query, sort_key
            FROM combined
            ORDER BY clone_id, sort_key DESC NULLS LAST
        """),
        {"uid": caller_user_id},
    )
    # Second sort: overall by sort_key desc
    convs = []
    for r in rows.mappings():
        convs.append({
            "clone_id":          str(r["clone_id"]),
            "session_id":        str(r["session_id"]),
            "last_message_at":   r["last_message_at"].isoformat() if r["last_message_at"] else None,
            "last_user_message": r["last_user_message"],
            "display_name":      r["display_name"],
            "handle":            r["handle"],
            "avatar_url":        r["avatar_url"],
            "category":          r["category"],
            "price_per_query":   float(r["price_per_query"] or 0),
        })
    convs.sort(key=lambda c: c["last_message_at"] or "", reverse=True)
    return {"conversations": convs}


@app.get("/consumer/session")
async def get_consumer_session(
    request: Request,
    clone_id: str | None = Query(default=None),
    clone_handle: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the most recent session_id for a signed-in consumer's conversation with a clone.
    Used to restore conversation continuity after sign-out/sign-in.
    """
    caller_user_id = request.headers.get("X-User-Id") if request else None
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not clone_id and not clone_handle:
        raise HTTPException(status_code=400, detail="clone_id or clone_handle required")

    # Resolve clone_id from handle if needed
    if not clone_id:
        row = await session.execute(
            sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h"),
            {"h": clone_handle},
        )
        r = row.mappings().first()
        if not r:
            raise HTTPException(status_code=404, detail="Clone not found")
        clone_id = str(r["clone_id"])

    row = await session.execute(
        sql_text("""
            SELECT session_id
            FROM reasoning_traces
            WHERE clone_id = :cid
              AND brain_input->>'sender_id' = :uid
              AND (
                brain_input->'owner_mode' = 'false'
                OR brain_input->>'owner_mode' IS NULL
              )
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"cid": clone_id, "uid": caller_user_id},
    )
    r = row.mappings().first()
    if not r:
        return {"session_id": None}
    return {"session_id": str(r["session_id"])}


@app.post("/clones/{handle}/add", status_code=200)
async def add_clone_to_messages(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Add a clone to the caller's home messages list."""
    row = await session.execute(
        sql_text("SELECT clone_id, display_name, access_mode, allowed_emails FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Clone not found")

    # Respect access restrictions
    if record["access_mode"] == "private":
        raise HTTPException(status_code=403, detail="This clone is private")
    if record["access_mode"] == "allowlist":
        # caller_user_id is a Clerk user ID — can't check email here without extra lookup
        # Allowlist enforcement happens at chat time; allow add for now
        pass

    await session.execute(
        sql_text("""
            INSERT INTO consumer_clones (clone_id, consumer_user_id)
            VALUES (:cid, :uid)
            ON CONFLICT (clone_id, consumer_user_id) DO NOTHING
        """),
        {"cid": record["clone_id"], "uid": caller_user_id},
    )
    await session.commit()
    return {"ok": True, "clone_id": str(record["clone_id"]), "display_name": record["display_name"]}


@app.delete("/clones/{handle}/add", status_code=200)
async def remove_clone_from_messages(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Remove a clone from the caller's home messages list."""
    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Clone not found")

    await session.execute(
        sql_text("DELETE FROM consumer_clones WHERE clone_id = :cid AND consumer_user_id = :uid"),
        {"cid": record["clone_id"], "uid": caller_user_id},
    )
    await session.commit()
    return {"ok": True}


@app.get("/clones/{handle}/my-profile")
async def get_consumer_profile(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return what this clone knows about the calling consumer."""
    cid_row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h"), {"h": handle}
    )
    cid_rec = cid_row.mappings().first()
    if not cid_rec:
        raise HTTPException(status_code=404, detail="Clone not found")

    row = await session.execute(
        sql_text("""
            SELECT summary, total_sessions, total_messages, first_session_at, last_session_at
            FROM consumer_profiles WHERE clone_id = :cid AND consumer_user_id = :uid
        """),
        {"cid": str(cid_rec["clone_id"]), "uid": caller_user_id},
    )
    rec = row.mappings().first()
    if not rec:
        return {"exists": False}
    result = dict(rec)
    for k in ("first_session_at", "last_session_at"):
        if result.get(k):
            result[k] = result[k].isoformat()
    result["exists"] = True
    return result


@app.delete("/clones/{handle}/my-profile")
async def delete_consumer_profile(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete the consumer's profile for this clone (GDPR erasure)."""
    cid_row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h"), {"h": handle}
    )
    cid_rec = cid_row.mappings().first()
    if not cid_rec:
        raise HTTPException(status_code=404, detail="Clone not found")

    await session.execute(
        sql_text("DELETE FROM consumer_profiles WHERE clone_id = :cid AND consumer_user_id = :uid"),
        {"cid": str(cid_rec["clone_id"]), "uid": caller_user_id},
    )
    await session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Memory Omitter — blocked-topic rules
# ---------------------------------------------------------------------------

@app.get("/clones/{handle}/omissions")
async def get_omissions(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the owner's blocked-topic rules."""
    row = await session.execute(
        sql_text("SELECT clone_id, user_id, admin_policies FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    if str(rec["user_id"]) != caller_user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")
    policies = rec["admin_policies"] or {}
    return {"rules": policies.get("blocked_topics") or []}


class OmissionAddRequest(BaseModel):
    pattern: str


@app.post("/clones/{handle}/omissions")
async def add_omission(
    handle: str,
    body: OmissionAddRequest,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Add a blocked-topic rule and immediately exclude matching memory chunks."""
    pattern = body.pattern.strip()
    if not pattern:
        raise HTTPException(status_code=422, detail="pattern required")

    row = await session.execute(
        sql_text("SELECT clone_id, user_id, admin_policies FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    if str(rec["user_id"]) != caller_user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    clone_id = str(rec["clone_id"])

    # Bulk-exclude matching chunks
    result = await session.execute(
        sql_text("""
            UPDATE episodic_memory
            SET is_excluded = TRUE
            WHERE clone_id = :cid AND is_excluded = FALSE AND content ILIKE :pat
        """),
        {"cid": clone_id, "pat": f"%{pattern}%"},
    )
    affected = result.rowcount

    # Persist rule
    policies = dict(rec["admin_policies"] or {})
    rules: list = list(policies.get("blocked_topics") or [])
    if not any(r.get("pattern") == pattern for r in rules):
        rules.append({
            "pattern": pattern,
            "created_at": datetime.utcnow().isoformat(),
            "affected": affected,
        })
        policies["blocked_topics"] = rules
        await session.execute(
            sql_text("UPDATE clone_identity SET admin_policies = :p WHERE clone_id = :cid"),
            {"p": json.dumps(policies), "cid": clone_id},
        )

    await session.commit()
    return {"pattern": pattern, "affected": affected}


@app.delete("/clones/{handle}/omissions")
async def remove_omission(
    handle: str,
    pattern: str = Query(...),
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Remove a blocked-topic rule (excluded chunks are NOT automatically restored)."""
    row = await session.execute(
        sql_text("SELECT clone_id, user_id, admin_policies FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    if str(rec["user_id"]) != caller_user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    policies = dict(rec["admin_policies"] or {})
    policies["blocked_topics"] = [r for r in (policies.get("blocked_topics") or []) if r.get("pattern") != pattern]
    await session.execute(
        sql_text("UPDATE clone_identity SET admin_policies = :p WHERE clone_id = :cid"),
        {"p": json.dumps(policies), "cid": str(rec["clone_id"])},
    )
    await session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Marketplace
# ---------------------------------------------------------------------------

_MARKETPLACE_CATEGORIES = {
    "business", "engineering", "design", "marketing", "finance",
    "legal", "healthcare", "education", "science", "other",
}


@app.get("/marketplace")
async def list_marketplace(
    category: str | None = Query(default=None),
    limit: int = Query(default=24, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return listed clones available in the marketplace."""
    cat_filter = "AND ci.category = :category" if category else ""
    params: dict = {"limit": limit, "offset": offset}
    if category:
        params["category"] = category

    rows = await session.execute(
        sql_text(f"""
            SELECT
                ci.clone_id, ci.display_name,
                COALESCE(ci.listing_title, ci.display_name) AS listing_title,
                ci.handle, ci.category,
                ci.listing_description, ci.price_per_query, ci.total_queries,
                ci.total_earnings_usd,
                COALESCE(ci.is_verified, FALSE) AS is_verified,
                ci.avatar_url, ci.listing_banner_url,
                COALESCE(AVG(cr.rating), 0)::FLOAT AS avg_rating,
                COUNT(cr.id)::INT                   AS rating_count,
                (SELECT COUNT(*) FROM episodic_memory em WHERE em.clone_id = ci.clone_id) AS memory_chunks
            FROM clone_identity ci
            LEFT JOIN clone_ratings cr ON cr.clone_id = ci.clone_id
            WHERE ci.is_listed = TRUE AND ci.access_mode = 'public'
            {cat_filter}
            GROUP BY ci.clone_id
            ORDER BY ci.total_queries DESC, avg_rating DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    clones = []
    for row in rows.mappings():
        r = dict(row)
        r["clone_id"] = str(r["clone_id"])
        r["price_per_query"] = float(r["price_per_query"])
        r["total_earnings_usd"] = float(r["total_earnings_usd"])
        clones.append(r)
    return {"clones": clones, "offset": offset, "limit": limit}


@app.get("/marketplace/bundles")
async def list_marketplace_bundles(
    clone_id: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Consumer: list published knowledge bundles."""
    where = "WHERE kb.is_published = TRUE"
    params: dict = {"limit": limit, "offset": offset}
    if clone_id:
        where += " AND kb.clone_id = :clone_id"
        params["clone_id"] = clone_id

    rows = await session.execute(
        sql_text(f"""
            SELECT kb.id, kb.title, kb.description, kb.price_usd, kb.queries_included, kb.created_at,
                   ci.display_name AS creator_name, ci.handle AS creator_handle,
                   COUNT(DISTINCT bcm.clone_id) AS clone_count
            FROM knowledge_bundles kb
            JOIN clone_identity ci ON ci.clone_id = kb.clone_id
            LEFT JOIN bundle_clone_members bcm ON bcm.bundle_id = kb.id
            {where}
            GROUP BY kb.id, ci.display_name, ci.handle
            ORDER BY kb.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    bundles = [dict(r) for r in rows.mappings().all()]
    for b in bundles:
        b["price_usd"] = float(b["price_usd"])
    return {"bundles": bundles}


@app.get("/marketplace/bundles/{bundle_id}")
async def get_marketplace_bundle(
    bundle_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Consumer: get bundle detail including member clones."""
    row = await session.execute(
        sql_text("""
            SELECT kb.id, kb.title, kb.description, kb.price_usd, kb.queries_included,
                   kb.is_published, ci.display_name AS creator_name, ci.handle AS creator_handle
            FROM knowledge_bundles kb
            JOIN clone_identity ci ON ci.clone_id = kb.clone_id
            WHERE kb.id = :bid AND kb.is_published = TRUE
        """),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")

    clones_row = await session.execute(
        sql_text("""
            SELECT ci.clone_id, ci.display_name, ci.handle, ci.category,
                   ci.total_queries, ci.is_verified,
                   COALESCE(AVG(cr.rating), 0) AS avg_rating,
                   COUNT(cr.id) AS rating_count
            FROM bundle_clone_members bcm
            JOIN clone_identity ci ON ci.clone_id = bcm.clone_id
            LEFT JOIN clone_ratings cr ON cr.clone_id = ci.clone_id
            WHERE bcm.bundle_id = :bid
            GROUP BY ci.clone_id, bcm.position
            ORDER BY bcm.position
        """),
        {"bid": bundle_id},
    )
    clones = [dict(r) for r in clones_row.mappings().all()]
    for c in clones:
        c["avg_rating"] = float(c["avg_rating"])
        c["total_queries"] = int(c["total_queries"])

    result = dict(rec)
    result["price_usd"] = float(result["price_usd"])
    result["clones"] = clones
    return result


@app.get("/marketplace/consumer-bundles")
async def list_marketplace_consumer_bundles(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List public consumer bundles for the marketplace."""
    rows = await session.execute(
        sql_text("""
            SELECT cb.id, cb.user_id, cb.title, cb.description, cb.price_usd, cb.created_at,
                   COUNT(cbi.id) AS item_count,
                   COUNT(cbp.id) AS purchase_count
            FROM consumer_bundles cb
            LEFT JOIN consumer_bundle_items cbi ON cbi.bundle_id = cb.id AND cbi.status = 'ready'
            LEFT JOIN consumer_bundle_purchases cbp ON cbp.bundle_id = cb.id AND cbp.amount_paid IS NOT NULL
            WHERE cb.is_public = TRUE
            GROUP BY cb.id
            ORDER BY cb.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": limit, "offset": offset},
    )
    bundles = [dict(r) for r in rows.mappings().all()]
    for b in bundles:
        b["price_usd"] = float(b["price_usd"])
    return {"bundles": bundles}


@app.get("/marketplace/{handle}")
async def get_marketplace_clone(
    handle: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return detailed profile for a marketplace clone."""
    row = await session.execute(
        sql_text("""
            SELECT
                ci.clone_id, ci.display_name,
                COALESCE(ci.listing_title, ci.display_name) AS listing_title,
                ci.handle, ci.category,
                ci.listing_description, ci.price_per_query, ci.total_queries,
                ci.total_earnings_usd, ci.created_at,
                ci.avatar_url, ci.listing_banner_url,
                COALESCE(ci.is_verified, FALSE) AS is_verified,
                ci.verified_at,
                COALESCE(AVG(cr.rating), 0)::FLOAT AS avg_rating,
                COUNT(cr.id)::INT                   AS rating_count
            FROM clone_identity ci
            LEFT JOIN clone_ratings cr ON cr.clone_id = ci.clone_id
            WHERE ci.handle = :handle AND ci.is_listed = TRUE AND ci.access_mode = 'public'
            GROUP BY ci.clone_id
        """),
        {"handle": handle},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Clone not found in marketplace")

    clone_id = record["clone_id"]

    # Memory stats
    mem_row = await session.execute(
        sql_text("""
            SELECT
                (SELECT COUNT(*) FROM episodic_memory  WHERE clone_id = :cid) AS episodic,
                (SELECT COUNT(*) FROM semantic_memory   WHERE clone_id = :cid) AS semantic,
                (SELECT COUNT(*) FROM procedural_memory WHERE clone_id = :cid) AS procedural
        """),
        {"cid": str(clone_id)},
    )
    mem = dict(mem_row.mappings().first() or {})

    # Recent ratings
    ratings_rows = await session.execute(
        sql_text("""
            SELECT rating, review_text, created_at
            FROM clone_ratings
            WHERE clone_id = :cid
            ORDER BY created_at DESC LIMIT 10
        """),
        {"cid": str(clone_id)},
    )
    ratings = []
    for r in ratings_rows.mappings():
        rr = dict(r)
        if rr.get("created_at"):
            rr["created_at"] = rr["created_at"].isoformat()
        ratings.append(rr)

    result = dict(record)
    result["clone_id"] = str(result["clone_id"])
    result["price_per_query"] = float(result["price_per_query"])
    result["total_earnings_usd"] = float(result["total_earnings_usd"])
    if result.get("created_at"):
        result["created_at"] = result["created_at"].isoformat()
    result["memory_stats"] = mem
    result["recent_ratings"] = ratings
    if result.get("verified_at"):
        result["verified_at"] = result["verified_at"].isoformat()
    return result


@app.post("/marketplace/{handle}/rate")
async def rate_clone(
    handle: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Submit or update a rating for a marketplace clone."""
    caller = request.headers.get("X-User-Id")
    if not caller:
        raise HTTPException(status_code=401, detail="Authentication required")

    rating = body.get("rating")
    if not isinstance(rating, int) or not (1 <= rating <= 5):
        raise HTTPException(status_code=422, detail="rating must be 1–5")

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h AND is_listed = TRUE"),
        {"h": handle},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Clone not found")

    await session.execute(
        sql_text("""
            INSERT INTO clone_ratings (clone_id, rater_user_id, rating, review_text)
            VALUES (:cid, :uid, :rating, :review)
            ON CONFLICT (clone_id, rater_user_id)
            DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text
        """),
        {
            "cid": str(record["clone_id"]),
            "uid": caller,
            "rating": rating,
            "review": body.get("review_text", ""),
        },
    )
    await session.commit()
    return {"status": "rated"}


# ---------------------------------------------------------------------------
# Credits (pay-to-query)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# User profiles — one per Clerk user, separate from clone identity
# ---------------------------------------------------------------------------

class UserProfileUpdate(BaseModel):
    full_name: str | None = None
    bio: str | None = None
    location: str | None = None
    website: str | None = None
    dob: str | None = None
    phone: str | None = None


@app.get("/user/profile")
async def get_user_profile(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    row = await session.execute(
        sql_text("SELECT * FROM user_profiles WHERE user_id = :uid"),
        {"uid": user_id},
    )
    rec = row.mappings().first()
    if not rec:
        return {"profile_complete": False, "user_id": user_id}
    return dict(rec)


@app.patch("/user/profile")
async def update_user_profile(
    body: UserProfileUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    await session.execute(
        sql_text("""
            INSERT INTO user_profiles (user_id, full_name, bio, location, website, dob, phone, profile_complete)
            VALUES (:uid, :full_name, :bio, :location, :website, :dob, :phone, TRUE)
            ON CONFLICT (user_id) DO UPDATE SET
                full_name        = EXCLUDED.full_name,
                bio              = EXCLUDED.bio,
                location         = EXCLUDED.location,
                website          = EXCLUDED.website,
                dob              = EXCLUDED.dob,
                phone            = EXCLUDED.phone,
                profile_complete = TRUE,
                updated_at       = NOW()
        """),
        {
            "uid": user_id,
            "full_name": body.full_name,
            "bio": body.bio,
            "location": body.location,
            "website": body.website,
            "dob": body.dob,
            "phone": body.phone,
        },
    )
    await session.commit()
    return {"ok": True}


_CREDIT_PACKS = [
    {"id": "pack_100",  "credits": 100,  "price_usd": 5.00,  "label": "Starter",  "price_id_attr": "stripe_credits_starter_price_id"},
    {"id": "pack_500",  "credits": 500,  "price_usd": 23.00, "label": "Standard", "price_id_attr": "stripe_credits_standard_price_id"},
    {"id": "pack_1000", "credits": 1000, "price_usd": 44.00, "label": "Pro",      "price_id_attr": "stripe_credits_pro_price_id"},
]


@app.get("/credits/balance")
async def get_credits_balance(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    bought_row = await session.execute(
        sql_text("SELECT credits_remaining FROM query_credits WHERE user_id = :uid"),
        {"uid": user_id},
    )
    bought = int((bought_row.mappings().first() or {}).get("credits_remaining") or 0)

    plan = await _refresh_plan_credits(user_id, session)
    await session.commit()

    tier = await _get_user_tier(user_id, session)
    weekly_allowance = TIER_WEEKLY_CREDITS.get(tier, 0)

    return {
        "plan_credits": plan,
        "bought_credits": bought,
        "weekly_allowance": weekly_allowance,
        "total": plan + bought,
        # backwards-compat alias
        "credits_remaining": plan + bought,
        "balance": plan + bought,
    }


@app.get("/credits/packs")
async def list_credit_packs() -> dict:
    return {"packs": _CREDIT_PACKS}


@app.post("/credits/payout")
async def request_payout(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Creator requests a payout of their earned credits.
    Minimum 500 credits ($25). Records a payout_requests row; ops team processes it.
    """
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    clone_id = body.get("clone_id")
    credits = int(body.get("credits", 0))
    min_credits = 500

    if credits < min_credits:
        raise HTTPException(status_code=400, detail=f"Minimum payout is {min_credits} credits")

    # Verify the user owns this clone and has earned enough
    row = await session.execute(
        sql_text("SELECT user_id, total_earnings_usd FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your clone")

    usd_requested = round(credits * 0.05, 2)
    if usd_requested > float(rec["total_earnings_usd"]):
        raise HTTPException(status_code=400, detail="Requested amount exceeds earned balance")

    await session.execute(
        sql_text("""
            INSERT INTO payout_requests (user_id, clone_id, credits_requested, usd_amount, status, created_at)
            VALUES (:uid, :cid, :cr, :usd, 'pending', NOW())
        """),
        {"uid": user_id, "cid": str(clone_id), "cr": credits, "usd": usd_requested},
    )
    await session.commit()
    return {"status": "pending", "credits": credits, "usd_amount": usd_requested}


@app.post("/credits/checkout")
async def create_credits_checkout(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Create a Stripe checkout session to purchase a credit pack."""
    import stripe as stripe_lib

    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    pack_id = body.get("pack_id")
    pack = next((p for p in _CREDIT_PACKS if p["id"] == pack_id), None)
    if not pack:
        raise HTTPException(status_code=422, detail="Invalid pack_id")

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Payments not configured")

    stripe_lib.api_key = settings.stripe_secret_key

    # Use pre-created Stripe price ID if configured, otherwise build inline price_data
    stripe_price_id: str = getattr(settings, pack.get("price_id_attr", ""), "")
    if stripe_price_id:
        line_item = {"price": stripe_price_id, "quantity": 1}
    else:
        price_cents = int(pack["price_usd"] * 100)
        line_item = {
            "price_data": {
                "currency": "usd",
                "unit_amount": price_cents,
                "product_data": {
                    "name": f"Doppel Credits — {pack['label']} ({pack['credits']} queries)",
                },
            },
            "quantity": 1,
        }

    session_obj = stripe_lib.checkout.Session.create(
        payment_method_types=["card"],
        mode="payment",
        line_items=[line_item],
        billing_address_collection="required",
        invoice_creation={"enabled": True},
        metadata={"user_id": user_id, "credits": str(pack["credits"]), "pack_id": pack_id},
        success_url=f"{settings.app_url}/dashboard/credits?success=1",
        cancel_url=f"{settings.app_url}/dashboard/credits?cancelled=1",
    )

    # Record pending session
    await session.execute(
        sql_text("""
            INSERT INTO stripe_credit_sessions (user_id, stripe_session_id, credits, status)
            VALUES (:uid, :sid, :credits, 'pending')
        """),
        {"uid": user_id, "sid": session_obj.id, "credits": pack["credits"]},
    )
    await session.commit()
    return {"checkout_url": session_obj.url}


@app.post("/credits/webhook")
async def stripe_credits_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Handle Stripe webhook to fulfill purchased credits."""
    import stripe as stripe_lib

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if not settings.stripe_webhook_secret or not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Payments not configured")

    stripe_lib.api_key = settings.stripe_secret_key
    try:
        event = stripe_lib.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event["type"] == "checkout.session.completed":
        stripe_session = event["data"]["object"]
        metadata = stripe_session.get("metadata", {})
        user_id = metadata.get("user_id")
        credits = int(metadata.get("credits", 0))
        stripe_session_id = stripe_session["id"]

        payment_type = metadata.get("type", "credits")

        if payment_type == "bundle":
            bundle_id = metadata.get("bundle_id")
            if bundle_id and user_id:
                amount_paid = float(metadata.get("amount", 0))
                # Set queries_remaining from bundle's queries_included
                qi_row = await session.execute(
                    sql_text("SELECT queries_included FROM knowledge_bundles WHERE id = :bid"),
                    {"bid": bundle_id},
                )
                qi_rec = qi_row.mappings().first()
                queries_included = int(qi_rec["queries_included"]) if qi_rec else 0
                await session.execute(
                    sql_text("""
                        UPDATE bundle_purchases
                        SET amount_paid = :amount, stripe_session_id = :sid,
                            queries_remaining = :qi
                        WHERE bundle_id = :bid AND user_id = :uid
                    """),
                    {"amount": amount_paid, "sid": stripe_session_id, "bid": bundle_id, "uid": user_id, "qi": queries_included},
                )
                # Rev share to creator (tier-dependent)
                if amount_paid > 0:
                    tier_row = await session.execute(
                        sql_text("""
                            SELECT ci.subscription_tier FROM clone_identity ci
                            JOIN knowledge_bundles kb ON ci.clone_id = kb.clone_id
                            WHERE kb.id = :bid
                        """),
                        {"bid": bundle_id},
                    )
                    tier_rec = tier_row.mappings().first()
                    bundle_tier = (tier_rec["subscription_tier"] or "free") if tier_rec else "free"
                    bundle_share = REV_SHARE.get(bundle_tier, 0.70)
                    await session.execute(
                        sql_text("""
                            UPDATE clone_identity ci
                            SET total_earnings_usd = total_earnings_usd + :earn
                            FROM knowledge_bundles kb
                            WHERE kb.id = :bid AND ci.clone_id = kb.clone_id
                        """),
                        {"earn": amount_paid * bundle_share, "bid": bundle_id},
                    )
                await session.commit()
        elif payment_type == "consumer_bundle":
            bundle_id = metadata.get("bundle_id")
            if bundle_id and user_id:
                amount_paid = float(metadata.get("amount", 0))
                await session.execute(
                    sql_text("""
                        UPDATE consumer_bundle_purchases
                        SET amount_paid = :amount, stripe_session_id = :sid
                        WHERE bundle_id = :bid AND user_id = :uid
                    """),
                    {"amount": amount_paid, "sid": stripe_session_id, "bid": bundle_id, "uid": user_id},
                )
                await session.commit()
        elif user_id and credits > 0:
            # Mark session complete
            await session.execute(
                sql_text("UPDATE stripe_credit_sessions SET status='complete' WHERE stripe_session_id=:sid"),
                {"sid": stripe_session_id},
            )
            # Upsert credits balance
            await session.execute(
                sql_text("""
                    INSERT INTO query_credits (user_id, credits_remaining, updated_at)
                    VALUES (:uid, :credits, NOW())
                    ON CONFLICT (user_id)
                    DO UPDATE SET credits_remaining = query_credits.credits_remaining + :credits,
                                  updated_at = NOW()
                """),
                {"uid": user_id, "credits": credits},
            )
            await session.commit()

    return {"received": True}


# ---------------------------------------------------------------------------
# Creator earnings
# ---------------------------------------------------------------------------

@app.get("/dashboard/earnings")
async def get_earnings(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return earnings and query volume stats for a clone creator."""
    row = await session.execute(
        sql_text("""
            SELECT display_name, total_queries, total_earnings_usd, price_per_query, is_listed
            FROM clone_identity WHERE clone_id = :cid
        """),
        {"cid": str(clone_id)},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="Clone not found")

    # Query volume over time (last 30 days)
    timeline_rows = await session.execute(
        sql_text("""
            SELECT DATE(created_at) AS day, COUNT(*) AS queries
            FROM query_transactions
            WHERE clone_id = :cid AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        """),
        {"cid": str(clone_id)},
    )
    timeline = [{"day": str(r["day"]), "queries": r["queries"]} for r in timeline_rows.mappings()]

    # Ratings summary
    rating_row = await session.execute(
        sql_text("""
            SELECT COALESCE(AVG(rating), 0)::FLOAT AS avg_rating, COUNT(*)::INT AS count
            FROM clone_ratings WHERE clone_id = :cid
        """),
        {"cid": str(clone_id)},
    )
    rating_rec = dict(rating_row.mappings().first() or {})

    return {
        "display_name": record["display_name"],
        "is_listed": record["is_listed"],
        "total_queries": record["total_queries"],
        "total_earnings_usd": float(record["total_earnings_usd"]),
        "price_per_query": float(record["price_per_query"]),
        "avg_rating": rating_rec.get("avg_rating", 0.0),
        "rating_count": rating_rec.get("count", 0),
        "query_timeline": timeline,
    }


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
# Shared chat helpers — credit deduction + consumer context injection
# ---------------------------------------------------------------------------

async def _handle_chat_credits_and_context(
    body: BrainInput,
    caller_user_id: str | None,
    session: AsyncSession,
) -> BrainInput:
    """
    Shared pre-processing for /brain/chat and /brain/chat/stream:
    1. Deducts credits (personal or org pool) if clone has a price.
    2. Increments query counter.
    3. Injects consumer profile context into body metadata.
    4. Injects consumer brain memories into body metadata.
    Returns the (possibly updated) BrainInput.
    """
    price_row = await session.execute(
        sql_text("SELECT user_id, price_per_query, is_listed, subscription_tier FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(body.clone_id)},
    )
    price_rec = price_row.mappings().first()
    caller_is_owner = bool(caller_user_id and price_rec and caller_user_id == price_rec["user_id"])
    is_paid = (
        price_rec
        and float(price_rec["price_per_query"]) > 0
        and not (caller_is_owner and body.owner_mode)
    )

    if is_paid:
        if not caller_user_id:
            raise HTTPException(status_code=401, detail="Login required to query this clone")
        multiplier = CREDITS_MULTIPLIER.get(body.response_mode, 1)
        credits_cost = int(float(price_rec["price_per_query"])) * multiplier

        org_pair = (await session.execute(
            sql_text("""
                SELECT om_caller.org_id AS org_id
                FROM org_memberships om_caller
                JOIN org_memberships om_owner ON om_owner.org_id = om_caller.org_id
                WHERE om_caller.user_id = :caller AND om_owner.user_id = :owner
                LIMIT 1
            """),
            {"caller": caller_user_id, "owner": price_rec["user_id"]},
        )).mappings().first()

        if org_pair:
            org_id = str(org_pair["org_id"])
            pool_rec = (await session.execute(
                sql_text("SELECT credits FROM org_credit_pools WHERE org_id = :oid"),
                {"oid": org_id},
            )).mappings().first()
            if not pool_rec or pool_rec["credits"] < credits_cost:
                raise HTTPException(status_code=402, detail=f"Org credit pool insufficient (need {credits_cost}). Ask your admin to top up the pool.")
            await session.execute(
                sql_text("UPDATE org_credit_pools SET credits = credits - :cost, updated_at = NOW() WHERE org_id = :oid"),
                {"cost": credits_cost, "oid": org_id},
            )
        else:
            await _deduct_personal_credits(caller_user_id, credits_cost, session)

        await session.execute(
            sql_text("INSERT INTO query_transactions (user_id, clone_id, credits_used, response_mode) VALUES (:uid, :cid, :cost, :mode)"),
            {"uid": caller_user_id, "cid": str(body.clone_id), "cost": credits_cost, "mode": body.response_mode},
        )
        if not caller_is_owner:
            creator_tier = price_rec["subscription_tier"] or "free"
            creator_earn = credits_cost * 0.04 * REV_SHARE.get(creator_tier, 0.70)
            await session.execute(
                sql_text("""
                    UPDATE clone_identity
                    SET total_queries = total_queries + 1,
                        total_earnings_usd = total_earnings_usd + :earn
                    WHERE clone_id = :cid
                """),
                {"earn": creator_earn, "cid": str(body.clone_id)},
            )
        await session.commit()
    elif price_rec:
        await session.execute(
            sql_text("UPDATE clone_identity SET total_queries = total_queries + 1 WHERE clone_id = :cid"),
            {"cid": str(body.clone_id)},
        )
        await session.commit()

    # Consumer profile: inject cross-session summary
    # Uses a separate DB session so any schema errors (e.g. table not yet migrated)
    # cannot corrupt the main request session.
    if caller_user_id:
        try:
            async with AsyncSessionLocal() as cp_session:
                profile_row = await cp_session.execute(
                    sql_text("SELECT summary FROM consumer_profiles WHERE clone_id = :cid AND consumer_user_id = :uid"),
                    {"cid": str(body.clone_id), "uid": caller_user_id},
                )
                profile_rec = profile_row.mappings().first()
                if profile_rec and profile_rec["summary"]:
                    body = body.model_copy(update={"metadata": {**body.metadata, "consumer_context": profile_rec["summary"]}})
                await cp_session.execute(
                    sql_text("""
                        INSERT INTO consumer_profiles (clone_id, consumer_user_id, total_sessions, total_messages, last_session_at)
                        VALUES (:cid, :uid, 1, 1, NOW())
                        ON CONFLICT (clone_id, consumer_user_id) DO UPDATE
                        SET total_messages = consumer_profiles.total_messages + 1,
                            last_session_at = NOW()
                    """),
                    {"cid": str(body.clone_id), "uid": caller_user_id},
                )
                await cp_session.commit()
        except Exception as _cp_err:
            _log.warning("consumer_profiles update skipped: %s", _cp_err)

    return body


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
    caller_email = request.headers.get("X-User-Email")
    _t0 = time.monotonic()

    from doppel.brain.db.connection import AsyncSessionLocal

    async def _access():
        async with AsyncSessionLocal() as s:
            await _check_clone_access(body.clone_id, caller_user_id, caller_email, s)

    async def _rate():
        async with AsyncSessionLocal() as s:
            await _check_rate_limit(body.clone_id, s)

    await asyncio.gather(_access(), _rate())
    _log.info("[TIMING] preflight done in %.0fms", (time.monotonic() - _t0) * 1000)

    if caller_user_id:
        body, consumer_brain_ctx, consumer_ctx = await asyncio.gather(
            _handle_chat_credits_and_context(body, caller_user_id, session),
            _retrieve_consumer_brain(caller_user_id, body.message, session),
            _build_consumer_context(caller_user_id),
        )
        metadata = dict(body.metadata)
        if consumer_brain_ctx:
            metadata["consumer_brain"] = consumer_brain_ctx
        if consumer_ctx:
            metadata["consumer_context"] = consumer_ctx
        if metadata != body.metadata:
            body = body.model_copy(update={"metadata": metadata})
        asyncio.create_task(
            _maybe_update_consumer_profile(str(body.clone_id), caller_user_id, str(body.session_id))
        )
    else:
        body = await _handle_chat_credits_and_context(body, caller_user_id, session)

    _log.info("[TIMING] credits+context done in %.0fms", (time.monotonic() - _t0) * 1000)
    await load_clone_keys(session, body.clone_id)
    _log.info("[TIMING] keys loaded in %.0fms — starting brain (model=%s)", (time.monotonic() - _t0) * 1000, settings.fast_reasoning_model)

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
    caller_email = request.headers.get("X-User-Email")

    from doppel.brain.db.connection import AsyncSessionLocal

    async def _access():
        async with AsyncSessionLocal() as s:
            await _check_clone_access(body.clone_id, caller_user_id, caller_email, s)

    async def _rate():
        async with AsyncSessionLocal() as s:
            await _check_rate_limit(body.clone_id, s)

    await asyncio.gather(_access(), _rate())

    if caller_user_id:
        body, consumer_brain_ctx, consumer_ctx = await asyncio.gather(
            _handle_chat_credits_and_context(body, caller_user_id, session),
            _retrieve_consumer_brain(caller_user_id, body.message, session),
            _build_consumer_context(caller_user_id),
        )
        metadata = dict(body.metadata)
        if consumer_brain_ctx:
            metadata["consumer_brain"] = consumer_brain_ctx
        if consumer_ctx:
            metadata["consumer_context"] = consumer_ctx
        if metadata != body.metadata:
            body = body.model_copy(update={"metadata": metadata})
    else:
        body = await _handle_chat_credits_and_context(body, caller_user_id, session)

    await load_clone_keys(session, body.clone_id)
    brain = DoppelBrain(session=session, clone_id=body.clone_id)
    try:
        result = await brain.process(body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.error("brain.process failed clone_id=%s: %s", body.clone_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Brain processing error")
    if caller_user_id:
        asyncio.create_task(
            _maybe_update_consumer_profile(str(body.clone_id), caller_user_id, str(body.session_id))
        )
    return result


async def _retrieve_consumer_brain(
    consumer_user_id: str,
    message: str,
    session: AsyncSession,  # kept for signature compat but not used — own session below
    top_k: int = 6,
) -> str | None:
    """Retrieve the most relevant consumer memories for a given message."""
    try:
        # Check existence before paying for the embed call
        async with AsyncSessionLocal() as cb_session:
            exists_row = await cb_session.execute(
                sql_text("SELECT 1 FROM consumer_memory WHERE consumer_user_id = :uid AND embedding IS NOT NULL LIMIT 1"),
                {"uid": consumer_user_id},
            )
            if not exists_row.first():
                return None

        from doppel.brain.db.vector import embed_batch
        embeddings = await embed_batch([message])
        vec_literal = "[" + ",".join(str(v) for v in embeddings[0]) + "]"
        async with AsyncSessionLocal() as cb_session:
            rows = await cb_session.execute(
                sql_text("""
                    SELECT content, category,
                           1 - (embedding <=> :emb::vector) AS similarity
                    FROM consumer_memory
                    WHERE consumer_user_id = :uid
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> :emb::vector
                    LIMIT :k
                """),
                {"uid": consumer_user_id, "emb": vec_literal, "k": top_k},
            )
            results = rows.mappings().all()
        if not results:
            return None
        lines = [f"- [{r['category']}] {r['content']}" for r in results if r["similarity"] > 0.3]
        return "\n".join(lines) if lines else None
    except Exception:
        return None


async def _build_consumer_context(consumer_user_id: str) -> str | None:
    """
    Build a structured profile context from the user's background/expertise memories.
    Used to calibrate clone response depth and tone (CEO vs junior employee, etc).
    Injected as consumer_context → "About the person you're talking to" in the system prompt.
    """
    try:
        async with AsyncSessionLocal() as s:
            rows = await s.execute(
                sql_text("""
                    SELECT content, category
                    FROM consumer_memory
                    WHERE consumer_user_id = :uid
                      AND category IN ('background', 'expertise', 'role', 'preference')
                    ORDER BY
                      CASE category
                        WHEN 'role'       THEN 1
                        WHEN 'background' THEN 2
                        WHEN 'expertise'  THEN 3
                        WHEN 'preference' THEN 4
                        ELSE 5
                      END,
                      created_at ASC
                    LIMIT 20
                """),
                {"uid": consumer_user_id},
            )
            results = rows.mappings().all()
        if not results:
            return None
        lines = [r["content"] for r in results]
        return "The person you're speaking with:\n" + "\n".join(f"- {l}" for l in lines)
    except Exception:
        return None


async def _maybe_update_consumer_profile(clone_id: str, consumer_user_id: str, session_id: str) -> None:
    """Update consumer profile summary every 5 messages using LLM synthesis."""
    try:
        from doppel.brain.db.connection import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            # Only update every 5th message
            row = await db.execute(
                sql_text("SELECT total_messages FROM consumer_profiles WHERE clone_id = :cid AND consumer_user_id = :uid"),
                {"cid": clone_id, "uid": consumer_user_id},
            )
            rec = row.mappings().first()
            if not rec or rec["total_messages"] % 5 != 0:
                return
            # Fetch last 10 traces for this session
            traces_row = await db.execute(
                sql_text("""
                    SELECT (brain_input->>'message') AS msg, response
                    FROM reasoning_traces
                    WHERE session_id = :sid
                    ORDER BY created_at DESC LIMIT 10
                """),
                {"sid": session_id},
            )
            traces = traces_row.mappings().all()
            if not traces:
                return
            convo = "\n".join(f"User: {t['msg']}\nClone: {t['response']}" for t in reversed(traces) if t.get("msg"))
            if not convo:
                return
            from doppel.brain.context import get_anthropic_client
            client = get_anthropic_client()
            resp = await client.messages.create(
                model=settings.classification_model,
                max_tokens=200,
                messages=[{"role": "user", "content": (
                    f"Based on this conversation, write 2–3 sentences summarising what the clone should remember about this person "
                    f"for future conversations. Focus on their goals, context, and what they care about.\n\n{convo}"
                )}],
            )
            summary = resp.content[0].text.strip()
            await db.execute(
                sql_text("""
                    UPDATE consumer_profiles
                    SET summary = :summary, last_session_at = NOW()
                    WHERE clone_id = :cid AND consumer_user_id = :uid
                """),
                {"summary": summary, "cid": clone_id, "uid": consumer_user_id},
            )
            await db.commit()
    except Exception as exc:
        _log.warning("_maybe_update_consumer_profile failed: %s", exc)


# ---------------------------------------------------------------------------
# Brain — activity / reasoning traces
# ---------------------------------------------------------------------------

@app.get("/brain/traces")
async def get_traces(
    clone_id: UUID = Query(...),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    mode: str = Query(default="owner", regex="^(owner|consumer|all)$"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return recent reasoning traces for the activity log.

    mode=owner    — only traces where the clone owner was chatting (training/testing)
    mode=consumer — only traces from marketplace users chatting with the clone
    mode=all      — every trace regardless of caller type
    """
    if mode == "owner":
        mode_filter = "AND (brain_input->>'owner_mode')::boolean = TRUE"
    elif mode == "consumer":
        mode_filter = "AND (brain_input->>'owner_mode')::boolean = FALSE"
    else:
        mode_filter = ""

    rows = await session.execute(
        sql_text(f"""
            SELECT id, session_id, path, confidence, feedback_signal,
                   brain_input->>'message'   AS input_message,
                   brain_input->>'sender_id' AS sender_id,
                   response, latency_ms, needs_escalation, created_at
            FROM reasoning_traces
            WHERE clone_id = :clone_id
              {mode_filter}
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
    return {"traces": traces, "offset": offset, "limit": limit, "mode": mode}


@app.delete("/brain/traces", status_code=200)
async def delete_traces(
    request: Request,
    clone_id: UUID = Query(...),
    mode: str = Query(default="all", regex="^(owner|consumer|all)$"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete reasoning traces for a clone. Caller must be the clone owner.

    mode=owner    — delete only owner-mode traces
    mode=consumer — delete only consumer-mode traces
    mode=all      — delete all traces for this clone
    """
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")

    owner_row = await session.execute(
        sql_text("SELECT user_id FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    owner_rec = owner_row.mappings().first()
    if not owner_rec or owner_rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=403, detail="You do not own this clone")

    if mode == "owner":
        mode_filter = "AND (brain_input->>'owner_mode')::boolean = TRUE"
    elif mode == "consumer":
        mode_filter = "AND (brain_input->>'owner_mode')::boolean = FALSE"
    else:
        mode_filter = ""

    result = await session.execute(
        sql_text(f"""
            DELETE FROM reasoning_traces
            WHERE clone_id = :cid
              {mode_filter}
        """),
        {"cid": str(clone_id)},
    )
    await session.commit()
    return {"deleted": result.rowcount, "mode": mode}


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
              AND (brain_input->>'owner_mode')::boolean = TRUE
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
              AND (brain_input->>'owner_mode')::boolean = TRUE
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
# Brain — session message history
# ---------------------------------------------------------------------------

@app.get("/brain/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the chat history for a session, ordered chronologically."""
    rows = await session.execute(
        sql_text("""
            SELECT
                brain_input->>'message' AS user_message,
                response                AS clone_message,
                path,
                confidence,
                created_at
            FROM reasoning_traces
            WHERE session_id = :sid
            ORDER BY created_at ASC
            LIMIT 200
        """),
        {"sid": session_id},
    )
    messages = []
    for r in rows.mappings():
        messages.append({
            "role": "user",
            "content": r["user_message"],
            "timestamp": r["created_at"].isoformat() if r["created_at"] else None,
        })
        messages.append({
            "role": "clone",
            "content": r["clone_message"],
            "path_taken": r["path"],
            "confidence": float(r["confidence"]) if r["confidence"] is not None else None,
            "timestamp": r["created_at"].isoformat() if r["created_at"] else None,
        })
    return {"messages": messages, "session_id": session_id}


# ---------------------------------------------------------------------------
# Brain — session summary export
# ---------------------------------------------------------------------------

@app.post("/brain/summary")
async def brain_summary(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Generate a structured markdown summary of a chat session.
    Fetches the last 20 traces for session_id, calls LLM to produce
    Key Insights / Recommendations / Action Items.
    Costs 2 credits for paid clones.
    """
    clone_id = body.get("clone_id")
    session_id = body.get("session_id")
    if not clone_id or not session_id:
        raise HTTPException(status_code=400, detail="clone_id and session_id required")

    caller_user_id = request.headers.get("X-User-Id")

    # Credit check: 2 credits for paid clones
    price_row = await session.execute(
        sql_text("SELECT user_id, price_per_query, is_listed, display_name FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    price_rec = price_row.mappings().first()
    if not price_rec:
        raise HTTPException(status_code=404, detail="Clone not found")

    clone_name = price_rec["display_name"]
    is_paid = price_rec["is_listed"] and float(price_rec["price_per_query"]) > 0 and caller_user_id != price_rec["user_id"]

    if is_paid:
        if not caller_user_id:
            raise HTTPException(status_code=401, detail="Login required")
        await _deduct_personal_credits(caller_user_id, 2, session)
        await session.commit()

    # Fetch last 20 traces for this session
    traces_row = await session.execute(
        sql_text("""
            SELECT (brain_input->>'message') AS user_msg, response
            FROM reasoning_traces
            WHERE session_id = :sid
            ORDER BY created_at ASC LIMIT 20
        """),
        {"sid": str(session_id)},
    )
    traces = traces_row.mappings().all()
    if not traces:
        raise HTTPException(status_code=404, detail="No conversation found for this session")

    convo = "\n".join(
        f"User: {t['user_msg']}\n{clone_name}: {t['response']}"
        for t in traces
        if t.get("user_msg")
    )

    from doppel.brain.context import get_anthropic_client
    client = get_anthropic_client()
    resp = await client.messages.create(
        model=settings.reasoning_model,
        max_tokens=800,
        messages=[{"role": "user", "content": (
            f"You are summarising a conversation between a user and {clone_name}'s AI knowledge clone.\n\n"
            f"Conversation:\n{convo}\n\n"
            "Produce a concise structured summary in markdown with exactly these three sections:\n"
            "## Key Insights\n- bullet 1\n- bullet 2\n...\n\n"
            "## Recommendations\n- bullet 1\n- bullet 2\n...\n\n"
            "## Action Items\n1. item 1\n2. item 2\n..."
        )}],
    )
    summary_text = resp.content[0].text.strip()
    return {"summary": summary_text, "format": "markdown", "clone_name": clone_name}


@app.post("/brain/training/save")
async def brain_training_save(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Save a training session to the appropriate brain.
    - is_owner=True: embeds Q&A exchange as knowledge chunks into the clone's memory.
    - is_owner=False: summarises what the clone learned about the consumer,
      upserts consumer_profiles.
    """
    clone_id = body.get("clone_id")
    session_id = body.get("session_id")
    is_owner: bool = bool(body.get("is_owner", False))
    if not clone_id or not session_id:
        raise HTTPException(status_code=400, detail="clone_id and session_id required")

    caller_user_id = request.headers.get("X-User-Id")

    # Fetch clone metadata
    clone_row = await session.execute(
        sql_text("SELECT user_id, display_name FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    clone_rec = clone_row.mappings().first()
    if not clone_rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    clone_name = clone_rec["display_name"]

    # Fetch conversation traces for this session
    traces_row = await session.execute(
        sql_text("""
            SELECT (brain_input->>'message') AS user_msg, response
            FROM reasoning_traces
            WHERE session_id = :sid
            ORDER BY created_at ASC LIMIT 40
        """),
        {"sid": str(session_id)},
    )
    traces = [t for t in traces_row.mappings().all() if t.get("user_msg") and t.get("response")]
    if not traces:
        raise HTTPException(status_code=404, detail="No conversation found for this session")

    from doppel.brain.context import get_anthropic_client
    client = get_anthropic_client()

    if is_owner:
        # Embed each Q&A turn as a knowledge chunk in the clone's memory
        from doppel.ingestion.pipeline import _store_chunk_with_embedding
        from doppel.brain.db.vector import embed_batch
        from doppel.ingestion.connectors.base import RawItem
        from datetime import datetime, timezone

        await load_clone_keys(session, clone_id)
        chunks = []
        for t in traces:
            chunk = f"Q: {t['user_msg']}\nA: {t['response']}"
            chunks.append(chunk)

        embeddings = await embed_batch(chunks)
        now = datetime.now(timezone.utc)
        for chunk, embedding in zip(chunks, embeddings):
            item = RawItem(
                content=chunk,
                source="training_session",
                authored_by_user=True,
                context_type="conversation",
                created_at=now,
            )
            await _store_chunk_with_embedding(
                session=session,
                clone_id=clone_id,
                content=chunk,
                embedding=embedding,
                item=item,
                formality=0.5,
            )
        await session.commit()
        return {"saved": len(chunks), "type": "knowledge_chunks"}

    else:
        # Summarise what was learned about the consumer, upsert consumer_profiles
        if not caller_user_id:
            raise HTTPException(status_code=401, detail="Login required")

        convo = "\n".join(
            f"Clone: {t['response']}\nUser: {t['user_msg']}" for t in traces
        )
        resp = await client.messages.create(
            model=settings.reasoning_model,
            max_tokens=400,
            messages=[{"role": "user", "content": (
                f"{clone_name}'s AI clone just had a training conversation with a user. "
                f"Based on this conversation, write 2–3 sentences summarising what the clone "
                f"learned about this person — their background, goals, preferences, and context.\n\n"
                f"Conversation:\n{convo}"
            )}],
        )
        summary = resp.content[0].text.strip()
        await session.execute(
            sql_text("""
                INSERT INTO consumer_profiles (clone_id, consumer_user_id, summary, last_session_at, total_sessions, total_messages)
                VALUES (:cid, :uid, :summary, NOW(), 1, :msgs)
                ON CONFLICT (clone_id, consumer_user_id) DO UPDATE SET
                    summary = :summary,
                    last_session_at = NOW(),
                    total_sessions = consumer_profiles.total_sessions + 1,
                    total_messages = consumer_profiles.total_messages + :msgs
            """),
            {"cid": str(clone_id), "uid": caller_user_id, "summary": summary, "msgs": len(traces)},
        )
        await session.commit()
        return {"saved": len(traces), "type": "consumer_profile", "summary": summary}


# ---------------------------------------------------------------------------
# Synthesis — multi-clone query + deliberation
# ---------------------------------------------------------------------------

@app.post("/synthesis/query")
async def synthesis_query(body: dict, request: Request) -> dict:
    """
    Query 2–5 clones with the same message in parallel.
    Returns per-clone perspectives + a synthesized answer.
    Costs 1 credit per clone queried.
    """
    clone_ids: list[str] = body.get("clone_ids", [])
    message: str = body.get("message", "").strip()
    caller_user_id = request.headers.get("X-User-Id")

    if not clone_ids or len(clone_ids) < 2 or len(clone_ids) > 5:
        raise HTTPException(status_code=400, detail="Provide 2–5 clone IDs")
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required for synthesis")

    n = len(clone_ids)
    # Pre-check balance (plan + bought combined) without deducting yet
    async with AsyncSessionLocal() as db:
        _plan_bal = await _refresh_plan_credits(caller_user_id, db)
        _bought_row = await db.execute(
            sql_text("SELECT credits_remaining FROM query_credits WHERE user_id = :uid"),
            {"uid": caller_user_id},
        )
        _bought_bal = int((_bought_row.mappings().first() or {}).get("credits_remaining") or 0)
        if _plan_bal + _bought_bal < n:
            raise HTTPException(status_code=402, detail=f"Insufficient credits (need {n})")

    async def _query_one(clone_id: str) -> dict:
        try:
            async with AsyncSessionLocal() as db:
                await load_clone_keys(db, clone_id)
                row = await db.execute(
                    sql_text("SELECT display_name FROM clone_identity WHERE clone_id = :cid"),
                    {"cid": clone_id},
                )
                rec = row.mappings().first()
                name = rec["display_name"] if rec else "Unknown"
                b = BrainInput(clone_id=clone_id, message=message, sender_id=caller_user_id)
                brain = DoppelBrain(session=db, clone_id=clone_id)
                result = await brain.process(b)
            return {"clone_id": clone_id, "name": name, "response": result.response, "confidence": result.confidence or 0.9}
        except Exception as exc:
            return {"clone_id": clone_id, "name": "Unknown", "error": str(exc)}

    perspectives = await asyncio.gather(*[_query_one(cid) for cid in clone_ids])
    valid = [p for p in perspectives if "error" not in p]
    credits_used = len(valid)

    if credits_used > 0:
        async with AsyncSessionLocal() as db:
            await _deduct_personal_credits(caller_user_id, credits_used, db)
            await db.commit()

    from doppel.brain.context import get_anthropic_client
    client = get_anthropic_client()
    persp_text = "\n\n".join(f"**{p['name']}:** {p['response']}" for p in valid)
    resp = await client.messages.create(
        model=settings.reasoning_model,
        max_tokens=400,
        messages=[{"role": "user", "content": (
            f"Question: {message}\n\n"
            f"Perspectives from {len(valid)} experts:\n\n{persp_text}\n\n"
            "Synthesize these into a 150–200 word unified answer. Highlight agreements and divergences. Be direct."
        )}],
    )
    synthesis = resp.content[0].text.strip()
    return {"perspectives": valid, "synthesis": synthesis, "credits_used": credits_used}


@app.post("/synthesis/deliberate")
async def synthesis_deliberate(body: dict, request: Request) -> dict:
    """
    Two clones debate a topic back and forth for N rounds.
    Each turn costs 1 credit. Total = rounds × 2 credits.
    """
    clone_ids: list[str] = body.get("clone_ids", [])
    topic: str = body.get("topic", "").strip()
    rounds: int = min(max(int(body.get("rounds", 3)), 2), 5)
    caller_user_id = request.headers.get("X-User-Id")

    if len(clone_ids) != 2:
        raise HTTPException(status_code=400, detail="Exactly 2 clone IDs required")
    if not topic:
        raise HTTPException(status_code=400, detail="topic is required")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required for deliberation")

    total_credits = rounds * 2
    async with AsyncSessionLocal() as db:
        _plan_bal = await _refresh_plan_credits(caller_user_id, db)
        _bought_row = await db.execute(
            sql_text("SELECT credits_remaining FROM query_credits WHERE user_id = :uid"),
            {"uid": caller_user_id},
        )
        _bought_bal = int((_bought_row.mappings().first() or {}).get("credits_remaining") or 0)
        if _plan_bal + _bought_bal < total_credits:
            raise HTTPException(status_code=402, detail=f"Insufficient credits (need {total_credits} for {rounds} rounds)")

    names: dict[str, str] = {}
    async with AsyncSessionLocal() as db:
        for cid in clone_ids:
            row = await db.execute(
                sql_text("SELECT display_name FROM clone_identity WHERE clone_id = :cid"),
                {"cid": cid},
            )
            rec = row.mappings().first()
            names[cid] = rec["display_name"] if rec else "Unknown"

    turns: list[dict] = []
    prev_message = topic

    for round_num in range(1, rounds + 1):
        for i, cid in enumerate(clone_ids):
            other_name = names[clone_ids[1 - i]]
            if turns:
                prompt = (
                    f"You are deliberating on: '{topic}'.\n"
                    f"{other_name} just said: {prev_message}\n"
                    "Respond in 3–5 sentences. Add new insight, challenge or build on what was said. Be direct."
                )
            else:
                prompt = (
                    f"You are starting a deliberation on: '{topic}'.\n"
                    "Share your initial perspective in 3–5 sentences. Be direct and concrete."
                )
            async with AsyncSessionLocal() as db:
                await load_clone_keys(db, cid)
                b = BrainInput(clone_id=cid, message=prompt, sender_id=caller_user_id)
                brain = DoppelBrain(session=db, clone_id=cid)
                result = await brain.process(b)
            prev_message = result.response
            turns.append({"clone_id": cid, "name": names[cid], "message": result.response, "round": round_num})

    async with AsyncSessionLocal() as db:
        await _deduct_personal_credits(caller_user_id, total_credits, db)
        await db.commit()

    from doppel.brain.context import get_anthropic_client
    client = get_anthropic_client()
    transcript = "\n".join(f"{t['name']} (round {t['round']}): {t['message']}" for t in turns)
    resp = await client.messages.create(
        model=settings.reasoning_model,
        max_tokens=300,
        messages=[{"role": "user", "content": (
            f"Topic: {topic}\n\nDeliberation transcript:\n{transcript}\n\n"
            "Summarize key points of agreement and disagreement in 100–150 words. Be concise."
        )}],
    )
    return {"turns": turns, "summary": resp.content[0].text.strip(), "credits_used": total_credits}


# ---------------------------------------------------------------------------
# Knowledge Bundles
# ---------------------------------------------------------------------------

def _require_bundle_owner(caller_user_id: str | None, owner_user_id: str) -> None:
    if not caller_user_id or caller_user_id != owner_user_id:
        raise HTTPException(status_code=403, detail="Not the bundle owner")


@app.post("/clones/{handle}/bundles", status_code=201)
async def create_bundle(
    handle: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Creator: create a new knowledge bundle."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    result = await session.execute(
        sql_text("""
            INSERT INTO knowledge_bundles (clone_id, title, description, price_usd, queries_included)
            VALUES (:cid, :title, :desc, :price, :qi)
            RETURNING id, title, description, price_usd, queries_included, is_published, created_at
        """),
        {
            "cid": str(rec["clone_id"]),
            "title": title,
            "desc": (body.get("description") or "").strip() or None,
            "price": float(body.get("price_usd", 0.00)),
            "qi": int(body.get("queries_included", 0)),
        },
    )
    await session.commit()
    row_out = result.mappings().first()
    out = dict(row_out)
    out["price_usd"] = float(out["price_usd"])
    out["clone_count"] = 0
    return out


@app.get("/clones/{handle}/bundles")
async def list_creator_bundles(
    handle: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Creator: list all bundles for this clone (owner only)."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    bundles_row = await session.execute(
        sql_text("""
            SELECT kb.id, kb.title, kb.description, kb.price_usd, kb.queries_included,
                   kb.is_published, kb.created_at,
                   COUNT(DISTINCT bcm.clone_id) AS clone_count
            FROM knowledge_bundles kb
            LEFT JOIN bundle_clone_members bcm ON bcm.bundle_id = kb.id
            WHERE kb.clone_id = :cid
            GROUP BY kb.id
            ORDER BY kb.created_at DESC
        """),
        {"cid": str(rec["clone_id"])},
    )
    bundles = [dict(r) for r in bundles_row.mappings().all()]
    for b in bundles:
        b["price_usd"] = float(b["price_usd"])
    return {"bundles": bundles}


@app.patch("/bundles/{bundle_id}")
async def update_bundle(
    bundle_id: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Creator: update bundle metadata."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("""
            SELECT kb.id, ci.user_id
            FROM knowledge_bundles kb
            JOIN clone_identity ci ON ci.clone_id = kb.clone_id
            WHERE kb.id = :bid
        """),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    # Validate publish: at least 1 clone member
    is_published = body.get("is_published")
    if is_published:
        clone_count_row = await session.execute(
            sql_text("SELECT COUNT(*) AS cnt FROM bundle_clone_members WHERE bundle_id = :bid"),
            {"bid": bundle_id},
        )
        clone_count = clone_count_row.scalar() or 0
        if clone_count < 1:
            raise HTTPException(status_code=400, detail="Add at least one clone before publishing")

    updates: list[str] = []
    params: dict = {"bid": bundle_id}
    for field, col in [("title", "title"), ("description", "description"), ("price_usd", "price_usd"), ("is_published", "is_published"), ("queries_included", "queries_included")]:
        if field in body:
            updates.append(f"{col} = :{field}")
            params[field] = body[field]
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = NOW()")
    await session.execute(
        sql_text(f"UPDATE knowledge_bundles SET {', '.join(updates)} WHERE id = :bid"),
        params,
    )
    await session.commit()
    return {"ok": True}


@app.post("/bundles/{bundle_id}/items", status_code=201)
async def add_bundle_item(
    bundle_id: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Creator: add a topic to a bundle."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT kb.id, ci.user_id FROM knowledge_bundles kb JOIN clone_identity ci ON ci.clone_id = kb.clone_id WHERE kb.id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    topic = (body.get("topic") or "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="topic is required")

    pos_row = await session.execute(
        sql_text("SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM bundle_items WHERE bundle_id = :bid"),
        {"bid": bundle_id},
    )
    pos = pos_row.mappings().first()["pos"]

    result = await session.execute(
        sql_text("""
            INSERT INTO bundle_items (bundle_id, topic, position)
            VALUES (:bid, :topic, :pos)
            RETURNING id, bundle_id, topic, position, status
        """),
        {"bid": bundle_id, "topic": topic, "pos": pos},
    )
    await session.commit()
    return dict(result.mappings().first())


@app.delete("/bundles/{bundle_id}/items/{item_id}", status_code=204)
async def delete_bundle_item(
    bundle_id: str,
    item_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Creator: remove an item from a bundle."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT ci.user_id FROM knowledge_bundles kb JOIN clone_identity ci ON ci.clone_id = kb.clone_id WHERE kb.id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    await session.execute(
        sql_text("DELETE FROM bundle_items WHERE id = :iid AND bundle_id = :bid"),
        {"iid": item_id, "bid": bundle_id},
    )
    await session.commit()


@app.post("/bundles/{bundle_id}/clones", status_code=201)
async def add_bundle_clone(
    bundle_id: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Creator: add a clone to a bundle."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT ci.user_id FROM knowledge_bundles kb JOIN clone_identity ci ON ci.clone_id = kb.clone_id WHERE kb.id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    clone_id = (body.get("clone_id") or "").strip()
    if not clone_id:
        raise HTTPException(status_code=422, detail="clone_id is required")

    # Verify clone exists and is listed
    ci_row = await session.execute(
        sql_text("SELECT clone_id, display_name, handle, category, total_queries FROM clone_identity WHERE clone_id = :cid"),
        {"cid": clone_id},
    )
    ci = ci_row.mappings().first()
    if not ci:
        raise HTTPException(status_code=404, detail="Clone not found")

    pos_row = await session.execute(
        sql_text("SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM bundle_clone_members WHERE bundle_id = :bid"),
        {"bid": bundle_id},
    )
    pos = pos_row.mappings().first()["pos"]

    await session.execute(
        sql_text("INSERT INTO bundle_clone_members (bundle_id, clone_id, position) VALUES (:bid, :cid, :pos) ON CONFLICT (bundle_id, clone_id) DO NOTHING"),
        {"bid": bundle_id, "cid": clone_id, "pos": pos},
    )
    await session.commit()
    return {
        "clone_id": str(ci["clone_id"]),
        "display_name": ci["display_name"],
        "handle": ci["handle"],
        "category": ci["category"],
        "total_queries": int(ci["total_queries"]),
        "position": pos,
    }


@app.delete("/bundles/{bundle_id}/clones/{clone_id}", status_code=204)
async def remove_bundle_clone(
    bundle_id: str,
    clone_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT ci.user_id FROM knowledge_bundles kb JOIN clone_identity ci ON ci.clone_id = kb.clone_id WHERE kb.id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])
    await session.execute(
        sql_text("DELETE FROM bundle_clone_members WHERE bundle_id = :bid AND clone_id = :cid"),
        {"bid": bundle_id, "cid": clone_id},
    )
    await session.commit()


@app.get("/bundles/{bundle_id}/clones")
async def list_bundle_clones(
    bundle_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT ci.user_id FROM knowledge_bundles kb JOIN clone_identity ci ON ci.clone_id = kb.clone_id WHERE kb.id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    clones_row = await session.execute(
        sql_text("""
            SELECT ci.clone_id, ci.display_name, ci.handle, ci.category, ci.total_queries,
                   bcm.position
            FROM bundle_clone_members bcm
            JOIN clone_identity ci ON ci.clone_id = bcm.clone_id
            WHERE bcm.bundle_id = :bid
            ORDER BY bcm.position
        """),
        {"bid": bundle_id},
    )
    clones = [dict(r) for r in clones_row.mappings().all()]
    for c in clones:
        c["total_queries"] = int(c["total_queries"])
    return {"clones": clones}


@app.get("/bundles/{bundle_id}/items")
async def list_bundle_items(
    bundle_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Creator: list all items for a bundle (owner only)."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT ci.user_id FROM knowledge_bundles kb JOIN clone_identity ci ON ci.clone_id = kb.clone_id WHERE kb.id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    items_row = await session.execute(
        sql_text("SELECT id, topic, position, status FROM bundle_items WHERE bundle_id = :bid ORDER BY position"),
        {"bid": bundle_id},
    )
    return {"items": [dict(r) for r in items_row.mappings().all()]}


@app.post("/bundles/{bundle_id}/generate", status_code=202)
async def generate_bundle_items(
    bundle_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Creator: generate briefing content for all pending items in the bundle."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("""
            SELECT kb.id, kb.clone_id, ci.user_id
            FROM knowledge_bundles kb
            JOIN clone_identity ci ON ci.clone_id = kb.clone_id
            WHERE kb.id = :bid
        """),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    _require_bundle_owner(caller_user_id, rec["user_id"])

    # Mark all pending items as 'generating'
    await session.execute(
        sql_text("UPDATE bundle_items SET status = 'generating' WHERE bundle_id = :bid AND status = 'pending'"),
        {"bid": bundle_id},
    )
    await session.commit()

    background_tasks.add_task(_generate_bundle_items_bg, bundle_id, str(rec["clone_id"]))
    return {"ok": True, "message": "Generation started"}


async def _generate_bundle_items_bg(bundle_id: str, clone_id: str) -> None:
    """Background task: call brain for each pending bundle item."""
    async with AsyncSessionLocal() as db:
        items_row = await db.execute(
            sql_text("SELECT id, topic FROM bundle_items WHERE bundle_id = :bid AND status = 'generating' ORDER BY position"),
            {"bid": bundle_id},
        )
        items = items_row.mappings().all()

    for item in items:
        try:
            async with AsyncSessionLocal() as db:
                await load_clone_keys(db, clone_id)
                b = BrainInput(
                    clone_id=clone_id,
                    message=(
                        f"Write a comprehensive briefing on the following topic from your personal knowledge and experience:\n\n"
                        f"{item['topic']}\n\n"
                        "Structure it with: an overview paragraph, 3–5 key insights as bullet points, "
                        "and a recommendations section. Be specific, draw on real examples."
                    ),
                )
                brain = DoppelBrain(session=db, clone_id=clone_id)
                result = await brain.process(b)
                await db.execute(
                    sql_text("""
                        UPDATE bundle_items
                        SET status = 'ready', briefing_content = :content, generated_at = NOW()
                        WHERE id = :iid
                    """),
                    {"content": result.response, "iid": str(item["id"])},
                )
                await db.commit()
        except Exception as exc:
            async with AsyncSessionLocal() as db:
                await db.execute(
                    sql_text("UPDATE bundle_items SET status = 'failed' WHERE id = :iid"),
                    {"iid": str(item["id"])},
                )
                await db.commit()
            _log.error("Bundle item generation failed item_id=%s: %s", item["id"], exc)


@app.post("/bundles/{bundle_id}/checkout")
async def bundle_checkout(
    bundle_id: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Consumer: create Stripe checkout session to purchase a bundle."""
    import stripe as stripe_lib

    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")

    row = await session.execute(
        sql_text("SELECT id, title, price_usd, is_published FROM knowledge_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec or not rec["is_published"]:
        raise HTTPException(status_code=404, detail="Bundle not found")

    # Check already purchased
    already = await session.execute(
        sql_text("SELECT id FROM bundle_purchases WHERE bundle_id = :bid AND user_id = :uid"),
        {"bid": bundle_id, "uid": caller_user_id},
    )
    if already.mappings().first():
        raise HTTPException(status_code=409, detail="Already purchased")

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Payments not configured")

    stripe_lib.api_key = settings.stripe_secret_key
    price_cents = int(float(rec["price_usd"]) * 100)
    session_obj = stripe_lib.checkout.Session.create(
        payment_method_types=["card"],
        mode="payment",
        billing_address_collection="required",
        invoice_creation={"enabled": True},
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": price_cents,
                "product_data": {"name": f"Doppel Bundle: {rec['title']}"},
            },
            "quantity": 1,
        }],
        metadata={"type": "bundle", "bundle_id": bundle_id, "user_id": caller_user_id, "amount": str(float(rec["price_usd"]))},
        success_url=f"{settings.app_url}/marketplace/bundles/{bundle_id}?success=1",
        cancel_url=f"{settings.app_url}/marketplace/bundles/{bundle_id}",
    )

    # Record pending purchase (queries_remaining set on webhook completion)
    await session.execute(
        sql_text("""
            INSERT INTO bundle_purchases (bundle_id, user_id, stripe_session_id)
            VALUES (:bid, :uid, :sid)
            ON CONFLICT (bundle_id, user_id) DO NOTHING
        """),
        {"bid": bundle_id, "uid": caller_user_id, "sid": session_obj.id},
    )
    await session.commit()
    return {"checkout_url": session_obj.url}


@app.get("/bundles/{bundle_id}/access")
async def check_bundle_access(
    bundle_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Consumer: check if the caller has purchased this bundle."""
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        return {"has_access": False}

    row = await session.execute(
        sql_text("SELECT id FROM bundle_purchases WHERE bundle_id = :bid AND user_id = :uid AND amount_paid IS NOT NULL"),
        {"bid": bundle_id, "uid": caller_user_id},
    )
    return {"has_access": row.mappings().first() is not None}


@app.get("/bundles/{bundle_id}/read")
async def read_bundle(
    bundle_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Consumer: read all briefing content for a purchased bundle."""
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")

    # Check ownership — creators can always read their own bundles
    bundle_row = await session.execute(
        sql_text("""
            SELECT kb.id, kb.title, ci.user_id AS owner_id
            FROM knowledge_bundles kb
            JOIN clone_identity ci ON ci.clone_id = kb.clone_id
            WHERE kb.id = :bid
        """),
        {"bid": bundle_id},
    )
    bundle_rec = bundle_row.mappings().first()
    if not bundle_rec:
        raise HTTPException(status_code=404, detail="Bundle not found")

    if bundle_rec["owner_id"] != caller_user_id:
        purchase_row = await session.execute(
            sql_text("SELECT id FROM bundle_purchases WHERE bundle_id = :bid AND user_id = :uid AND amount_paid IS NOT NULL"),
            {"bid": bundle_id, "uid": caller_user_id},
        )
        if not purchase_row.mappings().first():
            raise HTTPException(status_code=402, detail="Purchase required to access this bundle")

    items_row = await session.execute(
        sql_text("SELECT id, topic, briefing_content, position FROM bundle_items WHERE bundle_id = :bid AND status = 'ready' ORDER BY position"),
        {"bid": bundle_id},
    )
    items = [dict(r) for r in items_row.mappings().all()]
    return {"bundle_id": bundle_id, "title": bundle_rec["title"], "items": items}


# ---------------------------------------------------------------------------
# Consumer bundles — user-curated cross-clone bundles
# ---------------------------------------------------------------------------

@app.post("/consumer-bundles", status_code=201)
async def create_consumer_bundle(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    row = await session.execute(
        sql_text("""
            INSERT INTO consumer_bundles (user_id, title, description, is_public, price_usd)
            VALUES (:uid, :title, :desc, :pub, :price)
            RETURNING id, user_id, title, description, is_public, price_usd, created_at
        """),
        {
            "uid": caller_user_id,
            "title": title,
            "desc": (body.get("description") or "").strip() or None,
            "pub": bool(body.get("is_public", False)),
            "price": float(body.get("price_usd", 0.00)),
        },
    )
    await session.commit()
    out = dict(row.mappings().first())
    out["price_usd"] = float(out["price_usd"])
    out["item_count"] = 0
    out["ready_count"] = 0
    return out


@app.get("/consumer-bundles")
async def list_consumer_bundles(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    rows = await session.execute(
        sql_text("""
            SELECT cb.id, cb.title, cb.description, cb.is_public, cb.price_usd, cb.created_at,
                   COUNT(cbi.id) AS item_count,
                   COUNT(cbi.id) FILTER (WHERE cbi.status = 'ready') AS ready_count
            FROM consumer_bundles cb
            LEFT JOIN consumer_bundle_items cbi ON cbi.bundle_id = cb.id
            WHERE cb.user_id = :uid
            GROUP BY cb.id
            ORDER BY cb.created_at DESC
        """),
        {"uid": caller_user_id},
    )
    bundles = [dict(r) for r in rows.mappings().all()]
    for b in bundles:
        b["price_usd"] = float(b["price_usd"])
    return {"bundles": bundles}


@app.patch("/consumer-bundles/{bundle_id}")
async def update_consumer_bundle(
    bundle_id: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    row = await session.execute(
        sql_text("SELECT id, user_id FROM consumer_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    updates: list[str] = []
    params: dict = {"bid": bundle_id}
    for field in ["title", "description", "is_public", "price_usd"]:
        if field in body:
            updates.append(f"{field} = :{field}")
            params[field] = body[field]
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    updates.append("updated_at = NOW()")
    await session.execute(
        sql_text(f"UPDATE consumer_bundles SET {', '.join(updates)} WHERE id = :bid"),
        params,
    )
    await session.commit()
    return {"ok": True}


@app.delete("/consumer-bundles/{bundle_id}", status_code=204)
async def delete_consumer_bundle(
    bundle_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    row = await session.execute(
        sql_text("SELECT user_id FROM consumer_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    await session.execute(sql_text("DELETE FROM consumer_bundles WHERE id = :bid"), {"bid": bundle_id})
    await session.commit()


@app.post("/consumer-bundles/{bundle_id}/items", status_code=201)
async def add_consumer_bundle_item(
    bundle_id: str,
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    row = await session.execute(
        sql_text("SELECT user_id FROM consumer_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=404, detail="Bundle not found")
    clone_id = (body.get("clone_id") or "").strip()
    topic = (body.get("topic") or "").strip()
    if not clone_id or not topic:
        raise HTTPException(status_code=422, detail="clone_id and topic are required")
    # Get next position
    pos_row = await session.execute(
        sql_text("SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM consumer_bundle_items WHERE bundle_id = :bid"),
        {"bid": bundle_id},
    )
    next_pos = pos_row.mappings().first()["next_pos"]
    item_row = await session.execute(
        sql_text("""
            INSERT INTO consumer_bundle_items (bundle_id, clone_id, topic, position)
            VALUES (:bid, :cid, :topic, :pos)
            RETURNING id, clone_id, topic, position, status
        """),
        {"bid": bundle_id, "cid": clone_id, "topic": topic, "pos": next_pos},
    )
    await session.commit()
    item = dict(item_row.mappings().first())
    # Fetch clone name for display
    clone_row = await session.execute(
        sql_text("SELECT display_name, handle FROM clone_identity WHERE clone_id = :cid"),
        {"cid": clone_id},
    )
    clone_rec = clone_row.mappings().first()
    if clone_rec:
        item["clone_name"] = clone_rec["display_name"]
        item["clone_handle"] = clone_rec["handle"]
    return item


@app.delete("/consumer-bundles/{bundle_id}/items/{item_id}", status_code=204)
async def remove_consumer_bundle_item(
    bundle_id: str,
    item_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    row = await session.execute(
        sql_text("SELECT user_id FROM consumer_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=404, detail="Bundle not found")
    await session.execute(
        sql_text("DELETE FROM consumer_bundle_items WHERE id = :iid AND bundle_id = :bid"),
        {"iid": item_id, "bid": bundle_id},
    )
    await session.commit()


@app.get("/consumer-bundles/{bundle_id}/items")
async def list_consumer_bundle_items(
    bundle_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    row = await session.execute(
        sql_text("SELECT user_id FROM consumer_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=404, detail="Bundle not found")
    rows = await session.execute(
        sql_text("""
            SELECT cbi.id, cbi.clone_id, cbi.topic, cbi.position, cbi.status, cbi.credits_used,
                   ci.display_name AS clone_name, ci.handle AS clone_handle
            FROM consumer_bundle_items cbi
            JOIN clone_identity ci ON ci.clone_id = cbi.clone_id
            WHERE cbi.bundle_id = :bid
            ORDER BY cbi.position
        """),
        {"bid": bundle_id},
    )
    return {"items": [dict(r) for r in rows.mappings().all()]}


@app.post("/consumer-bundles/{bundle_id}/generate")
async def generate_consumer_bundle(
    bundle_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Generate content for all pending items, costing 1 credit per item."""
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    row = await session.execute(
        sql_text("SELECT user_id FROM consumer_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec or rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=404, detail="Bundle not found")

    items_row = await session.execute(
        sql_text("""
            SELECT cbi.id, cbi.clone_id, cbi.topic,
                   ci.display_name AS clone_name
            FROM consumer_bundle_items cbi
            JOIN clone_identity ci ON ci.clone_id = cbi.clone_id
            WHERE cbi.bundle_id = :bid AND cbi.status = 'pending'
        """),
        {"bid": bundle_id},
    )
    items = [dict(r) for r in items_row.mappings().all()]
    if not items:
        return {"queued": 0}

    # Check credit balance
    credit_row = await session.execute(
        sql_text("SELECT credits_remaining FROM query_credits WHERE user_id = :uid"),
        {"uid": caller_user_id},
    )
    credit_rec = credit_row.mappings().first()
    balance = credit_rec["credits_remaining"] if credit_rec else 0
    if balance < len(items):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {len(items)}, have {balance}.")

    # Mark all as generating
    await session.execute(
        sql_text("UPDATE consumer_bundle_items SET status = 'generating' WHERE bundle_id = :bid AND status = 'pending'"),
        {"bid": bundle_id},
    )
    await session.commit()

    background_tasks.add_task(_generate_consumer_items, bundle_id, items, caller_user_id)
    return {"queued": len(items)}


async def _generate_consumer_items(bundle_id: str, items: list[dict], user_id: str) -> None:
    """Background: query each clone per topic, store content, deduct credits."""
    from doppel.brain.orchestrator import BrainOrchestrator
    from doppel.brain.models import BrainInput
    import uuid as _uuid

    async with AsyncSessionLocal() as session:
        for item in items:
            try:
                prompt = (
                    f"Write a detailed briefing on the following topic from your own expertise and perspective: "
                    f'"{item["topic"]}". '
                    "Structure your response as actionable insights the reader can apply. "
                    "Be specific. 300–500 words."
                )
                brain = BrainOrchestrator(session)
                result = await brain.process(BrainInput(
                    clone_id=_uuid.UUID(str(item["clone_id"])),
                    message=prompt,
                    sender_id=user_id,
                    session_id=_uuid.uuid4(),
                ))
                await session.execute(
                    sql_text("""
                        UPDATE consumer_bundle_items
                        SET status = 'ready', content = :content, credits_used = 1, generated_at = NOW()
                        WHERE id = :iid
                    """),
                    {"content": result.response, "iid": str(item["id"])},
                )
                # Deduct 1 credit
                await session.execute(
                    sql_text("""
                        UPDATE query_credits SET credits_remaining = credits_remaining - 1, updated_at = NOW()
                        WHERE user_id = :uid AND credits_remaining > 0
                    """),
                    {"uid": user_id},
                )
                await session.commit()
            except Exception as exc:
                print(f"[consumer-bundle] item {item['id']} failed: {exc}")
                await session.execute(
                    sql_text("UPDATE consumer_bundle_items SET status = 'failed' WHERE id = :iid"),
                    {"iid": str(item["id"])},
                )
                await session.commit()


@app.get("/consumer-bundles/{bundle_id}/read")
async def read_consumer_bundle(
    bundle_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Read full content — owner always; others only if purchased."""
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")

    row = await session.execute(
        sql_text("SELECT id, title, user_id, is_public, price_usd FROM consumer_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")

    is_owner = rec["user_id"] == caller_user_id
    if not is_owner:
        if float(rec["price_usd"]) > 0:
            purchase_row = await session.execute(
                sql_text("SELECT id FROM consumer_bundle_purchases WHERE bundle_id = :bid AND user_id = :uid AND amount_paid IS NOT NULL"),
                {"bid": bundle_id, "uid": caller_user_id},
            )
            if not purchase_row.mappings().first():
                raise HTTPException(status_code=402, detail="Purchase required")
        elif not rec["is_public"]:
            raise HTTPException(status_code=403, detail="Private bundle")

    items_row = await session.execute(
        sql_text("""
            SELECT cbi.id, cbi.topic, cbi.content, cbi.position, cbi.status,
                   ci.display_name AS clone_name, ci.handle AS clone_handle
            FROM consumer_bundle_items cbi
            JOIN clone_identity ci ON ci.clone_id = cbi.clone_id
            WHERE cbi.bundle_id = :bid AND cbi.status = 'ready'
            ORDER BY cbi.position
        """),
        {"bid": bundle_id},
    )
    items = [dict(r) for r in items_row.mappings().all()]
    return {"bundle_id": bundle_id, "title": rec["title"], "items": items}


@app.post("/consumer-bundles/{bundle_id}/checkout")
async def consumer_bundle_checkout(
    bundle_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")

    row = await session.execute(
        sql_text("SELECT id, title, price_usd, is_public FROM consumer_bundles WHERE id = :bid"),
        {"bid": bundle_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if float(rec["price_usd"]) <= 0:
        raise HTTPException(status_code=422, detail="Bundle is free")

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Payments not configured")

    stripe_lib.api_key = settings.stripe_secret_key
    price_cents = int(float(rec["price_usd"]) * 100)
    session_obj = stripe_lib.checkout.Session.create(
        payment_method_types=["card"],
        mode="payment",
        billing_address_collection="required",
        invoice_creation={"enabled": True},
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": price_cents,
                "product_data": {"name": rec["title"]},
            },
            "quantity": 1,
        }],
        metadata={"type": "consumer_bundle", "bundle_id": bundle_id, "user_id": caller_user_id, "amount": str(float(rec["price_usd"]))},
        success_url=f"{settings.app_url}/marketplace/bundles/{bundle_id}?success=1",
        cancel_url=f"{settings.app_url}/marketplace/bundles/{bundle_id}",
    )

    await session.execute(
        sql_text("""
            INSERT INTO consumer_bundle_purchases (bundle_id, user_id, stripe_session_id)
            VALUES (:bid, :uid, :sid)
            ON CONFLICT (bundle_id, user_id) DO NOTHING
        """),
        {"bid": bundle_id, "uid": caller_user_id, "sid": session_obj.id},
    )
    await session.commit()
    return {"checkout_url": session_obj.url}


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
    await _check_memory_limit(body.clone_id, 1, session)
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
        (settings.stripe_personal_monthly_price_id, "personal"),
        (settings.stripe_personal_yearly_price_id, "personal"),
        (settings.stripe_ent_pro_monthly_price_id, "enterprise_pro"),
        (settings.stripe_ent_pro_yearly_price_id, "enterprise_pro"),
        (settings.stripe_ent_max_monthly_price_id, "enterprise_max"),
        (settings.stripe_ent_max_yearly_price_id, "enterprise_max"),
    ]:
        if price_id:
            mapping[price_id] = tier
    return mapping


class CheckoutRequest(BaseModel):
    user_id: str
    tier: str           # personal | enterprise_pro | enterprise_max
    period: str         # monthly | yearly
    price_id: str = ""  # legacy — ignored if tier+period provided


_TIER_PERIOD_TO_PRICE: dict[tuple[str, str], str] = {}


def _resolve_price_id(tier: str, period: str) -> str:
    """Look up Stripe price ID from settings for a given tier+period combo."""
    mapping = {
        ("personal", "monthly"):       settings.stripe_personal_monthly_price_id,
        ("personal", "yearly"):        settings.stripe_personal_yearly_price_id,
        ("enterprise_pro", "monthly"): settings.stripe_ent_pro_monthly_price_id,
        ("enterprise_pro", "yearly"):  settings.stripe_ent_pro_yearly_price_id,
        ("enterprise_max", "monthly"): settings.stripe_ent_max_monthly_price_id,
        ("enterprise_max", "yearly"):  settings.stripe_ent_max_yearly_price_id,
    }
    return mapping.get((tier, period), "")


@app.post("/billing/checkout-session")
async def create_checkout_session(
    body: CheckoutRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Create a Stripe Checkout Session and return the redirect URL."""
    import stripe as stripe_lib

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured — set STRIPE_SECRET_KEY in .env")

    stripe_lib.api_key = settings.stripe_secret_key

    # Resolve price ID server-side from tier+period (preferred) or legacy price_id field
    price_id = _resolve_price_id(body.tier, body.period) if body.tier else body.price_id
    if not price_id:
        raise HTTPException(
            status_code=422,
            detail=f"No Stripe price configured for {body.tier}/{body.period}. "
                   "Add STRIPE_{TIER}_{PERIOD}_PRICE_ID to your .env file.",
        )
    if price_id not in _price_to_tier():
        raise HTTPException(status_code=422, detail="Price ID not recognised — check Stripe dashboard")

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
        # Propagate to ALL clones for this user so webhooks match every clone
        await session.execute(
            sql_text("UPDATE clone_identity SET stripe_customer_id = :cid WHERE user_id = :uid"),
            {"cid": customer_id, "uid": body.user_id},
        )
        await session.commit()

    checkout = stripe_lib.checkout.Session.create(
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        billing_address_collection="required",
        customer_update={"address": "auto"},
        success_url=f"{settings.app_url}/dashboard/billing?success=1",
        cancel_url=f"{settings.app_url}/dashboard/billing?canceled=1",
        metadata={"user_id": body.user_id, "tier": body.tier},
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
            meta = obj.get("metadata", {})
            user_id = meta.get("user_id")
            subscription_id = obj.get("subscription")
            customer_id = obj.get("customer")
            tier = meta.get("tier")  # set at checkout creation time
            if user_id and subscription_id:
                # Propagate stripe_customer_id + tier to ALL clones for this user
                await session.execute(
                    sql_text("""
                        UPDATE clone_identity
                        SET stripe_subscription_id = :sid,
                            stripe_customer_id     = COALESCE(:cid, stripe_customer_id)
                            {tier_clause}
                        WHERE user_id = :uid
                          AND (admin_tier_override IS NULL OR admin_tier_override = FALSE)
                    """.replace(
                        "{tier_clause}",
                        ", subscription_tier = :tier" if tier else ""
                    )),
                    {
                        "sid": subscription_id,
                        "cid": customer_id,
                        "uid": user_id,
                        **({"tier": tier} if tier else {}),
                    },
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
                # Update ALL clones belonging to this customer's user account
                await session.execute(
                    sql_text("""
                        UPDATE clone_identity
                        SET subscription_tier      = :tier,
                            stripe_subscription_id = :sid,
                            stripe_customer_id     = :cid
                        WHERE user_id IN (
                            SELECT DISTINCT user_id FROM clone_identity
                            WHERE stripe_customer_id = :cid
                        )
                          AND (admin_tier_override IS NULL OR admin_tier_override = FALSE)
                    """),
                    {"tier": tier, "sid": sub["id"], "cid": customer_id},
                )
                await session.commit()

        elif event["type"] == "customer.subscription.deleted":
            sub = event["data"]["object"]
            customer_id = sub.get("customer")
            if customer_id:
                # Downgrade ALL clones for this user
                await session.execute(
                    sql_text("""
                        UPDATE clone_identity
                        SET subscription_tier      = 'free',
                            stripe_subscription_id = NULL
                        WHERE user_id IN (
                            SELECT DISTINCT user_id FROM clone_identity
                            WHERE stripe_customer_id = :cid
                        )
                          AND (admin_tier_override IS NULL OR admin_tier_override = FALSE)
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


@app.post("/billing/sync")
async def sync_billing_from_stripe(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Reconcile subscription state by querying Stripe directly.

    Use cases:
    - Webhook was missed / not delivered during dev/early prod
    - User paid but their tier wasn't updated in the DB
    - stripe_customer_id not yet linked to a clone_identity row

    Safe to call on every billing page load — no-ops if already in sync.
    Respects admin_tier_override — never overwrites a manually set tier.
    """
    import stripe as stripe_lib

    if not settings.stripe_secret_key:
        # Stripe not configured — silently skip rather than 503
        return {"synced": False, "reason": "Stripe not configured", "tier": "free"}

    stripe_lib.api_key = settings.stripe_secret_key

    # Load current DB state
    row = await session.execute(
        sql_text("""
            SELECT clone_id, stripe_customer_id, subscription_tier, admin_tier_override,
                   stripe_subscription_id
            FROM clone_identity WHERE user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    record = row.mappings().first()
    if not record:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    # Never overwrite admin-managed tiers
    if bool(record.get("admin_tier_override")):
        return {
            "synced": False,
            "reason": "admin_tier_override active",
            "tier": record["subscription_tier"] or "free",
        }

    customer_id: str | None = record["stripe_customer_id"]
    clone_id = str(record["clone_id"])
    db_tier = record["subscription_tier"] or "free"

    # ── Step 1: Find Stripe customer if not linked ───────────────────────────
    if not customer_id:
        try:
            results = stripe_lib.Customer.search(
                query=f'metadata["user_id"]:"{user_id}"',
                limit=1,
            )
            if results.data:
                customer_id = results.data[0].id
        except Exception:
            pass  # search API may not be enabled on older Stripe accounts

    if not customer_id:
        return {"synced": False, "reason": "No Stripe customer found", "tier": db_tier}

    # ── Step 2: Find the highest active/trialing subscription ────────────────
    price_map = _price_to_tier()
    resolved_tier = "free"
    resolved_sub_id: str | None = None

    try:
        for status in ("active", "trialing", "past_due"):
            subs = stripe_lib.Subscription.list(
                customer=customer_id,
                status=status,
                limit=10,
                expand=["data.items.data.price"],
            )
            for sub in subs.data:
                for item in sub["items"]["data"]:
                    mapped = price_map.get(item["price"]["id"])
                    if mapped and mapped != "free":
                        resolved_tier = mapped
                        resolved_sub_id = sub["id"]
                        break
                if resolved_tier != "free":
                    break
            if resolved_tier != "free":
                break
    except stripe_lib.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e.user_message}")

    # ── Step 3: Write back to DB only if something changed ───────────────────
    changed = (resolved_tier != db_tier) or (customer_id != record["stripe_customer_id"])

    if changed:
        # Update ALL clones for this user — tier and customer ID are user-level, not clone-level
        await session.execute(
            sql_text("""
                UPDATE clone_identity
                SET subscription_tier      = :tier,
                    stripe_customer_id     = :cid,
                    stripe_subscription_id = :sid,
                    updated_at             = now()
                WHERE user_id = :uid
                  AND (admin_tier_override IS NULL OR admin_tier_override = FALSE)
            """),
            {
                "tier": resolved_tier,
                "cid": customer_id,
                "sid": resolved_sub_id,
                "uid": user_id,
            },
        )
        await session.commit()

    return {
        "synced": True,
        "changed": changed,
        "tier": resolved_tier,
        "stripe_customer_id": customer_id,
        "stripe_subscription_id": resolved_sub_id,
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
            SET subscription_tier = :tier,
                admin_tier_override = TRUE,
                updated_at = now()
            WHERE user_id = :uid
        """),
        {"tier": tier, "uid": clerk_user_id},
    )
    await session.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="No clone found for this user")

    return {"ok": True, "user_id": clerk_user_id, "tier": tier}


@app.post("/admin/credits/grant")
async def admin_grant_credits(
    body: dict,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Add credits to any user's account. caller_user_id must match ADMIN_USER_ID."""
    _require_admin(caller_user_id)

    target_user_id = body.get("user_id", "").strip()
    credits = int(body.get("credits", 0))
    if not target_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if credits <= 0:
        raise HTTPException(status_code=400, detail="credits must be a positive integer")

    await session.execute(
        sql_text("""
            INSERT INTO query_credits (user_id, credits_remaining, updated_at)
            VALUES (:user_id, :credits, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET credits_remaining = query_credits.credits_remaining + :credits,
                updated_at = NOW()
        """),
        {"user_id": target_user_id, "credits": credits},
    )
    await session.commit()

    row = await session.execute(
        sql_text("SELECT credits_remaining FROM query_credits WHERE user_id = :uid"),
        {"uid": target_user_id},
    )
    row = row.fetchone()
    new_balance = row[0] if row else credits
    return {"ok": True, "user_id": target_user_id, "credits_granted": credits, "new_balance": new_balance}


@app.post("/admin/clones/{handle}/verify")
async def admin_verify_clone(
    handle: str,
    body: dict,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Grant verified badge to a clone. caller_user_id must match ADMIN_USER_ID."""
    _require_admin(caller_user_id)
    note = body.get("note", "")
    result = await session.execute(
        sql_text("""
            UPDATE clone_identity
            SET is_verified = TRUE, verified_at = NOW(), verification_note = :note
            WHERE handle = :handle
            RETURNING clone_id, display_name
        """),
        {"handle": handle, "note": note},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Clone not found")
    await session.commit()
    return {"ok": True, "handle": handle, "display_name": row["display_name"], "is_verified": True}


@app.delete("/admin/clones/{handle}/verify")
async def admin_revoke_verify(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Revoke verified badge from a clone."""
    _require_admin(caller_user_id)
    result = await session.execute(
        sql_text("""
            UPDATE clone_identity
            SET is_verified = FALSE, verified_at = NULL, verification_note = NULL
            WHERE handle = :handle
            RETURNING clone_id
        """),
        {"handle": handle},
    )
    if not result.mappings().first():
        raise HTTPException(status_code=404, detail="Clone not found")
    await session.commit()
    return {"ok": True, "handle": handle, "is_verified": False}


@app.post("/admin/help-clone/{handle}")
async def admin_set_help_clone(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Designate a clone as the site-wide help assistant. Clears any previous designation."""
    _require_admin(caller_user_id)
    # Clear any existing help clone first (only one allowed)
    await session.execute(
        sql_text("UPDATE clone_identity SET is_help_clone = FALSE WHERE is_help_clone = TRUE"),
    )
    result = await session.execute(
        sql_text("""
            UPDATE clone_identity
            SET is_help_clone = TRUE
            WHERE handle = :handle
            RETURNING clone_id, display_name, avatar_url
        """),
        {"handle": handle},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Clone not found")
    await session.commit()
    return {"ok": True, "handle": handle, "display_name": row["display_name"], "is_help_clone": True}


@app.delete("/admin/help-clone/{handle}")
async def admin_remove_help_clone(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Remove the help clone designation from a clone."""
    _require_admin(caller_user_id)
    result = await session.execute(
        sql_text("""
            UPDATE clone_identity
            SET is_help_clone = FALSE
            WHERE handle = :handle
            RETURNING clone_id
        """),
        {"handle": handle},
    )
    if not result.mappings().first():
        raise HTTPException(status_code=404, detail="Clone not found")
    await session.commit()
    return {"ok": True, "handle": handle, "is_help_clone": False}


@app.get("/help/clone")
async def get_help_clone(
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Public endpoint: returns the designated help clone, or null if none set."""
    result = await session.execute(
        sql_text("""
            SELECT clone_id, handle, display_name, avatar_url
            FROM clone_identity
            WHERE is_help_clone = TRUE
            LIMIT 1
        """),
    )
    row = result.mappings().first()
    if not row:
        return {"clone": None}
    return {
        "clone": {
            "clone_id": str(row["clone_id"]),
            "handle": row["handle"],
            "display_name": row["display_name"],
            "avatar_url": row["avatar_url"],
        }
    }


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
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List all users with their current plan. caller_user_id must match ADMIN_USER_ID."""
    _require_admin(caller_user_id)

    try:
        rows = await session.execute(
            sql_text("""
                SELECT DISTINCT ON (ci.user_id)
                       ci.user_id, ci.display_name, ci.handle,
                       COALESCE(ci.subscription_tier, 'free') AS subscription_tier,
                       COALESCE(ci.admin_tier_override, FALSE) AS admin_tier_override,
                       ci.stripe_customer_id, ci.created_at,
                       COALESCE(qc.credits_remaining, 0) AS credits_remaining
                FROM clone_identity ci
                LEFT JOIN query_credits qc ON qc.user_id = ci.user_id
                ORDER BY ci.user_id, ci.created_at DESC
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
            "admin_tier_override": bool(r["admin_tier_override"]),
            "stripe_customer_id": r["stripe_customer_id"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "credits_remaining": r["credits_remaining"],
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
    await _check_memory_limit(body.clone_id, len(chunks), session)

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
    await _check_memory_limit(clone_uuid, len(chunks), session)
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
            source_ref=filename,
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

    tier_row = await session.execute(
        sql_text("SELECT subscription_tier FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    tier = (tier_row.mappings().first() or {}).get("subscription_tier") or "free"
    memory_limit = TIER_MEMORY_LIMITS.get(tier, TIER_MEMORY_LIMITS["free"])

    return {
        "total": total,
        "episodic": int(row.get("episodic") or 0),
        "semantic": int(row.get("semantic") or 0),
        "procedural": int(row.get("procedural") or 0),
        "relational": int(row.get("relational") or 0),
        "sources": sources,
        "memory_limit": memory_limit,
        "memory_used": int(row.get("episodic") or 0),
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
    content: str | None = None


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
    if body.content is not None:
        # Re-embed immediately so the chunk is retrievable straight away
        from doppel.brain.db.vector import embed
        new_embedding = await embed(body.content)
        vec_str = "[" + ",".join(str(v) for v in new_embedding) + "]"
        parts.append("content = :content, embedding = :embedding")
        params["content"] = body.content
        params["embedding"] = vec_str

    if not parts:
        raise HTTPException(status_code=422, detail="Provide is_pinned, is_excluded, or content")

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


@app.delete("/brain/memories/{memory_id}", status_code=200)
async def delete_memory(
    memory_id: UUID,
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Hard-delete a single episodic memory chunk."""
    result = await session.execute(
        sql_text("DELETE FROM episodic_memory WHERE id = :mid AND clone_id = :cid"),
        {"mid": str(memory_id), "cid": str(clone_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Memory not found")
    await session.commit()
    return {"status": "deleted"}


@app.get("/brain/uploads")
async def list_uploads(
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List distinct uploaded files (source_ref) with their chunk counts and ingestion time."""
    rows = await session.execute(
        sql_text("""
            SELECT source_ref, COUNT(*) AS chunk_count, MAX(ingested_at) AS last_ingested_at
            FROM episodic_memory
            WHERE clone_id = :cid
              AND source = 'upload'
              AND source_ref IS NOT NULL
            GROUP BY source_ref
            ORDER BY MAX(ingested_at) DESC
        """),
        {"cid": str(clone_id)},
    )
    return {
        "uploads": [
            {
                "source_ref": r["source_ref"],
                "chunk_count": r["chunk_count"],
                "last_ingested_at": r["last_ingested_at"].isoformat() if r["last_ingested_at"] else None,
            }
            for r in rows.mappings()
        ]
    }


@app.delete("/brain/memories", status_code=200)
async def delete_memories_by_source_ref(
    clone_id: UUID = Query(...),
    source_ref: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete all episodic memory chunks for a given source_ref (e.g. filename)."""
    result = await session.execute(
        sql_text(
            "DELETE FROM episodic_memory WHERE clone_id = :cid AND source_ref = :ref"
        ),
        {"cid": str(clone_id), "ref": source_ref},
    )
    await session.commit()
    return {"status": "deleted", "chunks_removed": result.rowcount}


# ---------------------------------------------------------------------------
# Brain — semantic memory CRUD
# ---------------------------------------------------------------------------

@app.get("/brain/semantic")
async def list_semantic(
    clone_id: UUID = Query(...),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List semantic memory facts for a clone."""
    params: dict = {"cid": str(clone_id), "limit": limit, "offset": offset}
    where_parts = ["clone_id = :cid"]
    if search:
        where_parts.append("fact ILIKE :search")
        params["search"] = f"%{search}%"
    where = " AND ".join(where_parts)

    rows = await session.execute(
        sql_text(f"""
            SELECT id, fact, domain, confidence, created_at, updated_at
            FROM semantic_memory
            WHERE {where}
            ORDER BY confidence DESC, updated_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    facts = [
        {
            "id": str(r["id"]),
            "fact": r["fact"],
            "domain": r["domain"],
            "confidence": round(float(r["confidence"] or 0), 2),
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows.mappings()
    ]
    total_row = await session.execute(
        sql_text(f"SELECT COUNT(*) AS n FROM semantic_memory WHERE {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int((total_row.mappings().first() or {}).get("n") or 0)
    return {"facts": facts, "total": total, "offset": offset, "limit": limit}


class SemanticUpdateRequest(BaseModel):
    clone_id: UUID
    fact: str | None = None
    domain: str | None = None
    confidence: float | None = None


@app.patch("/brain/semantic/{fact_id}", status_code=200)
async def update_semantic(
    fact_id: UUID,
    body: SemanticUpdateRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Replace content of a semantic fact (embedding is cleared — will be re-computed on next retrieval)."""
    parts, params = [], {"fid": str(fact_id), "cid": str(body.clone_id)}
    if body.fact is not None:
        parts.append("fact = :fact, embedding = NULL, updated_at = NOW()")
        params["fact"] = body.fact
    if body.domain is not None:
        parts.append("domain = :domain")
        params["domain"] = body.domain
    if body.confidence is not None:
        parts.append("confidence = :confidence")
        params["confidence"] = body.confidence
    if not parts:
        raise HTTPException(status_code=422, detail="Nothing to update")
    result = await session.execute(
        sql_text(f"UPDATE semantic_memory SET {', '.join(parts)} WHERE id = :fid AND clone_id = :cid"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Fact not found")
    await session.commit()
    return {"status": "updated"}


@app.delete("/brain/semantic/{fact_id}", status_code=200)
async def delete_semantic(
    fact_id: UUID,
    clone_id: UUID = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Hard-delete a semantic fact."""
    result = await session.execute(
        sql_text("DELETE FROM semantic_memory WHERE id = :fid AND clone_id = :cid"),
        {"fid": str(fact_id), "cid": str(clone_id)},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Fact not found")
    await session.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Brain — activity report (who asked what, frequency, themes)
# ---------------------------------------------------------------------------

@app.get("/brain/activity-report")
async def get_activity_report(
    clone_id: UUID = Query(...),
    days: int = Query(default=30, ge=1, le=365),
    mode: str = Query(default="owner", regex="^(owner|consumer|all)$"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return query analytics for a clone owner: volume over time, top questioners, top questions, themes.

    mode=owner    — only owner training/testing queries
    mode=consumer — only marketplace consumer queries
    mode=all      — all queries
    """
    cid = str(clone_id)

    if mode == "owner":
        mode_filter = "AND (brain_input->>'owner_mode')::boolean = TRUE"
    elif mode == "consumer":
        mode_filter = "AND (brain_input->>'owner_mode')::boolean = FALSE"
    else:
        mode_filter = ""

    # Daily query volume
    volume_rows = await session.execute(
        sql_text(f"""
            SELECT DATE(created_at) AS day, COUNT(*) AS count
            FROM reasoning_traces
            WHERE clone_id = :cid
              AND created_at >= NOW() - MAKE_INTERVAL(days => :days)
              {mode_filter}
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        """),
        {"cid": cid, "days": days},
    )
    queries_by_day = [
        {"day": str(r["day"]), "count": int(r["count"])}
        for r in volume_rows.mappings()
    ]

    # Summary totals
    totals_row = await session.execute(
        sql_text(f"""
            SELECT COUNT(*)                                         AS total_queries,
                   COUNT(DISTINCT brain_input->>'sender_id')        AS unique_questioners,
                   COUNT(DISTINCT session_id)                       AS total_sessions,
                   ROUND(AVG(latency_ms)::numeric, 0)               AS avg_latency_ms
            FROM reasoning_traces
            WHERE clone_id = :cid
              AND created_at >= NOW() - MAKE_INTERVAL(days => :days)
              {mode_filter}
        """),
        {"cid": cid, "days": days},
    )
    totals = dict(totals_row.mappings().first() or {})

    # Top questioners (by message count)
    questioner_rows = await session.execute(
        sql_text(f"""
            SELECT brain_input->>'sender_id'    AS sender_id,
                   COUNT(*)                     AS query_count,
                   MAX(created_at)              AS last_active
            FROM reasoning_traces
            WHERE clone_id = :cid
              AND created_at >= NOW() - MAKE_INTERVAL(days => :days)
              AND brain_input->>'sender_id' IS NOT NULL
              AND brain_input->>'sender_id' != ''
              {mode_filter}
            GROUP BY brain_input->>'sender_id'
            ORDER BY query_count DESC
            LIMIT 15
        """),
        {"cid": cid, "days": days},
    )
    top_questioners = [
        {
            "sender_id": r["sender_id"],
            "query_count": int(r["query_count"]),
            "last_active": r["last_active"].isoformat() if r["last_active"] else None,
        }
        for r in questioner_rows.mappings()
    ]

    # Top questions (most-repeated exact messages)
    question_rows = await session.execute(
        sql_text(f"""
            SELECT brain_input->>'message' AS message, COUNT(*) AS count
            FROM reasoning_traces
            WHERE clone_id = :cid
              AND created_at >= NOW() - MAKE_INTERVAL(days => :days)
              AND brain_input->>'message' IS NOT NULL
              {mode_filter}
            GROUP BY brain_input->>'message'
            ORDER BY count DESC, MAX(created_at) DESC
            LIMIT 25
        """),
        {"cid": cid, "days": days},
    )
    top_questions = [
        {"message": r["message"], "count": int(r["count"])}
        for r in question_rows.mappings()
    ]

    # Recurring themes — from episodic memory chunks sourced from chat (always owner-scoped)
    theme_rows = await session.execute(
        sql_text("""
            SELECT t AS theme, COUNT(*) AS count
            FROM episodic_memory, unnest(topics) AS t
            WHERE clone_id = :cid AND source = 'chat' AND is_excluded = false AND t != ''
            GROUP BY t
            ORDER BY count DESC
            LIMIT 20
        """),
        {"cid": cid},
    )
    themes = [
        {"theme": r["theme"], "count": int(r["count"])}
        for r in theme_rows.mappings()
    ]

    return {
        "period_days": days,
        "mode": mode,
        "total_queries": int(totals.get("total_queries") or 0),
        "unique_questioners": int(totals.get("unique_questioners") or 0),
        "total_sessions": int(totals.get("total_sessions") or 0),
        "avg_latency_ms": int(totals.get("avg_latency_ms") or 0),
        "queries_by_day": queries_by_day,
        "top_questioners": top_questioners,
        "top_questions": top_questions,
        "themes": themes,
    }


@app.get("/brain/activity-report/export")
async def export_activity_report(
    clone_id: UUID = Query(...),
    days: int = Query(default=30, ge=1, le=365),
    mode: str = Query(default="owner", regex="^(owner|consumer|all)$"),
    session: AsyncSession = Depends(get_session),
):
    """Export raw query log as CSV."""
    import csv, io
    from fastapi.responses import StreamingResponse

    if mode == "owner":
        mode_filter = "AND (brain_input->>'owner_mode')::boolean = TRUE"
    elif mode == "consumer":
        mode_filter = "AND (brain_input->>'owner_mode')::boolean = FALSE"
    else:
        mode_filter = ""

    rows = await session.execute(
        sql_text(f"""
            SELECT created_at,
                   session_id,
                   brain_input->>'sender_id'    AS sender_id,
                   brain_input->>'owner_mode'   AS owner_mode,
                   brain_input->>'message'      AS message,
                   LEFT(response, 200)          AS response_preview,
                   confidence,
                   latency_ms,
                   path,
                   needs_escalation
            FROM reasoning_traces
            WHERE clone_id = :cid
              AND created_at >= NOW() - MAKE_INTERVAL(days => :days)
              {mode_filter}
            ORDER BY created_at DESC
            LIMIT 10000
        """),
        {"cid": str(clone_id), "days": days},
    )
    records = rows.mappings().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "session_id", "sender_id", "query_type", "message", "response_preview", "confidence", "latency_ms", "path", "needs_escalation"])
    for r in records:
        query_type = "owner" if str(r.get("owner_mode", "")).lower() == "true" else "consumer"
        writer.writerow([
            r["created_at"].isoformat() if r["created_at"] else "",
            str(r["session_id"]) if r["session_id"] else "",
            r["sender_id"] or "",
            query_type,
            r["message"] or "",
            (r["response_preview"] or "").replace("\n", " "),
            round(float(r["confidence"] or 0), 3),
            r["latency_ms"] or "",
            r["path"] or "",
            r["needs_escalation"],
        ])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=activity-report-{days}d.csv"},
    )


# ---------------------------------------------------------------------------
# MEETING BOT — Recall.ai integration
# ---------------------------------------------------------------------------


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
        try:
            from doppel.brain.learning.feedback import record_feedback
            await record_feedback(
                session,
                FeedbackSignal(
                    trace_id=UUID(str(meta["trace_id"])),
                    clone_id=UUID(str(meta["clone_id"])),
                    signal_type=body.status,
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

    clone_id = record["clone_id"]
    raw_key = "dak_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
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
    """Create a new org (team workspace). Requires enterprise_pro or enterprise_max plan."""

    tier_row = await session.execute(
        sql_text("SELECT subscription_tier, clone_id FROM clone_identity WHERE user_id = :uid LIMIT 1"),
        {"uid": body.user_id},
    )
    record = tier_row.mappings().first()
    tier = (record or {}).get("subscription_tier") or "free"
    if tier not in ("personal", "enterprise_pro", "enterprise_max"):
        raise HTTPException(status_code=403, detail="Creating an organisation requires a paid plan.")

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
        # Auto-add owner as admin member (clone_id may be null if user has no clone yet)
        clone_id = record.get("clone_id") if record else None
        await session.execute(
            sql_text("""
                INSERT INTO org_memberships (org_id, user_id, clone_id, role)
                VALUES (:oid, :uid, :cid, 'admin')
            """),
            {"oid": str(org["id"]), "uid": body.user_id, "cid": str(clone_id) if clone_id else None},
        )
        await session.commit()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Org slug already taken")
        _log.error("org creation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"org_id": str(org["id"]), "name": body.name, "slug": body.slug}


@app.delete("/org")
async def delete_org(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete the org the user owns. Only the owner can delete."""
    row = await session.execute(
        sql_text("SELECT id FROM orgs WHERE owner_user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="No org found or you are not the owner")
    await session.execute(
        sql_text("DELETE FROM orgs WHERE id = :oid"),
        {"oid": str(rec["id"])},
    )
    await session.commit()
    return {"ok": True}


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


class AddOrgMemberRequest(BaseModel):
    admin_user_id: str
    target_user_id: str
    role: str = "member"


@app.post("/org/members")
async def add_org_member(
    body: AddOrgMemberRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Directly add a user to the org by user_id. Caller must be org admin."""
    # Verify caller is admin
    admin_row = await session.execute(
        sql_text("""
            SELECT o.id AS org_id
            FROM orgs o
            JOIN org_memberships m ON m.org_id = o.id
            WHERE m.user_id = :uid AND m.role = 'admin'
            LIMIT 1
        """),
        {"uid": body.admin_user_id},
    )
    rec = admin_row.mappings().first()
    if not rec:
        raise HTTPException(status_code=403, detail="Admin access required")

    org_id = str(rec["org_id"])

    # Check if already a member
    existing = await session.execute(
        sql_text("SELECT 1 FROM org_memberships WHERE org_id = :oid AND user_id = :uid"),
        {"oid": org_id, "uid": body.target_user_id},
    )
    if existing.first():
        return {"status": "already_member", "user_id": body.target_user_id}

    await session.execute(
        sql_text("""
            INSERT INTO org_memberships (org_id, user_id, role)
            VALUES (:oid, :uid, :role)
        """),
        {"oid": org_id, "uid": body.target_user_id, "role": body.role},
    )
    await session.commit()
    return {"status": "added", "user_id": body.target_user_id, "role": body.role}


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


@app.delete("/org/members/{target_user_id}")
async def remove_org_member(
    target_user_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Org admin removes a member. Cannot remove yourself if you're the only admin."""
    admin_user_id = request.headers.get("X-User-Id")
    if not admin_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin_row = (await session.execute(
        sql_text("SELECT org_id, role FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": admin_user_id},
    )).mappings().first()
    if not admin_row or admin_row["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only org admins can remove members")

    org_id = admin_row["org_id"]

    if admin_user_id == target_user_id:
        admin_count = (await session.execute(
            sql_text("SELECT COUNT(*) FROM org_memberships WHERE org_id = :oid AND role = 'admin'"),
            {"oid": str(org_id)},
        )).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="Cannot remove the only admin")

    result = await session.execute(
        sql_text("DELETE FROM org_memberships WHERE org_id = :oid AND user_id = :uid RETURNING user_id"),
        {"oid": str(org_id), "uid": target_user_id},
    )
    if not result.mappings().first():
        raise HTTPException(status_code=404, detail="Member not found in your org")

    await session.commit()
    return {"status": "removed", "user_id": target_user_id}


class SetCloneOrgAccessRequest(BaseModel):
    admin_user_id: str
    access_mode: str   # 'org_scoped' | 'private' | 'public' | 'allowlist'


@app.patch("/org/clones/{clone_id}/access")
async def set_clone_org_access(
    clone_id: str,
    body: SetCloneOrgAccessRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Org admin toggles a clone's access_mode. Clone must belong to an org member."""
    valid_modes = ("private", "allowlist", "public", "org_scoped")
    if body.access_mode not in valid_modes:
        raise HTTPException(status_code=422, detail=f"access_mode must be one of: {', '.join(valid_modes)}")

    admin_row = (await session.execute(
        sql_text("SELECT org_id, role FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": body.admin_user_id},
    )).mappings().first()
    if not admin_row or admin_row["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only org admins can change clone access")

    org_id = admin_row["org_id"]

    # Verify the clone belongs to a member of this org
    member_row = (await session.execute(
        sql_text("""
            SELECT om.user_id FROM org_memberships om
            JOIN clone_identity ci ON ci.user_id = om.user_id
            WHERE om.org_id = :oid AND ci.clone_id = :cid
            LIMIT 1
        """),
        {"oid": str(org_id), "cid": clone_id},
    )).mappings().first()
    if not member_row:
        raise HTTPException(status_code=404, detail="Clone not found in your org")

    await session.execute(
        sql_text("UPDATE clone_identity SET access_mode = :mode WHERE clone_id = :cid"),
        {"mode": body.access_mode, "cid": clone_id},
    )
    await session.commit()
    return {"status": "updated", "clone_id": clone_id, "access_mode": body.access_mode}


class OrgCloneMemberRequest(BaseModel):
    admin_user_id: str
    target_user_id: str


@app.post("/org/clones/{clone_id}/members", status_code=201)
async def org_grant_clone_access(
    clone_id: str,
    body: OrgCloneMemberRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Org admin grants a specific member viewer access to a clone."""
    admin_row = (await session.execute(
        sql_text("SELECT org_id, role FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": body.admin_user_id},
    )).mappings().first()
    if not admin_row or admin_row["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only org admins can grant clone access")

    org_id = admin_row["org_id"]

    # Verify clone belongs to org and target is an org member
    clone_row = (await session.execute(
        sql_text("""
            SELECT ci.clone_id FROM org_memberships om
            JOIN clone_identity ci ON ci.user_id = om.user_id
            WHERE om.org_id = :oid AND ci.clone_id = :cid LIMIT 1
        """),
        {"oid": str(org_id), "cid": clone_id},
    )).mappings().first()
    if not clone_row:
        raise HTTPException(status_code=404, detail="Clone not found in your org")

    target_row = (await session.execute(
        sql_text("SELECT user_id FROM org_memberships WHERE org_id = :oid AND user_id = :uid"),
        {"oid": str(org_id), "uid": body.target_user_id},
    )).mappings().first()
    if not target_row:
        raise HTTPException(status_code=404, detail="Target user is not in your org")

    await session.execute(
        sql_text("""
            INSERT INTO clone_permissions (clone_id, user_id, role, granted_by)
            VALUES (:cid, :uid, 'viewer', :granted_by)
            ON CONFLICT (clone_id, user_id) DO UPDATE SET role = 'viewer'
        """),
        {"cid": clone_id, "uid": body.target_user_id, "granted_by": body.admin_user_id},
    )
    await session.commit()
    return {"status": "granted", "clone_id": clone_id, "user_id": body.target_user_id}


@app.delete("/org/clones/{clone_id}/members/{target_user_id}")
async def org_revoke_clone_access(
    clone_id: str,
    target_user_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Org admin revokes a specific member's viewer access to a clone."""
    admin_user_id = request.headers.get("X-User-Id")
    if not admin_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin_row = (await session.execute(
        sql_text("SELECT org_id, role FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": admin_user_id},
    )).mappings().first()
    if not admin_row or admin_row["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only org admins can revoke clone access")

    await session.execute(
        sql_text("DELETE FROM clone_permissions WHERE clone_id = :cid AND user_id = :uid"),
        {"cid": clone_id, "uid": target_user_id},
    )
    await session.commit()
    return {"status": "revoked", "clone_id": clone_id, "user_id": target_user_id}


@app.get("/org/clones/{clone_id}/members")
async def org_list_clone_members(
    clone_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Org admin: list which org members have explicit access to a clone."""
    admin_user_id = request.headers.get("X-User-Id")
    if not admin_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin_row = (await session.execute(
        sql_text("SELECT org_id, role FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": admin_user_id},
    )).mappings().first()
    if not admin_row or admin_row["role"] != "admin":
        raise HTTPException(status_code=403, detail="Org admin access required")

    rows = await session.execute(
        sql_text("""
            SELECT cp.user_id, cp.role, cp.created_at
            FROM clone_permissions cp
            WHERE cp.clone_id = :cid
        """),
        {"cid": clone_id},
    )
    return {
        "members": [
            {"user_id": r["user_id"], "role": r["role"], "granted_at": r["created_at"].isoformat() if r["created_at"] else None}
            for r in rows.mappings().all()
        ]
    }


@app.get("/org/clones")
async def get_org_clones(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return all org-scoped clones visible to the calling member."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    rows = await session.execute(
        sql_text("""
            SELECT
                ci.clone_id, ci.display_name, ci.handle,
                ci.avatar_url, ci.category, ci.listing_description,
                ci.price_per_query, ci.total_queries,
                ci.is_verified,
                om_owner.role AS member_role,
                o.name AS org_name, o.id AS org_id
            FROM org_memberships om_me
            JOIN orgs o ON o.id = om_me.org_id
            JOIN org_memberships om_owner ON om_owner.org_id = om_me.org_id
            JOIN clone_identity ci ON ci.user_id = om_owner.user_id
            WHERE om_me.user_id = :uid
              AND ci.access_mode = 'org_scoped'
            ORDER BY om_owner.joined_at ASC
        """),
        {"uid": user_id},
    )
    clones = [
        {
            "clone_id": str(r["clone_id"]),
            "display_name": r["display_name"],
            "handle": r["handle"],
            "avatar_url": r["avatar_url"],
            "category": r["category"],
            "description": (r["listing_description"] or "")[:180],
            "price_per_query": float(r["price_per_query"] or 0),
            "total_queries": int(r["total_queries"] or 0),
            "is_verified": bool(r["is_verified"]),
            "member_role": r["member_role"],
            "org_name": r["org_name"],
            "org_id": str(r["org_id"]),
        }
        for r in rows.mappings().all()
    ]
    org_name = clones[0]["org_name"] if clones else None
    return {"clones": clones, "org_name": org_name}


@app.get("/org/admin/clones")
async def get_org_all_clones(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Admin: return ALL clones owned by org members, with their current access_mode."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin_row = (await session.execute(
        sql_text("SELECT org_id, role FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )).mappings().first()
    if not admin_row or admin_row["role"] != "admin":
        raise HTTPException(status_code=403, detail="Org admin access required")

    rows = await session.execute(
        sql_text("""
            SELECT ci.clone_id, ci.display_name, ci.handle,
                   ci.avatar_url, ci.category, ci.listing_description,
                   ci.access_mode, ci.price_per_query, ci.total_queries,
                   ci.user_id AS owner_user_id,
                   om.role AS member_role
            FROM org_memberships om
            JOIN clone_identity ci ON ci.user_id = om.user_id
            WHERE om.org_id = :oid
            ORDER BY om.joined_at ASC, ci.display_name ASC
        """),
        {"oid": str(admin_row["org_id"])},
    )
    return {
        "clones": [
            {
                "clone_id": str(r["clone_id"]),
                "display_name": r["display_name"],
                "handle": r["handle"],
                "avatar_url": r["avatar_url"],
                "category": r["category"],
                "description": (r["listing_description"] or "")[:120],
                "access_mode": r["access_mode"],
                "price_per_query": float(r["price_per_query"] or 0),
                "total_queries": int(r["total_queries"] or 0),
                "owner_user_id": r["owner_user_id"],
                "member_role": r["member_role"],
            }
            for r in rows.mappings().all()
        ],
        "org_id": str(admin_row["org_id"]),
    }


@app.get("/org/credits")
async def get_org_credits(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the shared credit pool balance for the caller's org."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    org_row = (await session.execute(
        sql_text("SELECT org_id FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )).mappings().first()
    if not org_row:
        return {"credits": 0, "org_id": None}

    org_id = str(org_row["org_id"])
    pool_row = (await session.execute(
        sql_text("SELECT credits FROM org_credit_pools WHERE org_id = :oid"),
        {"oid": org_id},
    )).mappings().first()
    return {"credits": int(pool_row["credits"]) if pool_row else 0, "org_id": org_id}


class AddOrgCreditsRequest(BaseModel):
    credits: int   # must be > 0


@app.post("/org/credits/add")
async def add_org_credits(
    body: AddOrgCreditsRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Any org member can transfer personal credits into the shared org pool."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if body.credits <= 0:
        raise HTTPException(status_code=422, detail="credits must be positive")

    # Verify org membership
    org_row = (await session.execute(
        sql_text("SELECT org_id FROM org_memberships WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    )).mappings().first()
    if not org_row:
        raise HTTPException(status_code=403, detail="Not a member of any org")
    org_id = str(org_row["org_id"])

    # Verify personal balance
    personal_row = (await session.execute(
        sql_text("SELECT credits_remaining FROM query_credits WHERE user_id = :uid"),
        {"uid": user_id},
    )).mappings().first()
    if not personal_row or personal_row["credits_remaining"] < body.credits:
        raise HTTPException(status_code=402, detail="Insufficient personal credits")

    # Transfer: deduct personal, add to pool
    await session.execute(
        sql_text("UPDATE query_credits SET credits_remaining = credits_remaining - :c, updated_at = NOW() WHERE user_id = :uid"),
        {"c": body.credits, "uid": user_id},
    )
    await session.execute(
        sql_text("""
            INSERT INTO org_credit_pools (org_id, credits, updated_at)
            VALUES (:oid, :c, NOW())
            ON CONFLICT (org_id) DO UPDATE
            SET credits = org_credit_pools.credits + :c, updated_at = NOW()
        """),
        {"oid": org_id, "c": body.credits},
    )
    await session.commit()

    pool_row = (await session.execute(
        sql_text("SELECT credits FROM org_credit_pools WHERE org_id = :oid"),
        {"oid": org_id},
    )).mappings().first()
    return {
        "status": "transferred",
        "personal_credits_remaining": personal_row["credits_remaining"] - body.credits,
        "org_credits": int(pool_row["credits"]) if pool_row else body.credits,
    }


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


class JoinByTokenRequest(BaseModel):
    user_id: str
    token: str


@app.get("/org/join-token")
async def get_org_join_token(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return (or lazily create) the shareable join-link token for the caller's org. Admin only."""
    # Resolve org + check admin
    row = await session.execute(
        sql_text("""
            SELECT o.id AS org_id, m.role
            FROM orgs o
            JOIN org_memberships m ON m.org_id = o.id
            WHERE m.user_id = :uid
            LIMIT 1
        """),
        {"uid": user_id},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not in an org")
    if rec["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin required")

    org_id = str(rec["org_id"])

    # Fetch existing token
    tok_row = await session.execute(
        sql_text("SELECT token, use_count FROM org_join_tokens WHERE org_id = :oid LIMIT 1"),
        {"oid": org_id},
    )
    tok = tok_row.mappings().first()
    if not tok:
        # Create one — generate token in Python to avoid pgcrypto dependency
        new_token = secrets.token_hex(16)
        tok_row2 = await session.execute(
            sql_text("""
                INSERT INTO org_join_tokens (token, org_id, role, created_by)
                VALUES (:tok, :oid, 'member', :uid)
                RETURNING token, use_count
            """),
            {"tok": new_token, "oid": org_id, "uid": user_id},
        )
        tok = tok_row2.mappings().first()
        await session.commit()

    return {"token": tok["token"], "use_count": int(tok["use_count"])}


@app.post("/org/join-token/reset")
async def reset_org_join_token(
    body: dict,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Revoke existing token and issue a new one. Admin only."""
    uid = body.get("user_id", "")
    row = await session.execute(
        sql_text("""
            SELECT o.id AS org_id, m.role
            FROM orgs o JOIN org_memberships m ON m.org_id = o.id
            WHERE m.user_id = :uid LIMIT 1
        """),
        {"uid": uid},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not in an org")
    if rec["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin required")

    org_id = str(rec["org_id"])
    await session.execute(
        sql_text("DELETE FROM org_join_tokens WHERE org_id = :oid"),
        {"oid": org_id},
    )
    new_token_val = secrets.token_hex(16)
    tok_row = await session.execute(
        sql_text("""
            INSERT INTO org_join_tokens (token, org_id, role, created_by)
            VALUES (:tok, :oid, 'member', :uid)
            RETURNING token
        """),
        {"tok": new_token_val, "oid": org_id, "uid": uid},
    )
    new_token = tok_row.mappings().first()["token"]
    await session.commit()
    return {"token": new_token}


@app.get("/org/by-token/{token}")
async def get_org_by_token(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Public endpoint — look up org info by join token (for the /join/[token] landing page)."""
    row = await session.execute(
        sql_text("""
            SELECT o.id, o.name, o.slug,
                   t.use_count,
                   (SELECT COUNT(*) FROM org_memberships WHERE org_id = o.id) AS member_count
            FROM org_join_tokens t
            JOIN orgs o ON o.id = t.org_id
            WHERE t.token = :tok
        """),
        {"tok": token},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")
    return {
        "org_id": str(rec["id"]),
        "name": rec["name"],
        "slug": rec["slug"],
        "member_count": int(rec["member_count"]),
    }


@app.post("/org/join-by-token")
async def join_org_by_token(
    body: JoinByTokenRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Join an org via a shareable token link."""
    row = await session.execute(
        sql_text("""
            SELECT t.org_id, t.role, o.name, o.slug, o.owner_user_id
            FROM org_join_tokens t
            JOIN orgs o ON o.id = t.org_id
            WHERE t.token = :tok
        """),
        {"tok": body.token},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")

    org_id = str(rec["org_id"])

    # Already a member?
    existing = await session.execute(
        sql_text("SELECT 1 FROM org_memberships WHERE org_id = :oid AND user_id = :uid"),
        {"oid": org_id, "uid": body.user_id},
    )
    if existing.first():
        return {"status": "already_member", "org": {"id": org_id, "name": rec["name"], "slug": rec["slug"]}}

    # Resolve clone_id (nullable)
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
            "oid": org_id, "uid": body.user_id,
            "cid": str(clone_rec["clone_id"]) if clone_rec else None,
            "role": rec["role"],
        },
    )
    await session.execute(
        sql_text("UPDATE org_join_tokens SET use_count = use_count + 1 WHERE token = :tok"),
        {"tok": body.token},
    )
    await session.commit()

    return {"status": "joined", "org": {"id": org_id, "name": rec["name"], "slug": rec["slug"]}}


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

async def _auth_dev_key(
    request: Request,
    session: AsyncSession,
) -> tuple[str, str]:
    """Validate Bearer dak_ token, return (clone_id, handle)."""

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    raw_key = auth_header.removeprefix("Bearer ").strip()
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

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
    clone_id: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return all identity layers for the owner's clone.
    If clone_id is provided, returns that specific clone (must be owned by user_id).
    """
    if clone_id:
        row = await session.execute(
            sql_text("""
                SELECT clone_id, style_fingerprint, value_system,
                       epistemic_profile, admin_policies,
                       is_preserved, legal_hold_until,
                       retention_days_episodic, retention_days_traces
                FROM clone_identity WHERE user_id = :uid AND clone_id = :cid
            """),
            {"uid": user_id, "cid": clone_id},
        )
    else:
        row = await session.execute(
            sql_text("""
                SELECT clone_id, style_fingerprint, value_system,
                       epistemic_profile, admin_policies,
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
    clone_id: str | None = None  # optional; if omitted, targets the first clone for user_id


@app.patch("/identity")
async def patch_identity(
    body: PatchIdentityRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Partial-update one identity layer (merges with existing)."""

    allowed = {"style_fingerprint", "value_system", "epistemic_profile"}
    if body.layer not in allowed:
        raise HTTPException(status_code=422, detail=f"layer must be one of: {allowed}")

    if body.clone_id:
        row = await session.execute(
            sql_text("SELECT clone_id FROM clone_identity WHERE user_id = :uid AND clone_id = :cid"),
            {"uid": body.user_id, "cid": body.clone_id},
        )
    else:
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
        "gmail": {"connected": "gmail" in connected, "configured": bool(settings.google_client_id), **connected.get("gmail", {})},
        "github": {"connected": "github" in connected, "configured": bool(settings.github_client_id), **connected.get("github", {})},
        "notion": {"connected": "notion" in connected, "configured": bool(settings.notion_client_id), **connected.get("notion", {})},
        "slack": {"configured": bool(settings.slack_client_id)},
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
    async with httpx.AsyncClient(timeout=15) as client:
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
    import time as _tm

    body_bytes = await request.body()

    # Verify Slack signature
    if settings.slack_signing_secret:
        timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
        if abs(_tm.time() - int(timestamp or 0)) > 300:
            raise HTTPException(status_code=403, detail="Request too old")
        sig_base = f"v0:{timestamp}:{body_bytes.decode()}"
        expected = "v0=" + hmac.new(
            settings.slack_signing_secret.encode(),
            sig_base.encode(),
            hashlib.sha256,
        ).hexdigest()
        received = request.headers.get("X-Slack-Signature", "")
        if not hmac.compare_digest(expected, received):
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
            async with httpx.AsyncClient(timeout=10) as hx:
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

        async with httpx.AsyncClient(timeout=15) as client:
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

        async with httpx.AsyncClient(timeout=20, headers=headers) as client:
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

    # Cascade in FK-safe order (agent_queries uses org_id, not clone_id — excluded)
    for table in [
        "access_audit_log", "clone_permissions",
        "bundle_clone_members", "consumer_bundle_items",
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


@app.delete("/clones/{handle}")
async def delete_clone_by_handle(
    handle: str,
    caller_user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete a specific clone by handle. Caller must be the owner."""
    clone_row = await session.execute(
        sql_text("""
            SELECT clone_id, user_id, is_preserved, legal_hold_until
            FROM clone_identity WHERE handle = :h
        """),
        {"h": handle},
    )
    clone = clone_row.mappings().first()
    if not clone:
        raise HTTPException(status_code=404, detail="Clone not found")
    if str(clone["user_id"]) != caller_user_id:
        raise HTTPException(status_code=403, detail="Not the clone owner")

    _guard_preserved(dict(clone), "delete")

    clone_id = str(clone["clone_id"])

    # agent_queries uses org_id, not clone_id — excluded from cascade
    for table in [
        "access_audit_log", "clone_permissions",
        "bundle_clone_members", "consumer_bundle_items",
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
    return {"status": "deleted", "clone_id": clone_id, "handle": handle}



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

    # Build a compact conversation context string from the session history
    conversation_history: list[dict] = payload.get("conversation_history", [])
    session_context: str = ""
    if conversation_history:
        lines = []
        for msg in conversation_history[-20:]:  # last 20 messages max
            role = "User" if msg.get("role") == "user" else "Clone"
            content = str(msg.get("content", "")).strip()
            if content:
                lines.append(f"{role}: {content}")
        if lines:
            session_context = "\n".join(lines)

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
            session_context=session_context,
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


# ---------------------------------------------------------------------------
# KNOWLEDGE GAPS — surfaces unanswered questions to the clone owner
# ---------------------------------------------------------------------------

@app.get("/clones/{handle}/knowledge-gaps")
async def get_knowledge_gaps(
    handle: str,
    limit: int = Query(default=50, le=200),
    request: Request = None,
    session: AsyncSession = Depends(get_session),
):
    """Return recent queries the clone couldn't answer from its training data."""
    caller_user_id = request.headers.get("X-User-Id") if request else None
    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    if rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=403, detail="Not your clone")

    gaps_row = await session.execute(
        sql_text("""
            SELECT query, asked_at,
                   COUNT(*) OVER (PARTITION BY query) AS freq
            FROM knowledge_gaps
            WHERE clone_id = :cid
            ORDER BY asked_at DESC
            LIMIT :limit
        """),
        {"cid": str(rec["clone_id"]), "limit": limit},
    )
    gaps = [dict(r) for r in gaps_row.mappings().all()]
    return {"gaps": gaps, "total": len(gaps)}


# ---------------------------------------------------------------------------
# KNOWLEDGE MAP — what areas the clone knows well (public)
# ---------------------------------------------------------------------------

@app.get("/clones/{handle}/knowledge-map")
async def get_knowledge_map(
    handle: str,
    session: AsyncSession = Depends(get_session),
):
    """Return knowledge depth per domain — public endpoint, no auth needed."""
    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    clone_id = str(rec["clone_id"])

    domain_rows = await session.execute(
        sql_text("""
            SELECT domain, COUNT(*) AS count, AVG(confidence) AS avg_confidence
            FROM semantic_memory
            WHERE clone_id = :cid
            GROUP BY domain
            ORDER BY count DESC
            LIMIT 20
        """),
        {"cid": clone_id},
    )
    domains = [dict(r) for r in domain_rows.mappings().all()]

    topic_rows = await session.execute(
        sql_text("""
            SELECT unnest(topics) AS topic, COUNT(*) AS count
            FROM episodic_memory
            WHERE clone_id = :cid AND topics IS NOT NULL AND array_length(topics, 1) > 0
            GROUP BY topic
            ORDER BY count DESC
            LIMIT 20
        """),
        {"cid": clone_id},
    )
    topics = [dict(r) for r in topic_rows.mappings().all()]

    def depth_label(count: int, max_c: int) -> str:
        if max_c == 0:
            return "some"
        frac = count / max_c
        if frac > 0.45:
            return "deep"
        if frac > 0.18:
            return "solid"
        return "some"

    max_domain = max((d["count"] for d in domains), default=1)
    areas = []
    seen: set[str] = set()

    for d in domains:
        label = (d["domain"] or "general").strip()
        if label and label not in seen:
            seen.add(label)
            areas.append({
                "area": label,
                "depth": depth_label(d["count"], max_domain),
                "fact_count": d["count"],
            })

    max_topic = max((t["count"] for t in topics), default=1)
    for t in topics:
        label = (t["topic"] or "").strip()
        if label and label not in seen and len(areas) < 14:
            seen.add(label)
            areas.append({
                "area": label,
                "depth": depth_label(t["count"], max_topic),
                "fact_count": t["count"],
            })

    return {"areas": areas[:12]}


# ---------------------------------------------------------------------------
# SUGGESTED QUESTIONS — dynamically generated from top knowledge (public)
# ---------------------------------------------------------------------------

@app.get("/clones/{handle}/autocomplete")
async def get_autocomplete(
    handle: str,
    q: str = "",
    session: AsyncSession = Depends(get_session),
):
    """
    Live autocomplete for the chat composer.
    q = partial input typed by the user (can be empty for opening suggestions).
    Returns up to 4 completions fast (Haiku, ~200ms target).
    """
    import json as _json

    row = await session.execute(
        sql_text("SELECT clone_id, display_name FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    clone_id = str(rec["clone_id"])
    name = rec["display_name"] or handle

    # Fetch lightweight context — top facts + topic labels
    fact_rows = await session.execute(
        sql_text("""
            SELECT fact FROM semantic_memory
            WHERE clone_id = :cid
            ORDER BY confidence DESC LIMIT 8
        """),
        {"cid": clone_id},
    )
    facts = [r["fact"][:100] for r in fact_rows.mappings().all()]

    topic_rows = await session.execute(
        sql_text("""
            SELECT unnest(topics) AS topic, COUNT(*) AS c
            FROM episodic_memory
            WHERE clone_id = :cid AND topics IS NOT NULL AND array_length(topics,1) > 0
            GROUP BY topic ORDER BY c DESC LIMIT 6
        """),
        {"cid": clone_id},
    )
    topics = [r["topic"] for r in topic_rows.mappings().all() if r.get("topic")]

    if not facts and not topics:
        return {"suggestions": []}

    context = f"Areas: {', '.join(topics) or 'various'}. Sample facts: {'; '.join(facts[:4])}"
    q_stripped = q.strip()

    if q_stripped:
        prompt = (
            f"Knowledge clone: {name}. Context: {context}\n"
            f"User is typing: \"{q_stripped}\"\n"
            f"Complete this into 4 specific questions they might be asking, "
            f"each building on what they already typed. Be concrete — use real topics from the context. "
            f"Return JSON array of 4 strings. No other text."
        )
    else:
        prompt = (
            f"Knowledge clone: {name}. Context: {context}\n"
            f"Generate 4 specific opening questions a user would genuinely want to ask this person. "
            f"Use real topics from the context, not generic questions. "
            f"Return JSON array of 4 strings. No other text."
        )

    client = get_anthropic_client()
    msg = await client.messages.create(
        model=settings.classification_model,
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        suggestions = _json.loads(raw)
        return {"suggestions": [str(s) for s in suggestions[:4]]}
    except Exception:
        return {"suggestions": []}


@app.get("/clones/{handle}/suggested-questions")
async def get_suggested_questions(
    handle: str,
    session: AsyncSession = Depends(get_session),
):
    """Return 5 Haiku-generated questions specific to what this clone knows best."""
    import json as _json

    row = await session.execute(
        sql_text("SELECT clone_id, display_name FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    clone_id = str(rec["clone_id"])
    name = rec["display_name"] or handle

    fact_rows = await session.execute(
        sql_text("""
            SELECT fact, domain
            FROM semantic_memory
            WHERE clone_id = :cid
            ORDER BY confidence DESC
            LIMIT 10
        """),
        {"cid": clone_id},
    )
    facts = [dict(r) for r in fact_rows.mappings().all()]

    topic_rows = await session.execute(
        sql_text("""
            SELECT unnest(topics) AS topic, COUNT(*) AS count
            FROM episodic_memory
            WHERE clone_id = :cid AND topics IS NOT NULL AND array_length(topics, 1) > 0
            GROUP BY topic
            ORDER BY count DESC
            LIMIT 8
        """),
        {"cid": clone_id},
    )
    topics = [dict(r) for r in topic_rows.mappings().all()]

    if not facts and not topics:
        return {"questions": []}

    fact_lines = "\n".join(f"- {f['fact'][:120]}" for f in facts[:6])
    topic_str = ", ".join(t["topic"] for t in topics[:6] if t.get("topic"))

    prompt = (
        f"You are generating suggested questions for a knowledge clone named {name}.\n"
        f"Their strongest knowledge areas: {topic_str or 'various topics'}\n"
        f"Sample facts from their training data:\n{fact_lines}\n\n"
        f"Generate exactly 5 specific, concrete questions a person would genuinely want to ask this person. "
        f"Make them specific to what this person actually knows, not generic. "
        f"Sound like a real question a colleague or fan would ask. "
        f"Return a JSON array of exactly 5 question strings. No other text."
    )

    client = get_anthropic_client()
    msg = await client.messages.create(
        model=settings.classification_model,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        raw = msg.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        questions = _json.loads(raw)
        return {"questions": [str(q) for q in questions[:5]]}
    except Exception:
        return {"questions": []}


# ---------------------------------------------------------------------------
# RESPONSE FEEDBACK — per-message thumbs up/down
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    trace_id: str | None = None
    session_id: str | None = None
    helpful: bool
    note: str | None = None


@app.post("/clones/{handle}/feedback")
async def submit_response_feedback(
    handle: str,
    body: FeedbackRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Consumer submits thumbs up or down on a response."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")

    await session.execute(
        sql_text("""
            INSERT INTO response_feedback
              (clone_id, trace_id, session_id, rater_user_id, helpful, note)
            VALUES (:cid, :tid, :sid, :uid, :helpful, :note)
        """),
        {
            "cid": str(rec["clone_id"]),
            "tid": body.trace_id,
            "sid": body.session_id,
            "uid": caller_user_id,
            "helpful": body.helpful,
            "note": body.note,
        },
    )
    await session.commit()
    return {"ok": True}


@app.get("/clones/{handle}/feedback-summary")
async def get_feedback_summary(
    handle: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Return helpful/unhelpful counts for the clone owner."""
    caller_user_id = request.headers.get("X-User-Id")
    row = await session.execute(
        sql_text("SELECT clone_id, user_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")
    if rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=403, detail="Not your clone")

    counts = await session.execute(
        sql_text("""
            SELECT
                COUNT(*) FILTER (WHERE helpful = true)  AS thumbs_up,
                COUNT(*) FILTER (WHERE helpful = false) AS thumbs_down,
                COUNT(*)                                AS total
            FROM response_feedback
            WHERE clone_id = :cid
        """),
        {"cid": str(rec["clone_id"])},
    )
    c = counts.mappings().first()
    return {
        "thumbs_up": int(c["thumbs_up"] or 0),
        "thumbs_down": int(c["thumbs_down"] or 0),
        "total": int(c["total"] or 0),
    }


# ---------------------------------------------------------------------------
# CHAT CONSENT — record consumer consent for memory building
# ---------------------------------------------------------------------------

class ConsentRequest(BaseModel):
    consent: bool  # True = accept, False = decline (anonymous mode)


@app.post("/clones/{handle}/consent")
async def record_chat_consent(
    handle: str,
    body: ConsentRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Record whether the consumer agreed to have the clone remember them."""
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Login required")

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")

    await session.execute(
        sql_text("""
            INSERT INTO consumer_profiles (clone_id, consumer_user_id, consent_given, consent_given_at)
            VALUES (:cid, :uid, :consent, NOW())
            ON CONFLICT (clone_id, consumer_user_id) DO UPDATE
              SET consent_given = :consent, consent_given_at = NOW()
        """),
        {"cid": str(rec["clone_id"]), "uid": caller_user_id, "consent": body.consent},
    )
    await session.commit()
    return {"ok": True, "consent": body.consent}


@app.get("/clones/{handle}/consent")
async def get_chat_consent(
    handle: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Return the user's current consent status for this clone."""
    caller_user_id = request.headers.get("X-User-Id")
    if not caller_user_id:
        return {"consent": None}

    row = await session.execute(
        sql_text("SELECT clone_id FROM clone_identity WHERE handle = :h"),
        {"h": handle},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found")

    consent_row = await session.execute(
        sql_text("""
            SELECT consent_given FROM consumer_profiles
            WHERE clone_id = :cid AND consumer_user_id = :uid
        """),
        {"cid": str(rec["clone_id"]), "uid": caller_user_id},
    )
    result = consent_row.mappings().first()
    return {"consent": result["consent_given"] if result else None}


# ---------------------------------------------------------------------------
# MCP TOOL SERVERS — per-clone connected external tools
# ---------------------------------------------------------------------------

class MCPServerCreate(BaseModel):
    name: str
    server_url: str
    transport: str = "streamablehttp"
    api_key: str | None = None
    extra_headers: dict | None = None   # additional HTTP headers (e.g. OAuth tokens)


async def _assert_clone_owner(clone_id: UUID, caller_user_id: str | None, session: AsyncSession) -> None:
    """Raise 403 unless the caller owns the clone."""
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    row = await session.execute(
        sql_text("SELECT user_id FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Clone not found.")
    if rec["user_id"] != caller_user_id:
        raise HTTPException(status_code=403, detail="Only the clone owner can manage tools.")


@app.get("/clones/{clone_id}/tools")
async def list_mcp_servers(
    clone_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """List all MCP servers connected to this clone."""
    caller = request.headers.get("X-User-Id")
    await _assert_clone_owner(clone_id, caller, session)

    rows = await session.execute(
        sql_text(
            "SELECT id, name, server_url, transport, tool_names, enabled, created_at "
            "FROM clone_mcp_servers WHERE clone_id = :cid ORDER BY created_at"
        ),
        {"cid": str(clone_id)},
    )
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "server_url": r["server_url"],
            "transport": r["transport"],
            "tool_names": r["tool_names"] or [],
            "enabled": r["enabled"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows.mappings().all()
    ]


@app.post("/clones/{clone_id}/tools")
async def add_mcp_server(
    clone_id: UUID,
    body: MCPServerCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Connect a new MCP server to this clone."""
    from doppel.brain.security.encryption import encrypt_field
    import json as _json

    caller = request.headers.get("X-User-Id")
    await _assert_clone_owner(clone_id, caller, session)

    api_key_enc = encrypt_field(body.api_key) if body.api_key else None
    headers_enc = encrypt_field(_json.dumps(body.extra_headers)) if body.extra_headers else None

    row = await session.execute(
        sql_text(
            "INSERT INTO clone_mcp_servers (clone_id, name, server_url, transport, api_key_enc, headers_enc) "
            "VALUES (:cid, :name, :url, :transport, :api_key_enc, :headers_enc) "
            "RETURNING id"
        ),
        {
            "cid": str(clone_id),
            "name": body.name,
            "url": body.server_url,
            "transport": body.transport,
            "api_key_enc": api_key_enc,
            "headers_enc": headers_enc,
        },
    )
    new_id = row.scalar()
    await session.commit()
    return {"id": str(new_id), "ok": True}


@app.delete("/clones/{clone_id}/tools/{tool_id}")
async def delete_mcp_server(
    clone_id: UUID,
    tool_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Remove an MCP server from this clone."""
    caller = request.headers.get("X-User-Id")
    await _assert_clone_owner(clone_id, caller, session)

    await session.execute(
        sql_text(
            "DELETE FROM clone_mcp_servers WHERE id = :tid AND clone_id = :cid"
        ),
        {"tid": str(tool_id), "cid": str(clone_id)},
    )
    await session.commit()
    return {"ok": True}


@app.post("/clones/{clone_id}/tools/{tool_id}/test")
async def test_mcp_server(
    clone_id: UUID,
    tool_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Test connectivity to an MCP server: call /tools/list, cache the tool names,
    and return the list of discovered tools.
    """
    import json as _json
    from doppel.brain.security.encryption import decrypt_field
    from doppel.brain.tools.mcp_client import MCPServer, list_tools

    caller = request.headers.get("X-User-Id")
    await _assert_clone_owner(clone_id, caller, session)

    row = await session.execute(
        sql_text(
            "SELECT id, name, server_url, transport, api_key_enc, headers_enc "
            "FROM clone_mcp_servers WHERE id = :tid AND clone_id = :cid"
        ),
        {"tid": str(tool_id), "cid": str(clone_id)},
    )
    rec = row.mappings().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Tool server not found.")

    api_key = decrypt_field(rec["api_key_enc"])
    extra_headers: dict = {}
    if rec["headers_enc"]:
        try:
            raw = decrypt_field(rec["headers_enc"])
            if raw:
                extra_headers = _json.loads(raw)
        except Exception:
            pass

    server = MCPServer(
        id=rec["id"],
        name=rec["name"],
        server_url=rec["server_url"],
        transport=rec["transport"],
        api_key=api_key,
        extra_headers=extra_headers,
    )

    tools = await list_tools(server)
    tool_names = [t["name"] for t in tools]

    # Cache discovered tool names
    await session.execute(
        sql_text(
            "UPDATE clone_mcp_servers SET tool_names = :names WHERE id = :tid"
        ),
        {"names": tool_names, "tid": str(tool_id)},
    )
    await session.commit()

    return {
        "ok": True,
        "tool_count": len(tools),
        "tools": [{"name": t["name"], "description": t.get("description", "")} for t in tools],
    }


# ---------------------------------------------------------------------------
# OAuth — preset tool connections (GitHub, Gmail, Google Calendar, etc.)
# ---------------------------------------------------------------------------

import base64 as _base64
from urllib.parse import urlencode as _urlencode
from fastapi.responses import HTMLResponse as _HTMLResponse

_PRESET_OAUTH: dict[str, dict] = {
    "github": {
        "name":              "GitHub Integration",
        "auth_url":          "https://github.com/login/oauth/authorize",
        "token_url":         "https://github.com/login/oauth/access_token",
        "scopes":            "repo read:user",
        "server_url":        "https://mcp.doppel.ai/github",
        "client_id_fn":      get_github_client_id,
        "client_secret_fn":  get_github_client_secret,
    },
    "gmail": {
        "name":              "Gmail",
        "auth_url":          "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url":         "https://oauth2.googleapis.com/token",
        "scopes":            "https://mail.google.com/",
        "server_url":        "https://mcp.doppel.ai/gmail",
        "client_id_fn":      get_google_client_id,
        "client_secret_fn":  get_google_client_secret,
        "extra_params":      {"access_type": "offline", "prompt": "consent"},
    },
    "gcal": {
        "name":              "Google Calendar",
        "auth_url":          "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url":         "https://oauth2.googleapis.com/token",
        "scopes":            "https://www.googleapis.com/auth/calendar",
        "server_url":        "https://mcp.doppel.ai/gcal",
        "client_id_fn":      get_google_client_id,
        "client_secret_fn":  get_google_client_secret,
        "extra_params":      {"access_type": "offline", "prompt": "consent"},
    },
    "gdrive": {
        "name":              "Google Drive",
        "auth_url":          "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url":         "https://oauth2.googleapis.com/token",
        "scopes":            "https://www.googleapis.com/auth/drive",
        "server_url":        "https://mcp.doppel.ai/gdrive",
        "client_id_fn":      get_google_client_id,
        "client_secret_fn":  get_google_client_secret,
        "extra_params":      {"access_type": "offline", "prompt": "consent"},
    },
    "slack": {
        "name":              "Slack",
        "auth_url":          "https://slack.com/oauth/v2/authorize",
        "token_url":         "https://slack.com/api/oauth.v2.access",
        "scopes":            "channels:read,chat:write,files:write,reactions:write",
        "server_url":        "https://mcp.doppel.ai/slack",
        "client_id_fn":      get_slack_client_id,
        "client_secret_fn":  get_slack_client_secret,
    },
    "notion": {
        "name":              "Notion",
        "auth_url":          "https://api.notion.com/v1/oauth/authorize",
        "token_url":         "https://api.notion.com/v1/oauth/token",
        "scopes":            "",
        "server_url":        "https://mcp.doppel.ai/notion",
        "client_id_fn":      get_notion_client_id,
        "client_secret_fn":  get_notion_client_secret,
        "token_auth":        "basic",
    },
    "linear": {
        "name":              "Linear",
        "auth_url":          "https://linear.app/oauth/authorize",
        "token_url":         "https://api.linear.app/oauth/token",
        "scopes":            "read write",
        "server_url":        "https://mcp.doppel.ai/linear",
        "client_id_fn":      lambda: os.environ.get("LINEAR_CLIENT_ID", ""),
        "client_secret_fn":  lambda: os.environ.get("LINEAR_CLIENT_SECRET", ""),
    },
}

_OAUTH_SUCCESS_HTML = """<!DOCTYPE html>
<html>
<head>
<title>Connected — doppel</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{ height: 100%; }}
  body {{
    background: #080808;
    color: rgba(255,255,255,0.75);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    overflow: hidden;
  }}
  /* Dotted grid background */
  body::before {{
    content: '';
    position: fixed;
    inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.065) 1px, transparent 1px);
    background-size: 28px 28px;
    -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent);
    mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent);
    pointer-events: none;
  }}
  /* Ambient glow */
  body::after {{
    content: '';
    position: fixed;
    width: 480px;
    height: 480px;
    border-radius: 50%;
    background: rgba(52,211,153,0.03);
    filter: blur(120px);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }}
  .card {{
    position: relative;
    z-index: 1;
    text-align: center;
    padding: 48px 40px;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    max-width: 380px;
    width: 90%;
    animation: fadeUp 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
  }}
  @keyframes fadeUp {{
    from {{ opacity: 0; transform: translateY(16px) scale(0.97); }}
    to   {{ opacity: 1; transform: translateY(0)    scale(1);    }}
  }}
  .mark {{
    width: 48px;
    height: 48px;
    border-radius: 13px;
    background: rgba(52,211,153,0.10);
    border: 1px solid rgba(52,211,153,0.20);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
  }}
  .checkmark {{
    width: 22px;
    height: 22px;
    color: rgba(52,211,153,0.85);
  }}
  .wordmark {{
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.22);
    margin-bottom: 20px;
  }}
  h2 {{
    font-size: 20px;
    font-weight: 500;
    color: rgba(255,255,255,0.85);
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }}
  p {{
    font-size: 13px;
    font-weight: 400;
    color: rgba(255,255,255,0.35);
    line-height: 1.6;
  }}
  .pill {{
    display: inline-block;
    margin-top: 20px;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(52,211,153,0.08);
    border: 1px solid rgba(52,211,153,0.18);
    font-size: 11px;
    color: rgba(52,211,153,0.65);
    letter-spacing: 0.01em;
  }}
</style>
</head>
<body>
<div class="card">
  <p class="wordmark">doppel</p>
  <div class="mark">
    <svg class="checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  </div>
  <h2>Connected</h2>
  <p>You can close this window and return to doppel.</p>
  <div class="pill">Authorization complete</div>
</div>
</body>
</html>"""

_OAUTH_ERROR_HTML = """<!DOCTYPE html>
<html>
<head><title>Connection failed — doppel</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{background:#080808;color:rgba(255,255,255,.75);font-family:system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh}}
  .card{{text-align:center;padding:40px 32px;border:1px solid rgba(248,113,113,.15);
        border-radius:16px;background:rgba(248,113,113,.04);max-width:360px}}
  h2{{font-size:18px;font-weight:500;margin-bottom:8px;color:rgba(248,113,113,.80)}}
  p{{font-size:13px;color:rgba(255,255,255,.35);line-height:1.5}}
</style>
</head>
<body>
<div class="card">
  <h2>Connection failed</h2>
  <p>{error}</p>
</div>
</body>
</html>"""


@app.get("/oauth/{service}/start")
async def oauth_start(
    service: str,
    clone_id: str = Query(...),
    user_id: str = Query(...),
):
    """Redirect browser to the OAuth provider login for a preset service."""
    if service not in _PRESET_OAUTH:
        raise HTTPException(status_code=404, detail=f"Unknown service: {service}")

    cfg = _PRESET_OAUTH[service]

    client_id = cfg["client_id_fn"]()
    if not client_id:
        return _HTMLResponse(
            content=_OAUTH_ERROR_HTML.format(
                error=f"{cfg['name']} OAuth is not configured on this server. "
                      f"Set the corresponding CLIENT_ID and CLIENT_SECRET environment variables."
            ),
            status_code=503,
        )

    state = _base64.urlsafe_b64encode(f"{clone_id}:{user_id}:{service}".encode()).decode()
    redirect_uri = f"{settings.backend_url}/oauth/{service}/callback"

    params: dict[str, str] = {
        "client_id":     client_id,
        "redirect_uri":  redirect_uri,
        "state":         state,
        "response_type": "code",
    }
    if cfg.get("scopes"):
        params["scope"] = cfg["scopes"]
    params.update(cfg.get("extra_params", {}))

    return RedirectResponse(url=f"{cfg['auth_url']}?{_urlencode(params)}")


@app.get("/oauth/{service}/callback")
async def oauth_callback(
    service: str,
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """Exchange OAuth code for access token and store in clone_mcp_servers."""
    if service not in _PRESET_OAUTH:
        return _HTMLResponse(content=_OAUTH_ERROR_HTML.format(error="Unknown service"), status_code=404)

    cfg = _PRESET_OAUTH[service]

    # Decode state: base64("{clone_id}:{user_id}:{service}")
    try:
        # Add padding in case it's missing
        padded = state + "=" * (-len(state) % 4)
        decoded = _base64.urlsafe_b64decode(padded.encode()).decode()
        clone_id_str, _user_id, _svc = decoded.rsplit(":", 2)
    except Exception:
        return _HTMLResponse(content=_OAUTH_ERROR_HTML.format(error="Invalid state parameter"), status_code=400)

    redirect_uri = f"{settings.backend_url}/oauth/{service}/callback"

    # Exchange code for access token
    try:
        token_body: dict = {
            "client_id":     cfg["client_id_fn"](),
            "client_secret": cfg["client_secret_fn"](),
            "code":          code,
            "redirect_uri":  redirect_uri,
            "grant_type":    "authorization_code",
        }
        req_headers = {"Accept": "application/json"}

        if cfg.get("token_auth") == "basic":
            # Notion expects Basic auth and only code+redirect in body
            cred_str = f"{cfg['client_id_fn']()}:{cfg['client_secret_fn']()}"
            b64 = _base64.b64encode(cred_str.encode()).decode()
            req_headers["Authorization"] = f"Basic {b64}"
            token_body = {"code": code, "redirect_uri": redirect_uri, "grant_type": "authorization_code"}

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(cfg["token_url"], data=token_body, headers=req_headers)
            token_json = resp.json()
    except Exception as exc:
        return _HTMLResponse(
            content=_OAUTH_ERROR_HTML.format(error=f"Token exchange failed: {exc}"),
            status_code=500,
        )

    # Extract access token — Slack bots nest under bot_token, users under authed_user
    access_token = (
        token_json.get("access_token")
        or token_json.get("bot_token")
        or (token_json.get("authed_user") or {}).get("access_token")
    )
    if not access_token:
        err = token_json.get("error") or token_json.get("error_description") or "No access token in response"
        return _HTMLResponse(content=_OAUTH_ERROR_HTML.format(error=err), status_code=400)

    enc_token = encrypt_field(access_token)

    # Store refresh token in headers_enc (Google services provide one)
    import json as _json
    refresh_token = token_json.get("refresh_token")
    headers_enc = encrypt_field(_json.dumps({"refresh_token": refresh_token})) if refresh_token else None

    # Upsert: update existing record for this clone+service, or insert new one
    existing = await session.execute(
        sql_text("SELECT id FROM clone_mcp_servers WHERE clone_id = :cid AND name = :name"),
        {"cid": clone_id_str, "name": cfg["name"]},
    )
    existing_row = existing.mappings().first()

    if existing_row:
        await session.execute(
            sql_text(
                "UPDATE clone_mcp_servers SET api_key_enc = :token, headers_enc = :henc "
                "WHERE id = :id"
            ),
            {"token": enc_token, "henc": headers_enc, "id": str(existing_row["id"])},
        )
    else:
        await session.execute(
            sql_text(
                "INSERT INTO clone_mcp_servers "
                "(clone_id, name, server_url, transport, api_key_enc, headers_enc) "
                "VALUES (:cid, :name, :url, 'streamablehttp', :token, :henc)"
            ),
            {
                "cid":   clone_id_str,
                "name":  cfg["name"],
                "url":   cfg["server_url"],
                "token": enc_token,
                "henc":  headers_enc,
            },
        )
    await session.commit()

    return _HTMLResponse(content=_OAUTH_SUCCESS_HTML)


# ---------------------------------------------------------------------------
# Twilio WhatsApp channel
# ---------------------------------------------------------------------------

def _twilio_validate_signature(auth_token: str, url: str, params: dict, signature: str) -> bool:
    """
    Validate a Twilio webhook request signature without the twilio SDK.
    Spec: https://www.twilio.com/docs/usage/webhooks/webhooks-security#validating-signatures-from-twilio
    """
    import base64
    import hashlib
    import hmac

    s = url + "".join(f"{k}{v}" for k, v in sorted(params.items()))
    expected = base64.b64encode(
        hmac.new(auth_token.encode(), s.encode(), hashlib.sha1).digest()
    ).decode()
    return hmac.compare_digest(expected, signature)


@app.post("/webhook/whatsapp/{clone_id}")
async def whatsapp_webhook(
    clone_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Twilio WhatsApp inbound webhook.

    Configure your Twilio number's "When a message comes in" webhook to:
      POST https://<your-domain>/webhook/whatsapp/<clone_id>

    Returns TwiML <Response><Message>...</Message></Response>.
    """
    from fastapi.responses import Response as _Response
    from uuid import UUID as _UUID
    import xml.etree.ElementTree as _ET

    def _twiml(body: str) -> _Response:
        root = _ET.Element("Response")
        msg = _ET.SubElement(root, "Message")
        msg.text = body
        return _Response(
            content=_ET.tostring(root, encoding="unicode"),
            media_type="application/xml",
        )

    # ── Validate Twilio signature ─────────────────────────────────────────
    if settings.twilio_auth_token:
        sig = request.headers.get("X-Twilio-Signature", "")
        form = await request.form()
        params = dict(form)
        url = str(request.url)
        if not _twilio_validate_signature(settings.twilio_auth_token, url, params, sig):
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    else:
        form = await request.form()
        params = dict(form)

    from_number = params.get("From", "")   # e.g. "whatsapp:+14155238886"
    body_text   = params.get("Body", "").strip()

    if not body_text:
        return _twiml("I didn't catch that — could you resend?")

    # ── Look up clone ─────────────────────────────────────────────────────
    try:
        cid = _UUID(clone_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid clone_id")

    clone_row = await session.execute(
        sql_text("SELECT clone_id FROM clones WHERE clone_id = :cid AND is_active = TRUE"),
        {"cid": str(cid)},
    )
    if not clone_row.fetchone():
        raise HTTPException(status_code=404, detail="Clone not found")

    # ── Run brain ─────────────────────────────────────────────────────────
    from doppel.brain.models.types import BrainInput
    from doppel.brain.orchestrator import DoppelBrain

    brain_input = BrainInput(
        clone_id=cid,
        message=body_text,
        context_type="chat",
        sender_id=from_number,
        owner_mode=False,
    )

    try:
        brain = DoppelBrain(session=session, clone_id=cid)
        output = await brain.process(brain_input)
        reply = output.response
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).error("WhatsApp brain error: %s", exc, exc_info=True)
        reply = "Something went wrong on my end — please try again in a moment."

    return _twiml(reply)
