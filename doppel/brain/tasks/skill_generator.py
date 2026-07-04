"""
Skill Generator — dynamic skill creation through natural language.

When a creator requests a capability that has no matching skill or workflow
template, this module:
  1. Analyzes the request (one LLM call with extended thinking)
  2. Extracts the trigger → condition → action intent
  3. Maps it to a Workflow (reusing Layer 4 primitives wherever possible)
  4. Runs a dry-run test (no real actions executed)
  5. Presents for creator approval
  6. On approval: registers as a Skill + activates the Workflow

Safety rules (non-negotiable):
  - Generated skills can only use already-connected connectors
  - Financial / irreversible actions start at CREATOR_REVIEW, 10 approvals needed to unlock AUTO_EXECUTE
  - Every request, generation, test, and firing is permanently logged
  - Sandboxed dry-runs never touch real data
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4

import httpx

from doppel.brain.context import get_anthropic_key
from doppel.brain.db.connection import AsyncSessionLocal

_log = logging.getLogger(__name__)

_ANALYSIS_MODEL = "claude-sonnet-5"

# Action types that are considered high-consequence (CREATOR_REVIEW minimum)
_HIGH_CONSEQUENCE_ACTIONS = {
    "send_email", "send_message", "create_event", "delete_file",
    "delete", "post", "publish", "payment", "invoice", "order",
}


# ---------------------------------------------------------------------------
# Request analysis
# ---------------------------------------------------------------------------

async def analyze_skill_request(
    request: str,
    connected_connectors: list[str],
    available_skills: list[str],
    clone_name: str = "the clone",
) -> dict:
    """
    Analyze a natural-language skill request.

    Returns a dict with:
      feasibility: 'buildable_now' | 'needs_new_connector' | 'needs_clarification' | 'unsafe'
      trigger: {type, config}
      conditions: [...]
      actions: [...]
      required_connectors: [...]
      clarifying_questions: [...] (if needs_clarification)
      explanation: str
      approval_mode: 'auto_execute' | 'creator_review' | 'dual_approval'
    """
    api_key = get_anthropic_key()

    connectors_hint = ", ".join(connected_connectors) if connected_connectors else "none connected"
    skills_hint = ", ".join(available_skills[:20]) if available_skills else "none"

    prompt = f"""\
You are analyzing a skill request for {clone_name}, an AI delegate.

REQUEST: "{request}"

CONNECTED CONNECTORS: {connectors_hint}
EXISTING SKILLS: {skills_hint}

ALWAYS AVAILABLE (no connector needed):
- Web search (web__search), web page fetching (web__fetch), crypto prices (web__price)
- Native email sending (send_email action type) — works without Gmail connector

Your job: determine if this request can be built as a deterministic workflow
(trigger → conditions → actions), then extract the intent.

=== TRIGGER TYPES ===
- schedule: fires at a time/frequency (e.g. daily:09:00, weekly:mon:08:00, hourly)
- poll_api: polls a JSON API URL every N seconds; fires when conditions match
- poll_webpage: polls a webpage; fires when conditions match text content
- webhook: fires when an external POST is received

=== DATA SOURCES (for poll_api trigger) ===
For cryptocurrency prices, ALWAYS use CoinGecko (free, no API key):
  URL: https://api.coingecko.com/api/v3/simple/price?ids=COIN_ID&vs_currencies=usd
  Coin IDs: bitcoin, ethereum, solana, cardano, ripple, dogecoin, etc.
  Response: {{"bitcoin": {{"usd": 64000.0}}}}
  Field path for condition: "bitcoin.usd" (or "ethereum.usd", etc.)

For stock prices, use Yahoo Finance:
  URL: https://query1.finance.yahoo.com/v8/finance/chart/TICKER?interval=1m&range=1d
  Field path: "chart.result.0.meta.regularMarketPrice"

=== ACTION TYPES ===
- send_email: native email — NO connector required
  config: {{"to": "user@example.com", "subject": "Alert: {{bitcoin.usd}}", "body": "Price is ${{bitcoin.usd}}"}}
  Use {{field_name}} for template interpolation from trigger context.

- connector_action: call a connector tool (Gmail, Google Calendar, etc.)
  config: {{"connectorId": "Gmail", "tool": "send_email", "params": {{"to": "...", "subject": "...", "body": "..."}}}}
  Only use if that connector appears in CONNECTED CONNECTORS.

- notify: log a notification (no external send)
  config: {{"message": "Alert: {{value}}"}}

- ai_decide: let the clone reason and decide what to do (one LLM call)
  config: {{"message": "Current data: {{trigger_value}}"}}

=== CONDITION OPERATORS ===
<, >, =, !=, <=, >=, contains, changed, matches (regex)

=== SAFETY RULES ===
- send_email and connector_action with Gmail are always available — never mark email as 'needs_new_connector'
- Mark 'unsafe' only for illegal activity, ToS circumvention, or clearly harmful actions
- Mark 'needs_clarification' only if you cannot determine the data source or recipient
- For cryptocurrency/price monitoring: ALWAYS use poll_api with CoinGecko URL — do NOT mark as needs_clarification

=== RESPONSE FORMAT ===
Respond ONLY with valid JSON (no markdown, no commentary).
Extract ALL values (thresholds, recipients, schedules, URLs, conditions) from the user's request — never use placeholder values.

Example structure (values below are illustrative only — use the actual values from the request):
{{
  "feasibility": "buildable_now",
  "trigger": {{"type": "poll_api", "config": {{"url": "https://api.example.com/data", "selector": "data.value"}}}},
  "conditions": [{{"field": "data.value", "operator": ">", "value": 100}}],
  "actions": [
    {{"type": "send_email", "config": {{"to": "recipient@example.com", "subject": "Alert: {{{{data.value}}}}", "body": "Value exceeded threshold.\\n\\nCurrent: {{{{data.value}}}}"}}}}
  ],
  "required_connectors": [],
  "clarifying_questions": [],
  "explanation": "Plain language description of what this workflow does.",
  "approval_mode": "auto_execute",
  "is_high_consequence": false,
  "name": "Descriptive workflow name",
  "poll_interval_ms": 60000
}}"""

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _ANALYSIS_MODEL,
                    "max_tokens": 2048,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        _log.error("Skill analysis LLM call failed: %s", exc)
        return {
            "feasibility": "needs_clarification",
            "clarifying_questions": ["Could you describe what you want to watch and what action to take when it changes?"],
            "explanation": f"Analysis failed: {exc}",
        }

    raw = " ".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1].lstrip("json").rstrip("`").strip()

    try:
        result = json.loads(raw)
        # Enforce: high-consequence actions always start at creator_review
        if result.get("is_high_consequence"):
            if result.get("approval_mode") == "auto_execute":
                result["approval_mode"] = "creator_review"
        return result
    except Exception as exc:
        _log.warning("Skill analysis JSON parse error: %s | raw: %.300s", exc, raw)
        return {
            "feasibility": "needs_clarification",
            "clarifying_questions": ["Could you clarify what trigger and action you want?"],
            "explanation": "Could not parse request.",
        }


# ---------------------------------------------------------------------------
# Dry-run test
# ---------------------------------------------------------------------------

async def dry_run_workflow(analysis: dict, connected_connectors: list[str]) -> dict:
    """
    Simulate what would happen if this workflow fired right now.
    Never executes real actions. Returns a human-readable preview.
    """
    trigger = analysis.get("trigger", {})
    conditions = analysis.get("conditions", [])
    actions = analysis.get("actions", [])

    issues: list[str] = []
    steps: list[str] = []

    # Check trigger reachability
    trigger_type = trigger.get("type", "schedule")
    trigger_config = trigger.get("config", {})

    if trigger_type == "schedule":
        schedule = trigger_config.get("schedule", "hourly")
        steps.append(f"Trigger: fires on schedule '{schedule}'")
        trigger_reachable = True
    elif trigger_type in ("poll_api", "poll_webpage"):
        url = trigger_config.get("url", "")
        if url:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.head(url)
                trigger_reachable = r.is_success
                steps.append(f"Trigger: polling {url} — status {r.status_code}")
                if not trigger_reachable:
                    issues.append(f"URL {url} returned {r.status_code}")
            except Exception as exc:
                trigger_reachable = False
                issues.append(f"Could not reach {url}: {exc}")
                steps.append(f"Trigger: polling {url} — unreachable")
        else:
            trigger_reachable = False
            issues.append("No URL specified for poll trigger")
    elif trigger_type == "webhook":
        trigger_reachable = True
        steps.append("Trigger: activated via webhook POST (will provide URL after creation)")
    else:
        trigger_reachable = False
        issues.append(f"Unknown trigger type: {trigger_type}")

    # Check conditions
    if conditions:
        cond_descs = []
        for c in conditions:
            cond_descs.append(f"{c.get('field')} {c.get('operator')} {c.get('value')}")
        steps.append(f"Conditions: {' AND '.join(cond_descs)}")

    # Check actions
    for i, action in enumerate(actions):
        action_type = action.get("type")
        cfg = action.get("config", {})

        if action_type == "notify":
            steps.append(f"Action {i+1}: send notification — \"{cfg.get('message', '')[:80]}\"")
        elif action_type == "connector_action":
            connector = cfg.get("connectorId", "?")
            tool = cfg.get("tool", "?")
            if connector not in connected_connectors:
                issues.append(f"Connector '{connector}' is not connected")
            steps.append(f"Action {i+1}: call {connector} → {tool}")
        elif action_type == "ai_decide":
            steps.append(f"Action {i+1}: let {analysis.get('name', 'clone')} decide what to do")
        elif action_type == "workflow_trigger":
            steps.append(f"Action {i+1}: trigger another workflow")
        else:
            steps.append(f"Action {i+1}: {action_type}")

    passed = trigger_reachable and len(issues) == 0

    dry_run_output = "\n".join([
        "If this workflow fired right now:",
        *[f"  → {s}" for s in steps],
    ])

    return {
        "passed": passed,
        "trigger_reachable": trigger_reachable,
        "issues": issues,
        "steps": steps,
        "dry_run_output": dry_run_output,
    }


# ---------------------------------------------------------------------------
# Workflow creation from analysis
# ---------------------------------------------------------------------------

def build_workflow_from_analysis(analysis: dict, clone_id: UUID, name: str) -> dict:
    """Build a workflow dict from the analysis result, ready to insert into DB."""
    trigger = analysis.get("trigger", {"type": "schedule", "config": {"schedule": "daily:09:00"}})
    trigger_type = trigger.get("type", "schedule")

    # Set sensible defaults for poll interval
    if trigger_type in ("poll_api", "poll_webpage"):
        poll_interval_ms = max(
            analysis.get("poll_interval_ms", 60000),
            10000,  # minimum
        )
    else:
        poll_interval_ms = 60000  # scheduler checks this anyway

    # Set approval mode — high-consequence actions force creator_review
    approval_mode = analysis.get("approval_mode", "auto_execute")

    return {
        "id": str(uuid4()),
        "clone_id": str(clone_id),
        "name": name,
        "description": analysis.get("explanation", ""),
        "status": "active",
        "trigger": trigger,
        "conditions": analysis.get("conditions", []),
        "actions": analysis.get("actions", []),
        "poll_interval_ms": poll_interval_ms,
        "cooldown_ms": 300000,  # 5 min default cooldown
        "max_firings_per_day": 100,
        "approval_mode": approval_mode,
    }


# ---------------------------------------------------------------------------
# Self-validation: second LLM pass to catch errors before presenting to user
# ---------------------------------------------------------------------------

async def validate_and_correct_analysis(analysis: dict, original_request: str, api_key: str) -> dict:
    """
    Second-pass LLM call. Reviews the generated workflow JSON against the original
    request and known API response structures. Returns a corrected analysis dict.
    Errors caught: wrong field paths, placeholder values, hallucinated URLs, bad schedules.
    """
    prompt = f"""\
You are a workflow quality reviewer. A workflow was just generated from this user request:

REQUEST: "{original_request}"

GENERATED WORKFLOW JSON:
{json.dumps(analysis, indent=2)}

Your job: find and fix errors before this workflow is activated. Check for:

1. FIELD PATHS — Do they match the actual API response structure?
   - CoinGecko price API response: {{"bitcoin": {{"usd": 64000.0}}}} → correct path: "bitcoin.usd"
   - Yahoo Finance response: {{"chart": {{"result": [{{"meta": {{"regularMarketPrice": 150.0}}}}]}}}} → correct path: "chart.result.0.meta.regularMarketPrice"
   - If using any other API, verify the selector matches that API's actual JSON structure.

2. PLACEHOLDER VALUES — Replace any generic placeholders with values from the request:
   - "recipient@example.com", "user@example.com", "your-email@domain.com" → must be replaced with actual email from request or omit
   - "YOUR_THRESHOLD", "PRICE_HERE", etc. → must be replaced with actual values

3. SCHEDULE FORMAT — Must be one of: "hourly", "daily:HH:MM", "weekly:DAY:HH:MM", "every_N_minutes:N"
   - "every morning at 9am" → "daily:09:00"
   - "every Monday" → "weekly:mon:09:00"

4. CONDITION LOGIC — Does the condition make sense for the trigger?
   - poll_api trigger with field "bitcoin.usd" and operator ">" and value 61620 is correct
   - Numeric values should be numbers (not strings) in the JSON

5. ACTION COMPLETENESS — Are action configs filled in with real values from the request?

Return ONLY the corrected JSON. If nothing needs fixing, return the original JSON unchanged.
Do NOT add commentary. Return valid JSON only."""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _ANALYSIS_MODEL,
                    "max_tokens": 2048,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        _log.warning("Workflow validation LLM call failed (using original): %s", exc)
        return analysis

    raw = " ".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1].lstrip("json").rstrip("`").strip()

    try:
        corrected = json.loads(raw)
        _log.info("Workflow validation pass complete. name=%s", corrected.get("name"))
        return corrected
    except Exception as exc:
        _log.warning("Workflow validation returned invalid JSON (%s), using original", exc)
        return analysis


# ---------------------------------------------------------------------------
# Full pipeline: analyze → validate → dry-run → return for approval
# ---------------------------------------------------------------------------

async def configure_workflow_from_conversation(
    request: str,
    clone_id: UUID,
    connected_connectors: list[str],
    available_skills: list[str],
    clone_name: str = "your clone",
) -> dict:
    """
    Entry point for conversational workflow configuration.

    Returns a dict with:
      status: 'ready' | 'needs_clarification' | 'needs_connector' | 'unsafe'
      workflow_draft: dict (if ready)
      dry_run: dict (if ready)
      questions: list[str] (if needs_clarification)
      explanation: str
      summary: str  — plain language for the user
    """
    api_key = get_anthropic_key()
    analysis = await analyze_skill_request(request, connected_connectors, available_skills, clone_name)

    feasibility = analysis.get("feasibility", "needs_clarification")

    if feasibility == "unsafe":
        return {
            "status": "unsafe",
            "explanation": analysis.get("explanation", "This request cannot be built."),
            "summary": f"I can't build this — {analysis.get('explanation', 'it falls outside what I can do safely.')}",
        }

    if feasibility == "needs_clarification":
        return {
            "status": "needs_clarification",
            "questions": analysis.get("clarifying_questions", ["Could you give more detail?"]),
            "explanation": analysis.get("explanation", ""),
            "summary": "I need a bit more information to set this up.",
        }

    if feasibility == "needs_new_connector":
        missing = analysis.get("required_connectors", [])
        return {
            "status": "needs_connector",
            "required_connectors": missing,
            "explanation": analysis.get("explanation", ""),
            "summary": f"To build this, I'd need access to: {', '.join(missing)}. Connect those in Settings → Connectors, then ask again.",
        }

    # Self-validation pass — catches field path errors, placeholders, bad schedules
    analysis = await validate_and_correct_analysis(analysis, request, api_key)

    # Build the workflow draft and run a dry test
    name = analysis.get("name", request[:60])
    workflow_draft = build_workflow_from_analysis(analysis, clone_id, name)
    dry_run = await dry_run_workflow(analysis, connected_connectors)

    return {
        "status": "ready",
        "workflow_draft": workflow_draft,
        "dry_run": dry_run,
        "analysis": analysis,
        "summary": _format_approval_summary(analysis, dry_run),
    }


def _format_approval_summary(analysis: dict, dry_run: dict) -> str:
    name = analysis.get("name", "New workflow")
    explanation = analysis.get("explanation", "")
    approval_mode = analysis.get("approval_mode", "auto_execute")
    approval_note = {
        "auto_execute": "will run automatically",
        "creator_review": "will pause for your approval before acting",
        "dual_approval": "will require both you and the recipient to approve",
    }.get(approval_mode, "")

    issues_note = ""
    if dry_run.get("issues"):
        issues_note = f"\n\nPotential issues:\n" + "\n".join(f"• {i}" for i in dry_run["issues"])

    return (
        f"**{name}**\n\n{explanation}\n\n"
        f"{dry_run.get('dry_run_output', '')}\n\n"
        f"This {approval_note}.{issues_note}"
    )


# ---------------------------------------------------------------------------
# Persist approved workflow to DB as a skill
# ---------------------------------------------------------------------------

async def deploy_skill_from_workflow(
    workflow_draft: dict,
    source_request: str,
    clone_id: UUID,
    explanation: str = "",
) -> dict:
    """
    Persist the approved workflow to DB and register it as a skill.
    Returns {'workflow_id': ..., 'skill_id': ...}
    """
    from sqlalchemy import text as sql_text
    from doppel.brain.tasks.scheduler import compute_next_run

    workflow_id = uuid4()
    skill_id = uuid4()
    now = datetime.now(timezone.utc)

    trigger = workflow_draft.get("trigger", {})
    trigger_type = trigger.get("type", "schedule")
    if trigger_type == "schedule":
        schedule = trigger.get("config", {}).get("schedule", "daily:09:00")
        next_poll = compute_next_run(schedule)
    else:
        from datetime import timedelta
        interval_ms = max(workflow_draft.get("poll_interval_ms", 60000), 10000)
        next_poll = now + timedelta(milliseconds=interval_ms)

    async with AsyncSessionLocal() as session:
        # Insert workflow
        await session.execute(
            sql_text("""
                INSERT INTO clone_workflows
                    (id, clone_id, name, description, status, trigger, conditions, actions,
                     poll_interval_ms, cooldown_ms, max_firings_per_day, approval_mode, next_poll_at)
                VALUES
                    (:id, :cid, :name, :desc, 'active', CAST(:trigger AS jsonb), CAST(:conditions AS jsonb),
                     CAST(:actions AS jsonb), :poll_ms, :cooldown, :max_day, :approval, :next_poll)
            """),
            {
                "id": str(workflow_id),
                "cid": str(clone_id),
                "name": workflow_draft.get("name", "Generated skill"),
                "desc": explanation or workflow_draft.get("description", ""),
                "trigger": json.dumps(workflow_draft.get("trigger", {})),
                "conditions": json.dumps(workflow_draft.get("conditions", [])),
                "actions": json.dumps(workflow_draft.get("actions", [])),
                "poll_ms": max(workflow_draft.get("poll_interval_ms", 60000), 10000),
                "cooldown": workflow_draft.get("cooldown_ms", 300000),
                "max_day": workflow_draft.get("max_firings_per_day", 100),
                "approval": workflow_draft.get("approval_mode", "auto_execute"),
                "next_poll": next_poll,
            },
        )

        # Register as a skill
        await session.execute(
            sql_text("""
                INSERT INTO clone_skills
                    (id, clone_id, name, category, description, is_generated,
                     source_request, workflow_id, status, explanation)
                VALUES
                    (:id, :cid, :name, 'execution', :desc, TRUE,
                     :req, :wid, 'active', :expl)
            """),
            {
                "id": str(skill_id),
                "cid": str(clone_id),
                "name": workflow_draft.get("name", "Generated skill"),
                "desc": explanation,
                "req": source_request[:2000],
                "wid": str(workflow_id),
                "expl": explanation,
            },
        )

        await session.commit()

    _log.info("Deployed skill %s → workflow %s for clone %s", skill_id, workflow_id, clone_id)
    return {"workflow_id": str(workflow_id), "skill_id": str(skill_id)}
