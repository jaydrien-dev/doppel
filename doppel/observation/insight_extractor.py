"""
Insight Extractor — extracts higher-level knowledge from observed content.

After enough episodic memories accumulate from observation, this module
uses Claude Haiku (cheapest model) to extract:
  - Semantic facts ("User manages Q3 product launch")
  - Procedural patterns ("Always reviews security PRs before merging")
  - Relational updates ("Weekly 1:1 with Sarah, engineering manager")
  - Topic expertise signals ("Frequently discusses API design, pricing strategy")

Insights go to `pending_insights` for review. High-confidence ones
(>= auto_approve_threshold) are auto-committed to memory tables.
"""
from __future__ import annotations

import json
import logging
from uuid import UUID, uuid4

from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger(__name__)

_BATCH_SIZE = 15  # episodes per extraction call
_EXTRACTION_PROMPT = """You are analyzing work activity data from an expert's connected tools.
Extract structured insights from the following observations.

For each insight, output a JSON object with:
- "type": one of "semantic_fact", "procedural_pattern", "relational_update", "topic_expertise"
- "content": the insight text (1-2 sentences, specific and actionable)
- "confidence": 0.0 to 1.0 (how confident you are this is accurate)
- "domain": relevant domain (e.g. "engineering", "product", "hiring", "finance", "general")

Output a JSON array of insights. Only extract non-trivial, useful knowledge.
Skip routine/obvious observations. Aim for 2-5 insights per batch.

OBSERVATIONS:
{observations}

Respond with ONLY a JSON array, no other text."""


async def extract_insights(
    session: AsyncSession,
    clone_id: UUID,
    source_type: str,
) -> int:
    """
    Extract insights from recent unprocessed observation episodes.
    Returns the number of insights created.
    """
    # Fetch recent observation episodes that haven't been processed
    rows = await session.execute(
        sql_text("""
            SELECT id, content, source, context_type, created_at
            FROM episodic_memory
            WHERE clone_id = :cid
              AND observation_source = :obs_source
              AND id NOT IN (
                  SELECT UNNEST(source_episode_ids) FROM pending_insights
                  WHERE clone_id = :cid AND source_episode_ids IS NOT NULL
              )
            ORDER BY ingested_at DESC
            LIMIT :batch_size
        """),
        {"cid": str(clone_id), "obs_source": f"observation:{source_type}", "batch_size": _BATCH_SIZE},
    )
    episodes = rows.mappings().all()

    if len(episodes) < 3:
        return 0  # Not enough data for meaningful extraction

    # Get auto-approve threshold
    threshold_row = await session.execute(
        sql_text("SELECT auto_approve_threshold FROM clone_identity WHERE clone_id = :cid"),
        {"cid": str(clone_id)},
    )
    threshold = (threshold_row.scalar() or 0.85)

    # Build observation text for the prompt
    obs_lines = []
    episode_ids = []
    for ep in episodes:
        episode_ids.append(UUID(str(ep["id"])))
        source_label = ep["source"] or "unknown"
        ctx = ep["context_type"] or ""
        created = ep["created_at"].isoformat() if ep["created_at"] else ""
        content_preview = (ep["content"] or "")[:500]
        obs_lines.append(f"[{source_label}/{ctx} {created}] {content_preview}")

    observations_text = "\n\n".join(obs_lines)
    prompt = _EXTRACTION_PROMPT.format(observations=observations_text)

    # Call Claude Haiku for extraction
    try:
        import anthropic
        client = anthropic.AsyncAnthropic()
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = response.content[0].text.strip()

        # Parse JSON response
        if response_text.startswith("["):
            insights = json.loads(response_text)
        else:
            # Try to find JSON array in response
            start = response_text.find("[")
            end = response_text.rfind("]") + 1
            if start >= 0 and end > start:
                insights = json.loads(response_text[start:end])
            else:
                _log.warning("Could not parse insights response: %.200s", response_text)
                return 0

    except Exception as exc:
        _log.error("Insight extraction LLM call failed: %s", exc)
        return 0

    # Store insights
    created_count = 0
    for insight in insights:
        if not isinstance(insight, dict):
            continue

        insight_type = insight.get("type", "")
        content = insight.get("content", "")
        confidence = float(insight.get("confidence", 0.7))
        domain = insight.get("domain", "general")

        if not insight_type or not content:
            continue

        # Auto-approve if high confidence
        status = "auto_approved" if confidence >= threshold else "pending"

        await session.execute(
            sql_text("""
                INSERT INTO pending_insights
                  (id, clone_id, insight_type, content, confidence, source_type,
                   source_episode_ids, status, metadata)
                VALUES
                  (:id, :cid, :itype, :content, :conf, :stype,
                   :episode_ids, :status, CAST(:meta AS jsonb))
            """),
            {
                "id": str(uuid4()),
                "cid": str(clone_id),
                "itype": insight_type,
                "content": content,
                "conf": confidence,
                "stype": source_type,
                "episode_ids": [str(eid) for eid in episode_ids],
                "status": status,
                "meta": json.dumps({"domain": domain}),
            },
        )
        created_count += 1

        # If auto-approved, commit to memory immediately
        if status == "auto_approved":
            try:
                from doppel.main import _commit_insight
                await _commit_insight(
                    session=session,
                    clone_id=clone_id,
                    insight_type=insight_type,
                    content=content,
                    confidence=confidence,
                    metadata={"domain": domain},
                )
            except Exception as exc:
                _log.warning("Failed to auto-commit insight: %s", exc)

    if created_count > 0:
        await session.commit()
        _log.info("Extracted %d insights from %s for clone %s (%d auto-approved)",
                   created_count, source_type, clone_id,
                   sum(1 for i in insights if isinstance(i, dict) and float(i.get("confidence", 0)) >= threshold))

    return created_count
