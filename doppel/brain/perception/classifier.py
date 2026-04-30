"""
Perception layer: understands what the input IS before the brain decides what to do with it.
Uses the fast classification model (haiku) to avoid latency overhead.
"""
from __future__ import annotations

import json

import anthropic

from doppel.brain.context import get_anthropic_key
from doppel.brain.models.types import PerceivedInput
from doppel.config import settings

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
    Classify a user message using the fast model.
    Returns a PerceivedInput with all dimensions filled.
    """
    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
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
