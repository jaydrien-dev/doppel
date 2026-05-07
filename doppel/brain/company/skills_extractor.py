"""
Skills Extractor — Phase 4.

Converts role brain knowledge summaries into a structured, executable
skills file that AI agents can query before taking action.

Each skill = one decision procedure with: trigger, inputs, rules,
exceptions, confidence score, and source attribution.
"""
from __future__ import annotations

import json
import logging
import time
from uuid import UUID

import anthropic
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_anthropic_key
from doppel.config import settings

_log = logging.getLogger(__name__)


_SKILLS_PROMPT = """\
You are converting company knowledge into a structured skills file that AI agents can use.

## Company: {org_name}
## Role: {role_name}
## Knowledge summary:
{knowledge_summary}

## Task

Extract ALL executable skills from this knowledge summary.
Draw from every section: decision_procedures, key_responsibilities, common_heuristics,
domain_knowledge, tools_and_systems — anything that describes HOW to do something.

A skill is any concrete, repeatable action or decision pattern an agent can apply.
Even a simple heuristic ("always check X before doing Y") is a valid skill.

Output ONLY a JSON array of skills (no markdown, no extra text):

[
  {{
    "skill_name": "<concise snake_case identifier, e.g. handle_refund_request>",
    "display_name": "<human-readable name>",
    "trigger_context": ["<keyword or phrase that signals this skill applies>", ...],
    "inputs_required": ["<what the agent needs to know to apply this skill>", ...],
    "procedure": {{
      "steps": ["<step 1>", "<step 2>", ...],
      "decision_rules": [
        {{"condition": "<if this>", "action": "<then do this>"}}
      ],
      "exceptions": ["<exception case and how to handle it>", ...],
      "escalation": "<when and how to escalate to a human>"
    }},
    "confidence": <float 0.0-1.0, based on how well-documented this procedure is>,
    "source_description": "<brief description of where this knowledge came from>"
  }}
]

Rules:
- Produce at least one skill even if the knowledge is thin — extract whatever is most actionable.
- Be specific. A skill is only useful if an agent can apply it without guessing.
- Confidence 0.9+ only if the procedure has clear rules and few exceptions.
- Confidence 0.5–0.7 for heuristics or partially-documented patterns.
- Keep each field concise — steps max 15 words each, trigger_context max 5 items, inputs_required max 5 items.
- Output the COMPLETE JSON array. Do not truncate.
"""


async def extract_skills_from_role(
    session: AsyncSession,
    org_id: UUID,
    role_brain_id: UUID,
    role_name: str,
    org_name: str,
    knowledge_summary: dict,
) -> list[dict]:
    """
    Extract skills from a role brain's knowledge summary.
    Stores them in org_skills and returns the list.
    """
    if not knowledge_summary or knowledge_summary.get("error"):
        return []

    # If role brain JSON parsing failed, recover by using the raw text
    if knowledge_summary.get("parse_error") and knowledge_summary.get("raw_extraction"):
        knowledge_summary = {"role_summary": str(knowledge_summary["raw_extraction"])[:8000]}

    # Check there's at least some usable content in the summary
    has_content = any(
        knowledge_summary.get(k)
        for k in ("decision_procedures", "key_responsibilities",
                  "common_heuristics", "domain_knowledge", "role_summary")
    )
    if not has_content:
        return []

    prompt = _SKILLS_PROMPT.format(
        org_name=org_name,
        role_name=role_name,
        knowledge_summary=json.dumps(knowledge_summary, indent=2),
    )

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`")

    _log.info("skills_extractor raw LLM output (first 300): %s", raw[:300])

    try:
        skills_data = json.loads(raw)
        if not isinstance(skills_data, list):
            # Might be {"skills": [...]}
            if isinstance(skills_data, dict):
                skills_data = skills_data.get("skills") or []
            else:
                skills_data = []
    except json.JSONDecodeError:
        # Try to find JSON array boundaries
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start != -1 and end > start:
            try:
                skills_data = json.loads(raw[start:end])
                if not isinstance(skills_data, list):
                    skills_data = []
            except json.JSONDecodeError:
                _log.error("skills_extractor: JSON parse failed. raw[:500]=%s", raw[:500])
                return []
        else:
            _log.error("skills_extractor: no JSON array found. raw[:500]=%s", raw[:500])
            return []

    _log.info("skills_extractor: parsed %d skills", len(skills_data))

    # Delete old skills for this role brain and re-insert
    await session.execute(
        text("DELETE FROM org_skills WHERE role_brain_id = :id"),
        {"id": str(role_brain_id)},
    )

    source_count = sum(
        len(knowledge_summary.get(k) or [])
        for k in ("decision_procedures", "key_responsibilities", "common_heuristics")
    )

    stored = []
    for skill in skills_data:
        if not isinstance(skill, dict) or not skill.get("skill_name"):
            _log.warning("skills_extractor: skipping skill missing skill_name: %s", skill)
            continue
        try:
            result = await session.execute(
                text("""
                    INSERT INTO org_skills
                      (org_id, role_brain_id, skill_name, trigger_context,
                       inputs_required, procedure, confidence, source_count,
                       last_verified_at)
                    VALUES
                      (:org_id, :role_brain_id, :skill_name,
                       ARRAY(SELECT jsonb_array_elements_text(CAST(:trigger AS jsonb))),
                       ARRAY(SELECT jsonb_array_elements_text(CAST(:inputs AS jsonb))),
                       CAST(:procedure AS jsonb),
                       :confidence, :source_count, NOW())
                    RETURNING id
                """),
                {
                    "org_id": str(org_id),
                    "role_brain_id": str(role_brain_id),
                    "skill_name": skill.get("skill_name", ""),
                    "trigger": json.dumps([str(t) for t in (skill.get("trigger_context") or [])]),
                    "inputs": json.dumps([str(i) for i in (skill.get("inputs_required") or [])]),
                    "procedure": json.dumps(skill.get("procedure") or {}),
                    "confidence": float(skill.get("confidence") or 0.5),
                    "source_count": source_count,
                },
            )
            row = result.fetchone()
            stored.append({**skill, "id": str(row[0])})
        except Exception as e:
            _log.error("skills_extractor: INSERT failed for %s: %s", skill.get("skill_name"), e)

    await session.commit()
    return stored


async def query_skills(
    session: AsyncSession,
    org_id: UUID,
    situation: str,
    context: dict,
) -> dict:
    """
    Given a situation description, find the best matching skill and
    generate a concrete recommendation. This is the core agent query API.
    """
    t_start = time.monotonic()

    # Load all skills for this org
    result = await session.execute(
        text("""
            SELECT id, skill_name, trigger_context, inputs_required,
                   procedure, confidence
            FROM org_skills WHERE org_id = :org_id
            ORDER BY confidence DESC
        """),
        {"org_id": str(org_id)},
    )
    skills = result.mappings().all()

    if not skills:
        return {
            "recommendation": None,
            "confidence": 0.0,
            "skill_applied": None,
            "escalate": True,
            "escalation_reason": "No skills have been extracted for this organization yet.",
            "latency_ms": int((time.monotonic() - t_start) * 1000),
        }

    # Build a skills catalog for the LLM
    catalog = []
    for s in skills:
        catalog.append({
            "id": str(s["id"]),
            "skill_name": s["skill_name"],
            "triggers": list(s["trigger_context"] or []),
            "procedure_summary": str(s["procedure"])[:400],
            "confidence": float(s["confidence"]),
        })

    query_prompt = f"""\
You are the company brain query engine. An AI agent needs guidance before taking an action.

## Situation
{situation}

## Context provided by agent
{json.dumps(context, indent=2)}

## Available skills (company procedures)
{json.dumps(catalog, indent=2)}

## Task
1. Identify which skill (if any) applies to this situation.
2. Apply the skill's procedure to the specific situation.
3. Give a concrete recommendation.

Output ONLY JSON:
{{
  "skill_applied": "<skill_name or null if none applies>",
  "skill_id": "<id or null>",
  "recommendation": "<specific action the agent should take>",
  "reasoning": "<why this recommendation, tied to the procedure>",
  "confidence": <float 0.0-1.0>,
  "escalate": <true if agent should stop and ask a human>,
  "escalation_reason": "<why escalate, or null>",
  "caveats": ["<any exception or caveat that applies>"]
}}
"""

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=1500,
        messages=[{"role": "user", "content": query_prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`")

    try:
        result_data = json.loads(raw)
    except json.JSONDecodeError:
        result_data = {
            "skill_applied": None,
            "recommendation": raw,
            "confidence": 0.3,
            "escalate": True,
            "escalation_reason": "Response parse error — review manually",
        }

    result_data["latency_ms"] = int((time.monotonic() - t_start) * 1000)
    return result_data


async def validate_action(
    session: AsyncSession,
    org_id: UUID,
    proposed_action: str,
    context: dict,
) -> dict:
    """
    Check whether a proposed action is consistent with company procedure.
    Returns {safe_to_proceed, confidence, notes, blocking_reason}.
    """
    t_start = time.monotonic()

    result = await session.execute(
        text("""
            SELECT skill_name, procedure, confidence
            FROM org_skills WHERE org_id = :org_id
            ORDER BY confidence DESC LIMIT 20
        """),
        {"org_id": str(org_id)},
    )
    skills = result.mappings().all()

    skills_text = "\n".join(
        f"- {s['skill_name']}: {json.dumps(s['procedure'])[:300]}"
        for s in skills
    ) if skills else "No skills defined yet."

    prompt = f"""\
An AI agent is about to take an action. Check whether it's consistent with company procedure.

## Proposed action
{proposed_action}

## Context
{json.dumps(context, indent=2)}

## Relevant company procedures
{skills_text}

## Task
Output ONLY JSON:
{{
  "safe_to_proceed": <true|false>,
  "confidence": <float 0.0-1.0>,
  "notes": ["<observation about this action vs procedure>"],
  "blocking_reason": "<why not safe, or null if safe>",
  "suggested_alternative": "<what to do instead if not safe, or null>"
}}
"""

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"safe_to_proceed": False, "confidence": 0.0, "blocking_reason": "Parse error"}

    data["latency_ms"] = int((time.monotonic() - t_start) * 1000)
    return data
