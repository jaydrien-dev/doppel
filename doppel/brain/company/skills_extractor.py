"""
Skills Extractor — Phase 4.

Converts role brain knowledge summaries into a structured, executable
skills file that AI agents can query before taking action.

Each skill = one decision procedure with: trigger, inputs, rules,
exceptions, confidence score, and source attribution.
"""
from __future__ import annotations

import json
import time
from uuid import UUID

import anthropic
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from doppel.brain.context import get_anthropic_key
from doppel.config import settings


_SKILLS_PROMPT = """\
You are converting company knowledge into a structured skills file that AI agents can use.

## Company: {org_name}
## Role: {role_name}
## Knowledge summary:
{knowledge_summary}

## Task

Convert the decision_procedures from this knowledge summary into executable skills.
Each skill must be concrete enough for an AI agent to apply correctly in a new situation.

Output ONLY a JSON array of skills (no markdown):

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

Be specific. A skill is only useful if an agent can apply it without guessing.
Confidence should be 0.9+ only if the procedure has clear rules and few exceptions.
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

    decision_procedures = knowledge_summary.get("decision_procedures", [])
    if not decision_procedures:
        return []

    prompt = _SKILLS_PROMPT.format(
        org_name=org_name,
        role_name=role_name,
        knowledge_summary=json.dumps(knowledge_summary, indent=2),
    )

    response = await anthropic.AsyncAnthropic(api_key=get_anthropic_key()).messages.create(
        model=settings.reasoning_model,
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`")

    try:
        skills_data = json.loads(raw)
        if not isinstance(skills_data, list):
            skills_data = []
    except json.JSONDecodeError:
        return []

    # Delete old skills for this role brain and re-insert
    await session.execute(
        text("DELETE FROM org_skills WHERE role_brain_id = :id"),
        {"id": str(role_brain_id)},
    )

    stored = []
    for skill in skills_data:
        if not isinstance(skill, dict) or not skill.get("skill_name"):
            continue
        result = await session.execute(
            text("""
                INSERT INTO org_skills
                  (org_id, role_brain_id, skill_name, trigger_context,
                   inputs_required, procedure, confidence, source_count,
                   last_verified_at)
                VALUES
                  (:org_id, :role_brain_id, :skill_name, CAST(:trigger AS text[]),
                   CAST(:inputs AS text[]), CAST(:procedure AS jsonb),
                   :confidence, :source_count, NOW())
                RETURNING id
            """),
            {
                "org_id": str(org_id),
                "role_brain_id": str(role_brain_id),
                "skill_name": skill.get("skill_name", ""),
                "trigger": "{" + ",".join(f'"{t}"' for t in skill.get("trigger_context", [])) + "}",
                "inputs": "{" + ",".join(f'"{i}"' for i in skill.get("inputs_required", [])) + "}",
                "procedure": json.dumps(skill.get("procedure", {})),
                "confidence": float(skill.get("confidence", 0.5)),
                "source_count": len(knowledge_summary.get("decision_procedures", [])),
            },
        )
        row = result.fetchone()
        stored.append({**skill, "id": str(row[0])})

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
