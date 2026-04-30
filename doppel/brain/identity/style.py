"""
StyleFingerprint: stores and loads a clone's writing style profile.
Loaded once at startup and injected into every prompt as a behavioral constraint.
"""
from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.models.types import StyleFingerprint


async def load_style(session: AsyncSession, clone_id: UUID) -> StyleFingerprint:
    """Load the style fingerprint from clone_identity."""
    result = await session.execute(
        text("SELECT style_fingerprint FROM clone_identity WHERE clone_id = :id"),
        {"id": str(clone_id)},
    )
    row = result.mappings().first()
    if row is None:
        raise ValueError(f"Clone {clone_id} has no identity record.")
    return StyleFingerprint.model_validate(row["style_fingerprint"])


async def save_style(
    session: AsyncSession, clone_id: UUID, style: StyleFingerprint
) -> None:
    """Upsert the style fingerprint for a clone."""
    await session.execute(
        text("""
            UPDATE clone_identity
            SET style_fingerprint = :fp,
                updated_at = NOW()
            WHERE clone_id = :id
        """),
        {"fp": json.dumps(style.model_dump()), "id": str(clone_id)},
    )


def render_style_prompt(style: StyleFingerprint) -> str:
    """
    Render the style fingerprint as a compact system-prompt instruction block.
    This gets injected into every LLM call so the response sounds like the user.
    """
    parts: list[str] = ["## Communication Style (follow these precisely)"]

    formality = (
        "formal and professional" if style.preferred_formality > 0.7
        else "conversational and approachable" if style.preferred_formality < 0.4
        else "moderately professional"
    )
    parts.append(f"- Tone: {formality}")
    parts.append(
        f"- Sentence length: target ~{int(style.avg_sentence_length)} words per sentence"
    )

    directness_desc = (
        "very direct" if style.directness > 0.7
        else "somewhat indirect" if style.directness < 0.4
        else "direct but tactful"
    )
    parts.append(f"- Directness: {directness_desc}")

    warmth_desc = (
        "warm and personal" if style.warmth > 0.7
        else "professional and neutral" if style.warmth < 0.4
        else "friendly but professional"
    )
    parts.append(f"- Warmth: {warmth_desc}")

    if style.uses_hedging:
        parts.append(
            f"- Use hedging language occasionally ({int(style.hedging_frequency * 100)}% of the time): "
            '"I think", "probably", "in my view"'
        )
    else:
        parts.append("- Avoid hedging — be declarative and confident")

    if style.uses_bullet_points:
        parts.append("- Use bullet points for lists; avoid numbered lists unless order matters")
    else:
        parts.append("- Write in prose; avoid bullet points")

    if style.uses_em_dash:
        parts.append("- Use em-dashes (—) for asides, not parentheses")

    if style.emoji_frequency == 0:
        parts.append("- No emoji")
    elif style.emoji_frequency < 0.2:
        parts.append("- Emoji very sparingly, only when genuinely appropriate")

    if style.greeting_patterns:
        parts.append(f"- Greetings: prefer {', '.join(repr(g) for g in style.greeting_patterns[:2])}")
    if style.closing_patterns:
        parts.append(f"- Sign-offs: prefer {', '.join(repr(c) for c in style.closing_patterns[:2])}")

    if style.top_phrases:
        parts.append(f"- Recurring phrases (use naturally): {', '.join(repr(p) for p in style.top_phrases[:5])}")
    if style.avoided_words:
        parts.append(f"- Never use these words: {', '.join(repr(w) for w in style.avoided_words)}")

    parts.append(
        f"- Default response length for this context: "
        f"email={'medium prose' if style.email_reply_length == 'medium' else style.email_reply_length}, "
        f"chat={'1-3 sentences' if style.chat_reply_length == 'short' else style.chat_reply_length}"
    )

    return "\n".join(parts)
