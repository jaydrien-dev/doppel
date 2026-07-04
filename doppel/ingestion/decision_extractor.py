"""
DecisionExtractor: derives an EpistemicProfile from a corpus of the user's own writing.

Looks for evidence of how the person thinks and makes decisions — frameworks they reach for,
how confident they typically sound, what evidence they cite, and what domains they know.

Results are MERGED into the existing epistemic_profile column using JSONB ||, so manual
calibrations the owner made on the identity page are not overwritten.
"""
from __future__ import annotations

import json
import random
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_anthropic_client
from doppel.brain.models.types import EpistemicProfile
from doppel.config import settings

_MAX_SAMPLES = 60
_SAMPLE_MAX_CHARS = 800     # longer than style — decision reasoning lives in longer passages
_PROMPT = """\
You are analyzing a corpus of {n} writing samples from one person to understand how they think and make decisions.
Study the samples carefully. Look for real evidence — don't guess.

## Writing samples
{samples}

## Task
Extract this person's decision-making and reasoning patterns. Output ONLY a JSON object (no markdown, no explanation):

{{
  "decision_approach": <string, 1 sentence: how do they approach decisions? e.g. "Data-driven, then gut check" or "Intuition-first, then validates with data">,
  "confidence_style": <string, 1 sentence: how do they express certainty? e.g. "High confidence, decisive" or "Calibrated — often signals uncertainty explicitly">,
  "reasoning_frameworks": <list of strings, up to 5: mental models or frameworks they explicitly or implicitly use, e.g. ["First principles", "Expected value", "Risk/reward tradeoffs"]>,
  "knowledge_domains": <list of strings, up to 8: topics or domains they clearly know deeply based on the depth and specificity of their writing>,
  "preferred_evidence_types": <list of strings, up to 4: what kind of evidence do they cite or find convincing? e.g. ["Personal experience", "Empirical data", "Expert opinion", "Analogies"]>
}}

Rules:
- Only include fields where you have clear evidence in the text. If you cannot tell, use the defaults shown below.
- Default decision_approach: "Data-driven, then gut check"
- Default confidence_style: "Calibrated uncertainty"
- Default reasoning_frameworks: ["First principles"]
- Default knowledge_domains: [] (empty if unclear)
- Default preferred_evidence_types: ["First-hand experience", "Empirical data"]
- Be specific. "SaaS growth" is better than "business". "Bayesian updating" is better than "logic".
"""


async def extract_epistemic_profile(
    session: AsyncSession,
    clone_id: UUID,
    sample_texts: list[str],
    clone_name: str = "this person",
) -> EpistemicProfile:
    """
    Derive and save an EpistemicProfile from a list of sample texts.
    Merges into the existing DB value — does not overwrite manual calibrations.
    Returns the extracted profile.
    """
    if not sample_texts:
        raise ValueError("No sample texts provided for epistemic extraction.")

    samples = random.sample(sample_texts, min(_MAX_SAMPLES, len(sample_texts)))

    formatted = "\n\n---\n\n".join(
        f"[Sample {i+1}]\n{s[:_SAMPLE_MAX_CHARS]}"
        for i, s in enumerate(samples)
    )

    prompt = _PROMPT.format(n=len(samples), samples=formatted)

    response = await get_anthropic_client().messages.create(
        model=settings.reasoning_model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`")

    data = json.loads(raw)
    profile = EpistemicProfile.model_validate(data)

    await _merge_epistemic_profile(session, clone_id, profile)
    await session.commit()

    return profile


async def _merge_epistemic_profile(
    session: AsyncSession,
    clone_id: UUID,
    profile: EpistemicProfile,
) -> None:
    """
    Merge extracted profile into clone_identity.epistemic_profile using JSONB ||.
    Fields the owner explicitly set on the identity page are only overwritten if
    the extracted value is non-empty/non-default. We use a coalesce merge strategy:
    ingested value wins unless the column already has a non-null value for that key.

    Concretely: new_value = extracted || existing  (extracted fills gaps, existing wins conflicts).
    This preserves manual calibrations while backfilling anything that was blank.
    """
    extracted_json = json.dumps(profile.model_dump())
    await session.execute(
        text("""
            UPDATE clone_identity
            SET epistemic_profile = CAST(:extracted AS jsonb) || COALESCE(epistemic_profile, '{}'::jsonb),
                updated_at = NOW()
            WHERE clone_id = :id
        """),
        {"extracted": extracted_json, "id": str(clone_id)},
    )


async def fetch_decision_sample_texts(
    session: AsyncSession,
    clone_id: UUID,
    limit: int = 300,
) -> list[str]:
    """
    Pull authored episodic chunks suitable for decision-making analysis.
    Prefer longer chunks — reasoning and decision language lives in longer passages.
    """
    result = await session.execute(
        text("""
            SELECT content FROM episodic_memory
            WHERE clone_id = :clone_id
              AND authored_by_user = true
              AND is_excluded = false
              AND LENGTH(content) > 150
            ORDER BY RANDOM()
            LIMIT :limit
        """),
        {"clone_id": str(clone_id), "limit": limit},
    )
    return [row[0] for row in result.fetchall()]
