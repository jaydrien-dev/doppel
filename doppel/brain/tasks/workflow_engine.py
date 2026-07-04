"""
Workflow Engine — deterministic trigger → condition → action execution.

Runs independently from the LLM task runner. No LLM in the execution loop
except for the explicit 'ai_decide' action type.

Trigger types:
  schedule      — fires on a cron/time expression (reuses scheduler.compute_next_run)
  poll_api      — fetches a URL, checks if value changed or matches condition
  poll_webpage  — fetches a URL, extracts a CSS selector value
  webhook       — activated externally via POST /webhooks/{clone_id}/{workflow_id}
  connector_event — future: events from connected services

Action types:
  connector_action  — calls a connector tool directly (Gmail, Drive, etc.)
  notify            — sends a notification (currently logs; extend with push/email)
  ai_decide         — the ONE LLM call allowed mid-workflow, delegates to clone brain
  workflow_trigger  — triggers another workflow

Safety controls per workflow:
  - poll_interval_ms >= 10000 (enforced on write)
  - cooldown_ms between firings
  - max_firings_per_day rolling cap
  - daily_firing_count + daily_count_reset_at for the cap
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx

from doppel.brain.db.connection import AsyncSessionLocal
from doppel.brain.tasks.scheduler import compute_next_run

_log = logging.getLogger(__name__)

_MIN_POLL_INTERVAL_MS = 10_000   # 10 seconds — abuse protection
_DEFAULT_TIMEOUT = 15.0


# ---------------------------------------------------------------------------
# Condition evaluation — pure, no I/O
# ---------------------------------------------------------------------------

def _coerce(value: object, target: object) -> object:
    """Try to coerce value to same type as target for comparison."""
    if value is None:
        return None
    if isinstance(target, (int, float)):
        try:
            return type(target)(value)
        except (TypeError, ValueError):
            return value
    return str(value)


def evaluate_conditions(conditions: list[dict], data: dict) -> bool:
    """
    Evaluate a list of conditions against a flat data dict.
    Conditions are ANDed by default; use combineWith='OR' to OR with the next.
    """
    if not conditions:
        return True

    result = True
    pending_or = False

    for i, cond in enumerate(conditions):
        field = cond.get("field", "value")
        op = cond.get("operator", "=")
        target = cond.get("value")
        combine_next = cond.get("combineWith", "AND")

        raw = _get_nested(data, field)
        lhs = _coerce(raw, target)
        rhs = _coerce(target, target)

        match op:
            case "<":  passed = lhs is not None and lhs < rhs
            case ">":  passed = lhs is not None and lhs > rhs
            case "=":  passed = str(lhs) == str(rhs)
            case "!=": passed = str(lhs) != str(rhs)
            case "<=": passed = lhs is not None and lhs <= rhs
            case ">=": passed = lhs is not None and lhs >= rhs
            case "contains": passed = lhs is not None and str(rhs).lower() in str(lhs).lower()
            case "changed": passed = data.get("_changed", False)
            case "matches":
                import re
                passed = lhs is not None and bool(re.search(str(rhs), str(lhs)))
            case _: passed = False

        if pending_or:
            result = result or passed
            pending_or = False
        else:
            result = result and passed

        if combine_next == "OR":
            pending_or = True

    return result


def _get_nested(data: dict, field: str) -> object:
    """Support dot-notation for nested fields (e.g. 'price.amount')."""
    parts = field.split(".")
    cur = data
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
    return cur


# ---------------------------------------------------------------------------
# Trigger evaluation
# ---------------------------------------------------------------------------

async def evaluate_schedule_trigger(config: dict, workflow: dict) -> tuple[bool, object]:
    """Returns (should_fire, trigger_value)."""
    next_poll_at = workflow.get("next_poll_at")
    if not next_poll_at:
        return True, datetime.now(timezone.utc).isoformat()
    if isinstance(next_poll_at, str):
        next_poll_at = datetime.fromisoformat(next_poll_at.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    if next_poll_at.tzinfo is None:
        next_poll_at = next_poll_at.replace(tzinfo=timezone.utc)
    return now >= next_poll_at, now.isoformat()


async def evaluate_poll_trigger(config: dict, last_value: object) -> tuple[bool, object]:
    """Fetch a URL and return (changed_or_matches, current_value)."""
    url = config.get("url", "")
    selector = config.get("selector")  # JSON path or CSS selector hint
    headers = config.get("headers", {})

    if not url:
        return False, None

    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        if "json" in content_type:
            data = resp.json()
            if selector:
                current = _get_nested(data if isinstance(data, dict) else {}, selector)
            else:
                current = data
        else:
            current = resp.text[:4000]

        changed = json.dumps(current, sort_keys=True, default=str) != json.dumps(last_value, sort_keys=True, default=str)
        return changed, current

    except Exception as exc:
        _log.warning("Poll trigger fetch failed for %s: %s", url, exc)
        return False, last_value


# ---------------------------------------------------------------------------
# Action execution
# ---------------------------------------------------------------------------

async def execute_action(action: dict, context: dict, clone_id: UUID, session) -> dict:
    """
    Execute a single workflow action. Returns a result dict.
    context: trigger_value + any prior action outputs.
    """
    action_type = action.get("type")
    cfg = action.get("config", {})
    start_ms = int(time.time() * 1000)

    try:
        if action_type == "notify":
            message = _interpolate(cfg.get("message", "Workflow fired."), context)
            channel = cfg.get("notifyChannel", "log")
            # TODO: extend with push/WhatsApp when those connectors are live
            _log.info("Workflow notify [%s]: %s", channel, message)
            result = {"ok": True, "message": message, "channel": channel}

        elif action_type == "connector_action":
            connector_id = cfg.get("connectorId", "")
            tool_name = cfg.get("tool", "")
            params = {k: _interpolate(str(v), context) for k, v in (cfg.get("params") or {}).items()}

            from doppel.brain.tools.mcp_client import load_clone_tools, call_tool as _call_tool, call_native_tool_with_refresh
            from doppel.brain.context import load_clone_keys

            await load_clone_keys(session, clone_id)
            _, servers_by_name = await load_clone_tools(session, clone_id)

            # Build full tool name as "ServerName__tool_name" or use as-is
            full_tool_name = tool_name if "__" in tool_name else f"{connector_id}__{tool_name}"
            server = servers_by_name.get(full_tool_name)

            if server and server.native:
                output = await call_native_tool_with_refresh(server, full_tool_name, params, session)
            elif server:
                output = await _call_tool(server, full_tool_name, params)
            else:
                output = f"[Connector '{connector_id}' not connected or tool '{tool_name}' not found]"

            result = {"ok": True, "output": output}

        elif action_type == "send_email":
            from doppel.brain.tools.email_tools import send_email_native
            to      = _interpolate(cfg.get("to", ""), context)
            subject = _interpolate(cfg.get("subject", "Notification from your clone"), context)
            body    = _interpolate(cfg.get("body", str(context.get("trigger_value", ""))), context)
            if not to:
                result = {"ok": False, "error": "No recipient address specified"}
            else:
                output = await send_email_native(to, subject, body)
                result = {"ok": True, "output": output}

        elif action_type == "ai_decide":
            message = _interpolate(cfg.get("message", str(context.get("trigger_value", ""))), context)

            from doppel.brain.orchestrator import DoppelBrain
            from doppel.brain.models.types import BrainInput

            brain = DoppelBrain(session=session, clone_id=clone_id)
            brain_input = BrainInput(
                clone_id=clone_id,
                user_id=None,
                message=f"[Workflow task] {message}",
                session_id=str(uuid4()),
            )
            brain_output = await brain.process(brain_input)
            result = {"ok": True, "output": brain_output.response}

        elif action_type == "workflow_trigger":
            target_id = cfg.get("targetWorkflowId")
            if target_id:
                asyncio.create_task(
                    fire_workflow(UUID(target_id), clone_id, {"triggered_by": str(context.get("workflow_id"))})
                )
            result = {"ok": True, "triggered": target_id}

        else:
            result = {"ok": False, "error": f"Unknown action type: {action_type}"}

    except Exception as exc:
        _log.error("Workflow action %s failed: %s", action_type, exc)
        result = {"ok": False, "error": str(exc)}

    result["latency_ms"] = int(time.time() * 1000) - start_ms
    result["type"] = action_type
    return result


def _interpolate(template: str, context: dict) -> str:
    """Replace {{field}} placeholders with values from context."""
    import re
    def replacer(m: re.Match) -> str:
        key = m.group(1).strip()
        val = _get_nested(context, key)
        return str(val) if val is not None else m.group(0)
    return re.sub(r"\{\{([^}]+)\}\}", replacer, template)


# ---------------------------------------------------------------------------
# Safety checks
# ---------------------------------------------------------------------------

async def _check_cooldown(workflow: dict) -> bool:
    """True if cooldown has passed (or not set)."""
    cooldown_ms = workflow.get("cooldown_ms", 0)
    last_fired = workflow.get("last_fired_at")
    if not cooldown_ms or not last_fired:
        return True
    if isinstance(last_fired, str):
        last_fired = datetime.fromisoformat(last_fired.replace("Z", "+00:00"))
    if last_fired.tzinfo is None:
        last_fired = last_fired.replace(tzinfo=timezone.utc)
    elapsed_ms = (datetime.now(timezone.utc) - last_fired).total_seconds() * 1000
    return elapsed_ms >= cooldown_ms


async def _check_daily_limit(workflow: dict) -> bool:
    """True if under the daily firing cap."""
    max_per_day = workflow.get("max_firings_per_day", 100)
    count = workflow.get("daily_firing_count", 0)
    reset_at = workflow.get("daily_count_reset_at")

    if reset_at:
        if isinstance(reset_at, str):
            reset_at = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
        if reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= reset_at:
            return True  # count will be reset when firing

    return count < max_per_day


# ---------------------------------------------------------------------------
# Main firing entry point
# ---------------------------------------------------------------------------

async def fire_workflow(workflow_id: UUID, clone_id: UUID, trigger_context: dict) -> None:
    """Execute a workflow that has been triggered. Logs the firing to the DB."""
    from sqlalchemy import text as sql_text

    firing_id = uuid4()
    start_ms = int(time.time() * 1000)
    actions_executed: list[dict] = []
    status = "completed"

    async with AsyncSessionLocal() as session:
        # Load workflow
        row = await session.execute(
            sql_text("SELECT * FROM clone_workflows WHERE id = :wid"),
            {"wid": str(workflow_id)},
        )
        wf = row.mappings().first()
        if not wf:
            _log.error("fire_workflow: workflow %s not found", workflow_id)
            return

        actions: list[dict] = wf["actions"] or []
        context = {
            **trigger_context,
            "workflow_id": str(workflow_id),
            "clone_id": str(clone_id),
            "fired_at": datetime.now(timezone.utc).isoformat(),
        }

        for action in actions:
            result = await execute_action(action, context, clone_id, session)
            actions_executed.append(result)
            context[f"action_{len(actions_executed)}_output"] = result.get("output", "")
            if not result.get("ok"):
                status = "failed"

        # Update workflow last_fired_at, daily count, next_poll_at
        trigger = wf.get("trigger") or {}
        trigger_type = trigger.get("type", "schedule")
        schedule = trigger.get("config", {}).get("schedule", "hourly")

        if trigger_type == "schedule":
            next_poll = compute_next_run(schedule)
        else:
            interval_ms = max(wf.get("poll_interval_ms", 60000), _MIN_POLL_INTERVAL_MS)
            next_poll = datetime.now(timezone.utc) + timedelta(milliseconds=interval_ms)

        # Reset daily count if past midnight UTC
        reset_at = wf.get("daily_count_reset_at")
        now = datetime.now(timezone.utc)
        if reset_at:
            if isinstance(reset_at, str):
                reset_at = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
            if reset_at.tzinfo is None:
                reset_at = reset_at.replace(tzinfo=timezone.utc)
        new_count = (0 if (not reset_at or now >= reset_at) else (wf.get("daily_firing_count") or 0)) + 1
        new_reset = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

        await session.execute(
            sql_text("""
                UPDATE clone_workflows SET
                    last_fired_at = :now,
                    next_poll_at  = :next_poll,
                    daily_firing_count = :count,
                    daily_count_reset_at = :reset_at,
                    last_trigger_value = CAST(:tv AS jsonb),
                    updated_at = :now
                WHERE id = :wid
            """),
            {
                "now": now,
                "next_poll": next_poll,
                "count": new_count,
                "reset_at": new_reset,
                "tv": json.dumps(trigger_context.get("trigger_value"), default=str),
                "wid": str(workflow_id),
            },
        )

        # Log the firing
        await session.execute(
            sql_text("""
                INSERT INTO clone_workflow_firings
                    (id, workflow_id, clone_id, fired_at, trigger_value, actions_executed, latency_ms, status)
                VALUES
                    (:fid, :wid, :cid, :now, CAST(:tv AS jsonb), CAST(:actions AS jsonb), :lat, :status)
            """),
            {
                "fid": str(firing_id),
                "wid": str(workflow_id),
                "cid": str(clone_id),
                "now": now,
                "tv": json.dumps(trigger_context.get("trigger_value"), default=str),
                "actions": json.dumps(actions_executed, default=str),
                "lat": int(time.time() * 1000) - start_ms,
                "status": status,
            },
        )

        await session.commit()

    _log.info("Workflow %s fired (status=%s, actions=%d)", workflow_id, status, len(actions_executed))


# ---------------------------------------------------------------------------
# Polling tick — called by the scheduler every N seconds
# ---------------------------------------------------------------------------

async def tick_workflows() -> None:
    """Check all active workflows and fire any that are due."""
    from sqlalchemy import text as sql_text

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            sql_text("""
                SELECT id, clone_id, name, trigger, conditions, actions,
                       poll_interval_ms, cooldown_ms, max_firings_per_day,
                       last_trigger_value, last_fired_at, next_poll_at,
                       daily_firing_count, daily_count_reset_at
                FROM clone_workflows
                WHERE status = 'active'
                  AND (next_poll_at IS NULL OR next_poll_at <= :now)
                LIMIT 100
            """),
            {"now": now},
        )
        due = rows.mappings().all()

    for wf in due:
        wf_id = UUID(str(wf["id"]))
        clone_id = UUID(str(wf["clone_id"]))
        trigger = wf["trigger"] or {}
        trigger_type = trigger.get("type", "schedule")
        trigger_config = trigger.get("config", {})

        try:
            # Safety checks first
            if not await _check_cooldown(dict(wf)):
                _update_next_poll(wf_id, wf)
                continue

            if not await _check_daily_limit(dict(wf)):
                _log.warning("Workflow %s hit daily limit (%s)", wf_id, wf["max_firings_per_day"])
                _update_next_poll(wf_id, wf)
                continue

            # Evaluate trigger
            last_value = wf["last_trigger_value"]

            if trigger_type == "schedule":
                should_fire, current_value = await evaluate_schedule_trigger(trigger_config, dict(wf))
            elif trigger_type in ("poll_api", "poll_webpage"):
                should_fire, current_value = await evaluate_poll_trigger(trigger_config, last_value)
            else:
                # webhook / connector_event — not polled, fired externally
                _update_next_poll(wf_id, wf)
                continue

            if not should_fire:
                _update_next_poll(wf_id, wf)
                continue

            # Evaluate conditions
            conditions: list[dict] = wf["conditions"] or []
            context_data = {
                "value": current_value,
                "trigger_value": current_value,
                "_changed": current_value != last_value,
            }
            if isinstance(current_value, dict):
                context_data.update(current_value)

            if not evaluate_conditions(conditions, context_data):
                # Conditions not met — update poll time, don't fire
                _update_next_poll(wf_id, wf)
                continue

            # Fire the workflow in background
            asyncio.create_task(
                fire_workflow(wf_id, clone_id, {"trigger_value": current_value, **context_data}),
                name=f"workflow-{wf_id}",
            )

        except Exception as exc:
            _log.error("Workflow tick error for %s: %s", wf_id, exc, exc_info=True)
            # Mark workflow as error so it doesn't spam
            asyncio.create_task(_mark_workflow_error(wf_id, str(exc)))


def _update_next_poll(workflow_id: UUID, wf: object) -> None:
    """Schedule the next poll time without firing."""
    asyncio.create_task(_persist_next_poll(workflow_id, wf))


async def _persist_next_poll(workflow_id: UUID, wf: object) -> None:
    from sqlalchemy import text as sql_text

    wf = dict(wf)
    trigger = wf.get("trigger") or {}
    trigger_type = trigger.get("type", "schedule")

    if trigger_type == "schedule":
        schedule = trigger.get("config", {}).get("schedule", "hourly")
        next_poll = compute_next_run(schedule)
    else:
        interval_ms = max(wf.get("poll_interval_ms", 60000), _MIN_POLL_INTERVAL_MS)
        next_poll = datetime.now(timezone.utc) + timedelta(milliseconds=interval_ms)

    async with AsyncSessionLocal() as session:
        await session.execute(
            sql_text("UPDATE clone_workflows SET next_poll_at = :np, updated_at = NOW() WHERE id = :wid"),
            {"np": next_poll, "wid": str(workflow_id)},
        )
        await session.commit()


async def _mark_workflow_error(workflow_id: UUID, message: str) -> None:
    from sqlalchemy import text as sql_text
    async with AsyncSessionLocal() as session:
        await session.execute(
            sql_text("UPDATE clone_workflows SET status = 'error', error_message = :msg, updated_at = NOW() WHERE id = :wid"),
            {"msg": message[:500], "wid": str(workflow_id)},
        )
        await session.commit()
