"""
Native email sending — used by the workflow engine's 'send_email' action.

Provider priority:
  1. RESEND_API_KEY env var → Resend HTTP API (recommended for production)
  2. SMTP_HOST + SMTP_USER + SMTP_PASS env vars → generic SMTP
  3. No config → log-only mode (useful in dev)

Environment variables:
  RESEND_API_KEY    — Resend API key (get one free at resend.com)
  EMAIL_FROM        — sender address (default: clone@doppel.ai)
  EMAIL_FROM_NAME   — sender display name (default: Doppel)

  SMTP_HOST         — SMTP server host (default: smtp.gmail.com)
  SMTP_PORT         — SMTP port (default: 587)
  SMTP_USER         — SMTP username / Gmail address
  SMTP_PASS         — SMTP password / Gmail App Password
"""
from __future__ import annotations

import asyncio
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

_log = logging.getLogger(__name__)


async def send_email_native(to: str, subject: str, body: str) -> str:
    """
    Send an email using the best available provider.
    Returns a human-readable result string.
    """
    resend_key = os.getenv("RESEND_API_KEY")
    smtp_user  = os.getenv("SMTP_USER")
    smtp_pass  = os.getenv("SMTP_PASS")

    if resend_key:
        return await _send_resend(to, subject, body, resend_key)
    if smtp_user and smtp_pass:
        return await asyncio.to_thread(_send_smtp, to, subject, body, smtp_user, smtp_pass)

    _log.warning(
        "send_email_native: no provider configured. "
        "Set RESEND_API_KEY or SMTP_USER+SMTP_PASS to enable email. "
        "Would have sent to=%s subject=%s", to, subject
    )
    return (
        "[Email not sent — no provider configured. "
        "Set RESEND_API_KEY or SMTP_USER+SMTP_PASS in your .env file.]"
    )


async def _send_resend(to: str, subject: str, body: str, api_key: str) -> str:
    from_addr = os.getenv("EMAIL_FROM", "clone@doppel.ai")
    from_name = os.getenv("EMAIL_FROM_NAME", "Doppel")
    payload = {
        "from":    f"{from_name} <{from_addr}>",
        "to":      [to],
        "subject": subject,
        "text":    body,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as c:
            r = await c.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
        email_id = data.get("id", "unknown")
        _log.info("Email sent via Resend: id=%s to=%s", email_id, to)
        return f"Email sent to {to} (id: {email_id})"
    except httpx.HTTPStatusError as exc:
        _log.error("Resend API error %s: %s", exc.response.status_code, exc.response.text[:200])
        return f"[Email failed: Resend API {exc.response.status_code}]"
    except Exception as exc:
        _log.error("Resend send failed: %s", exc)
        return f"[Email failed: {exc}]"


def _send_smtp(to: str, subject: str, body: str, smtp_user: str, smtp_pass: str) -> str:
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    from_addr = os.getenv("EMAIL_FROM", smtp_user)
    from_name = os.getenv("EMAIL_FROM_NAME", "Doppel")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{from_name} <{from_addr}>"
    msg["To"]      = to
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(from_addr, [to], msg.as_string())
        _log.info("Email sent via SMTP to %s (subject: %s)", to, subject)
        return f"Email sent to {to}"
    except smtplib.SMTPAuthenticationError:
        return "[Email failed: SMTP authentication error — check SMTP_USER and SMTP_PASS]"
    except Exception as exc:
        _log.error("SMTP send failed: %s", exc)
        return f"[Email failed: {exc}]"
