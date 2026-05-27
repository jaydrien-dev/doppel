"""
Role Brain — Phase 3.

Aggregates the episodic, semantic, and procedural memories of all clones
assigned to a role into a structured knowledge summary for that role.

A role brain answers: "How does THIS COMPANY handle X in THIS ROLE?"
"""
from __future__ import annotations

import json
from uuid import UUID

import anthropic
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_anthropic_key, get_anthropic_client
from doppel.config import settings


_EXTRACTION_PROMPT = """\
You are analyzing the aggregated professional knowledge of {n_members} people who share the role: "{role_name}".

Your job is to extract structured knowledge about HOW THIS ROLE WORKS — the procedures, decision patterns,
heuristics, and institutional knowledge that define how people in this role operate.

## Aggregated memories from all {role_name}s

{memory_block}

## Task

Extract a structured knowledge summary. Output ONLY a JSON object with this exact schema:

{{
  "role_summary": "<2-3 sentence description of what this role does and what knowledge matters most>",
  "key_responsibilities": ["<responsibility 1>", "<responsibility 2>", ...],
  "decision_procedures": [
    {{
      "trigger": "<what situation triggers this procedure>",
      "steps": ["<step 1>", "<step 2>", ...],
      "rules": ["<rule or threshold>", ...],
      "exceptions": ["<exception case>", ...],
      "escalation": "<when to escalate to a human or other role>"
    }}
  ],
  "common_heuristics": ["<rule of thumb this role uses>", ...],
  "domain_knowledge": ["<key fact this role knows that others don't>", ...],
  "tools_and_systems": ["<tool or system this role relies on>", ...],
  "frequent_mistakes": ["<common error to avoid>", ...],
  "escalation_paths": {{
    "<situation>": "<who to escalate to>"
  }}
}}

Be specific. Pull real patterns from the memories above — not generic descriptions.
"""


async def extract_role_knowledge(
    session: AsyncSession,
    org_id: UUID,
    role_brain_id: UUID,
    role_name: str,
    member_clone_ids: list[UUID],
) -> dict:
    """
    Aggregate episodic + procedural memories from all member clones and
    extract structured role knowledge via LLM.
    Returns the knowledge_summary dict and updates the role_brain row.
    """
    if not member_clone_ids:
        return {"error": "No members assigned to this role brain"}

    # Pull episodic memories from all member clones
    clone_id_strings = [str(cid) for cid in member_clone_ids]
    ids_lit = "{" + ",".join(clone_id_strings) + "}"
    result = await session.execute(
        text(f"""
            SELECT ci.display_name, em.content, em.source, em.context_type, em.created_at
            FROM episodic_memory em
            JOIN clone_identity ci ON ci.clone_id = em.clone_id
            WHERE em.clone_id = ANY('{ids_lit}'::uuid[])
              AND em.authored_by_user = true
              AND em.is_excluded = false
              AND LENGTH(em.content) > 80
            ORDER BY em.created_at DESC
            LIMIT 300
        """),
    )
    episodic_rows = result.fetchall()

    # Pull procedural memories
    result2 = await session.execute(
        text(f"""
            SELECT ci.display_name, pm.pattern_type, pm.description, pm.examples
            FROM procedural_memory pm
            JOIN clone_identity ci ON ci.clone_id = pm.clone_id
            WHERE pm.clone_id = ANY('{ids_lit}'::uuid[])
            ORDER BY pm.confidence DESC, pm.occurrence_count DESC
            LIMIT 100
        """),
    )
    procedural_rows = result2.fetchall()

    if not episodic_rows and not procedural_rows:
        return {"error": "Not enough memory data — ingest more content for the member clones first"}

    # Format memory block
    sections: list[str] = []

    if procedural_rows:
        sections.append("### Decision patterns and heuristics")
        for row in procedural_rows[:60]:
            name = row[0]
            ptype = row[1]
            desc = row[2]
            examples = row[3] or []
            sections.append(f"[{name} — {ptype}] {desc}")
            if examples:
                sections.append(f"  Example: {examples[0]}")

    if episodic_rows:
        sections.append("\n### Work experiences and communications")
        char_budget = 40_000
        used = 0
        for row in episodic_rows:
            name = row[0]
            content = row[1][:600]
            source = row[2]
            if used + len(content) > char_budget:
                break
            sections.append(f"[{name} via {source}]\n{content}")
            used += len(content)

    memory_block = "\n\n".join(sections)
    n_members = len(member_clone_ids)

    prompt = _EXTRACTION_PROMPT.format(
        n_members=n_members,
        role_name=role_name,
        memory_block=memory_block,
    )

    response = await get_anthropic_client().messages.create(
        model=settings.reasoning_model,
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`")

    try:
        knowledge = json.loads(raw)
    except json.JSONDecodeError:
        # Try to find JSON object boundaries in case of extra prose
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            try:
                knowledge = json.loads(raw[start:end])
            except json.JSONDecodeError:
                knowledge = {"raw_extraction": raw, "parse_error": True}
        else:
            knowledge = {"raw_extraction": raw, "parse_error": True}

    # Compute freshness (1.0 if extracted now)
    await session.execute(
        text("""
            UPDATE role_brains
            SET knowledge_summary = CAST(:summary AS jsonb),
                freshness_score = 1.0,
                last_extracted_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        """),
        {"summary": json.dumps(knowledge), "id": str(role_brain_id)},
    )
    await session.commit()

    return knowledge


async def compute_freshness(session: AsyncSession, role_brain_id: UUID) -> float:
    """
    Decay freshness score based on time since last extraction and
    new content ingested since then. Returns updated score.
    """
    result = await session.execute(
        text("""
            SELECT rb.last_extracted_at, rb.member_clone_ids, rb.freshness_score
            FROM role_brains rb WHERE rb.id = :id
        """),
        {"id": str(role_brain_id)},
    )
    row = result.mappings().first()
    if not row or not row["last_extracted_at"]:
        return 0.0

    # Count memories ingested after last extraction
    ids_lit2 = "{" + ",".join(str(c) for c in (row["member_clone_ids"] or [])) + "}"
    result2 = await session.execute(
        text(f"""
            SELECT COUNT(*) FROM episodic_memory
            WHERE clone_id = ANY('{ids_lit2}'::uuid[])
              AND ingested_at > :since
        """),
        {"since": row["last_extracted_at"]},
    )
    new_count = result2.scalar() or 0

    # Simple decay: each 50 new items drops freshness by 0.1, floor at 0.1
    decay = min(0.9, (new_count // 50) * 0.1)
    new_score = max(0.1, float(row["freshness_score"]) - decay)

    await session.execute(
        text("UPDATE role_brains SET freshness_score = :score WHERE id = :id"),
        {"score": new_score, "id": str(role_brain_id)},
    )
    await session.commit()
    return new_score
