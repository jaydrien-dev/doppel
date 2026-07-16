"""
Screenwatch observation adapter — periodic screenshot analysis via Claude vision.

The Electron desktop app captures screenshots and POSTs the base64 image
to the backend. This module analyzes the image with Claude Sonnet vision
to extract work context (what app is open, what task the user is doing,
visible project/document names). Only the analysis text is stored — never
the raw screenshot.
"""
from __future__ import annotations

import json
import logging
from typing import AsyncIterator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from doppel.ingestion.connectors.base import RawItem

_log = logging.getLogger(__name__)

_VISION_PROMPT = """You are analyzing a screenshot from a knowledge worker's screen.
Extract structured work context from what you see. Focus on:
- What application or tool is open
- What task the user appears to be working on
- Any visible project names, document titles, URLs, or task identifiers
- The general domain of work (engineering, product, design, sales, etc.)

Do NOT transcribe passwords, private messages, personal content, or sensitive credentials.
Focus only on professional work context.

Output a JSON object with these fields:
- "activity": string — one sentence describing what the user is doing
- "tools": string[] — list of visible applications/tabs/tools
- "context": string — any visible project names, documents, URLs, or task context
- "domain": string — work domain (e.g. "engineering", "product", "design", "general")
- "confidence": float — 0.0 to 1.0, how confident you are in this analysis

Respond with ONLY the JSON object, no other text."""


async def analyze_screenshot(image_base64: str) -> dict:
    """
    Analyze a screenshot using Claude Sonnet vision.
    Returns structured work context as a dict.
    """
    import anthropic

    client = anthropic.AsyncAnthropic()
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_base64,
                        },
                    },
                    {
                        "type": "text",
                        "text": _VISION_PROMPT,
                    },
                ],
            }
        ],
    )

    response_text = response.content[0].text.strip()

    try:
        if response_text.startswith("{"):
            return json.loads(response_text)
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response_text[start:end])
    except (json.JSONDecodeError, ValueError):
        pass

    _log.warning("Could not parse vision response: %.200s", response_text)
    return {
        "activity": response_text[:200],
        "tools": [],
        "context": "",
        "domain": "general",
        "confidence": 0.3,
    }


class ScreenwatchAdapter:
    """
    Adapter stub for screenwatch. Screenwatch is push-mode only —
    the desktop app drives captures, not the backend scheduler.
    """

    async def fetch_since(
        self,
        clone_id: UUID,
        cursor: str | None,
        last_at,
        config: dict,
        session: AsyncSession,
    ) -> AsyncIterator[RawItem]:
        raise NotImplementedError(
            "Screenwatch is push-mode only. "
            "Screenshots are sent from the desktop app, not polled by the scheduler."
        )
        # yield is needed to make this an async generator for type checking
        yield  # noqa: unreachable

    def get_cursor(self) -> str | None:
        return None
