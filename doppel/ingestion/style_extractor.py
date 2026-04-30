"""
StyleExtractor: derives a StyleFingerprint from a corpus of the user's own writing.

Takes up to 50 sent-email samples, sends them to Claude in a single call,
and asks it to extract every field of StyleFingerprint as structured JSON.
Result is saved directly to clone_identity.style_fingerprint.
"""
from __future__ import annotations

import json
import random
from uuid import UUID

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_anthropic_key
from doppel.brain.identity.style import save_style
from doppel.brain.models.types import StyleFingerprint
from doppel.config import settings

_MAX_SAMPLES = 50
_SAMPLE_MAX_CHARS = 600     # per sample — keep total prompt manageable
_PROMPT = """\
You are analyzing a person's writing style based on {n} samples of their sent emails.
Your job is to fill in every field of their StyleFingerprint precisely and accurately.
Study the samples carefully — look for real patterns, not generic guesses.

## Writing samples (sent by this person)
{samples}

## Task
Output ONLY a JSON object matching this exact schema (no markdown, no explanation):

{{
  "avg_sentence_length": <float, average words per sentence>,
  "preferred_formality": <float 0.0-1.0, 0=very casual like texting, 1=very formal like legal docs>,
  "uses_hedging": <bool, do they use "I think", "maybe", "probably", "in my view"?>,
  "hedging_frequency": <float 0.0-1.0, what fraction of messages contain hedging language?>,
  "uses_bullet_points": <bool>,
  "uses_em_dash": <bool, do they use — em dashes as asides?>,
  "oxford_comma": <bool, do they use serial commas?>,
  "emoji_frequency": <float 0.0-1.0, fraction of messages containing emoji>,
  "greeting_patterns": <list of strings, e.g. ["Hey", "Hi", "Hello"]>,
  "closing_patterns": <list of strings, e.g. ["Best,", "Thanks,", "Cheers,"]>,
  "directness": <float 0.0-1.0, 0=very indirect/diplomatic, 1=blunt and direct>,
  "warmth": <float 0.0-1.0, 0=transactional/cold, 1=warm/personal>,
  "humor_frequency": <float 0.0-1.0, fraction of messages with humor or lightness>,
  "top_phrases": <list of up to 8 recurring phrases or expressions they use>,
  "avoided_words": <list of words they noticeably never use (e.g. "synergy", "leverage")>,
  "email_reply_length": <"short" | "medium" | "long" — their typical email reply length>,
  "chat_reply_length": <"short" | "medium" | "long" — estimate based on their style>
}}

Be specific and accurate. Base everything on actual patterns in the samples above.
"""


async def extract_style_fingerprint(
    session: AsyncSession,
    clone_id: UUID,
    sample_texts: list[str],
    clone_name: str = "this person",
) -> StyleFingerprint:
    """
    Extract and save a StyleFingerprint from a list of sample texts.
    Returns the computed fingerprint.
    """
    if not sample_texts:
        raise ValueError("No sample texts provided for style extraction.")

    # Take a random sample to avoid bias toward early/recent emails
    samples = random.sample(sample_texts, min(_MAX_SAMPLES, len(sample_texts)))

    # Truncate each sample to keep the prompt manageable
    formatted = "\n\n---\n\n".join(
        f"[Sample {i+1}]\n{s[:_SAMPLE_MAX_CHARS]}"
        for i, s in enumerate(samples)
    )

    prompt = _PROMPT.format(n=len(samples), samples=formatted)

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`")

    data = json.loads(raw)
    fingerprint = StyleFingerprint.model_validate(data)

    # Persist to DB
    await save_style(session, clone_id, fingerprint)
    await session.commit()

    return fingerprint


async def fetch_sample_texts(
    session: AsyncSession,
    clone_id: UUID,
    limit: int = 200,
) -> list[str]:
    """
    Pull authored episodic chunks for style analysis.
    Returns clean text samples — the pipeline has already preprocessed these.
    """
    from sqlalchemy import text as sql_text
    result = await session.execute(
        sql_text("""
            SELECT content FROM episodic_memory
            WHERE clone_id = :clone_id
              AND authored_by_user = true
              AND is_excluded = false
              AND LENGTH(content) > 100
            ORDER BY RANDOM()
            LIMIT :limit
        """),
        {"clone_id": str(clone_id), "limit": limit},
    )
    return [row[0] for row in result.fetchall()]
