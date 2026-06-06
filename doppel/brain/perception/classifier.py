"""
Perception layer: understands what the input IS before the brain decides what to do with it.
Uses regex heuristics for obvious patterns, then falls back to the fast classification model
(haiku) for ambiguous messages.
"""
from __future__ import annotations

import json
import re

import anthropic

from doppel.brain.context import get_anthropic_key, get_anthropic_client
from doppel.brain.models.types import PerceivedInput
from doppel.config import settings

# ── Heuristic patterns ────────────────────────────────────────────────────────

# Social/greeting — unambiguously low-stakes; safe to skip LLM entirely.
_SOCIAL_RE = re.compile(
    r"^\s*("
    r"hi+|hey+|hello+|howdy|"
    r"good\s+(morning|afternoon|evening|day|night)|"
    r"how\s+are\s+(you|things)|what'?s\s+up|"
    r"thanks?(\s+a\s+(lot|ton|bunch))?|thank\s+you(\s+so\s+much)?|ty|thx|"
    r"bye|goodbye|see\s+you(\s+later)?|talk\s+(to\s+you\s+)?later|ttyl|"
    r"ok(ay)?[!.]*|cool[!.]*|great[!.]*|sounds\s+good|perfect[!.]*|"
    r"awesome[!.]*|got\s+it[!.]*|understood[!.]*|sure[!.]*|noted[!.]*|"
    r"(you'?re?\s+)?welcome[!.]*"
    r")\s*[!?.]*\s*$",
    re.IGNORECASE,
)

# High-stakes keywords — never skip the LLM if any of these appear.
_HIGH_STAKES_RE = re.compile(
    r"\b(legal|lawsuit|sue|contract|liability|compliance|regulate|"
    r"fire|fired|quit|resign|layoff|terminate|"
    r"invest|investment|stock|equity|funding|valuation|acquire|"
    r"medical|diagnosis|prescription|symptom|"
    r"crisis|emergency|urgent|asap|immediately)\b",
    re.IGNORECASE,
)


def _quick_classify(message: str) -> PerceivedInput | None:
    """
    Return a PerceivedInput for obvious message patterns without calling the LLM.
    Returns None when the message needs full classification (ambiguous / high-stakes).
    """
    stripped = message.strip()

    # Never skip LLM if high-stakes keywords are present
    if _HIGH_STAKES_RE.search(stripped):
        return None

    # Social / greeting — always low-stakes, no LLM needed
    if _SOCIAL_RE.match(stripped):
        return PerceivedInput(
            intent="social",
            stakes="low",
            is_novel=False,
            urgency=0.1,
            entities=[],
            topics=["greeting"],
            requires_decision=False,
            emotional_register="neutral",
        )

    return None

_CLASSIFICATION_PROMPT = """\
You are a perception module. Analyze the input message and classify it precisely.
Respond ONLY with a JSON object — no markdown, no explanation.

Message: {message}

Classify along these exact dimensions:
- intent: one of ["question", "decision", "task", "social", "emotional"]
  - question: asking for information or an opinion
  - decision: explicitly asking what to do, which option to pick, how to handle something
  - task: requesting the clone to do something (draft email, summarize, etc.)
  - social: greeting, small talk, relationship maintenance
  - emotional: venting, processing feelings, seeking validation
- stakes: one of ["low", "medium", "high"]
  - low: casual, reversible, low consequence
  - medium: professional, some consequence, affects work
  - high: financial, legal, interpersonal conflict, public-facing, irreversible
- is_novel: boolean — is this significantly outside what a typical professional would have context on? true = novel/unusual
- urgency: float 0.0–1.0 (0 = no rush, 1 = immediate action required)
- entities: array of named entities (people, companies, products, places) mentioned
- topics: array of semantic topic labels (e.g. "hiring", "product strategy", "conflict", "budget")
- requires_decision: boolean — does this explicitly ask the clone to make or recommend a choice?
- emotional_register: one of ["neutral", "positive", "tense", "urgent", "formal"]

Return only valid JSON matching this schema exactly.
"""


async def classify(message: str) -> PerceivedInput:
    """
    Classify a user message.
    Uses regex heuristics first; falls back to the fast LLM for ambiguous messages.
    """
    quick = _quick_classify(message)
    if quick is not None:
        return quick

    response = await get_anthropic_client().messages.create(
        model=settings.classification_model,
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": _CLASSIFICATION_PROMPT.format(message=message),
            }
        ],
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences if the model adds them despite instructions
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        data = json.loads(raw)
        return PerceivedInput.model_validate(data)
    except (json.JSONDecodeError, Exception):
        # Fallback: treat as generic low-stakes question so the brain can still respond
        return PerceivedInput(
            intent="question",
            stakes="low",
            is_novel=False,
            urgency=0.3,
            entities=[],
            topics=[],
            requires_decision=False,
            emotional_register="neutral",
        )
