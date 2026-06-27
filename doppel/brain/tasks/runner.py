"""
Task Runner — Long-running agentic task execution.

A task goes through these phases:
  1. PLANNING: Clone decomposes the instruction into concrete steps via a single
     Claude call that returns structured JSON.
  2. EXECUTION: Steps run one-by-one using the MCP tool_path infrastructure.
     Each step result is persisted after completion.
  3. APPROVAL GATES: If a step is marked requires_approval=True, execution pauses,
     a proposal record is created, and status → waiting_approval.
     The owner approves via POST /clones/{id}/tasks/{task_id}/resume.
  4. COMPLETION: All steps done → status=completed, final result assembled.

State is persisted to clone_tasks after every step — tasks survive server restarts.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import UUID

import httpx

from doppel.brain.db.connection import AsyncSessionLocal
from doppel.brain.context import get_anthropic_key
from doppel.brain.tools.mcp_client import load_clone_tools, MCPServer
from doppel.brain.tools.connectors import call_native_tool

_log = logging.getLogger(__name__)

_PLAN_MODEL = "claude-haiku-4-5-20251001"   # fast/cheap for planning
_EXEC_MODEL = "claude-sonnet-4-6"           # capable for execution
_MAX_STEPS = 10
_MAX_EXEC_ITERATIONS = 6                    # tool iterations per step


# ---------------------------------------------------------------------------
# Planning
# ---------------------------------------------------------------------------

async def _plan_task(instruction: str, clone_name: str, tool_names: list[str]) -> list[dict]:
    """Call Claude to produce a structured step-by-step plan as JSON."""
    api_key = get_anthropic_key()
    tools_hint = (
        f"Available tools: {', '.join(tool_names)}" if tool_names
        else "No external tools available — reason through the task using your knowledge."
    )
    prompt = f"""\
You are planning a task for {clone_name}, an AI clone.

Task: {instruction}

{tools_hint}

Break this into 2–8 concrete steps. Each step must be independently executable.
Mark requires_approval=true only for irreversible real-world actions (send email, post message, delete data, make purchase).
Mark requires_approval=false for research, analysis, drafting, and reading.

Respond with ONLY valid JSON (no markdown, no commentary):
{{
  "title": "<brief task title, max 60 chars>",
  "steps": [
    {{"step": 1, "description": "<what to do>", "requires_approval": false}},
    ...
  ]
}}"""

    body = {
        "model": _PLAN_MODEL,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        _log.error("Task planning LLM call failed: %s", exc)
        return [{"step": 1, "description": instruction, "requires_approval": False, "status": "pending"}], instruction[:60]

    raw = " ".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")

    # Strip markdown fences if present
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rstrip("`").strip()

    try:
        plan = json.loads(raw)
        steps = plan.get("steps", [])
        for s in steps:
            s["status"] = "pending"
        return steps, plan.get("title", instruction[:60])
    except Exception as exc:
        _log.warning("Task plan JSON parse error: %s | raw: %.300s", exc, raw)
        return [{"step": 1, "description": instruction, "requires_approval": False, "status": "pending"}], instruction[:60]


# ---------------------------------------------------------------------------
# Step execution
# ---------------------------------------------------------------------------

async def _execute_step(
    step_description: str,
    clone_name: str,
    mcp_tools: list[dict],
    servers_by_name: dict[str, MCPServer],
    clone_id: UUID,
    context_so_far: str = "",
) -> str:
    """Execute a single task step using the agentic tool loop. Returns step result text."""
    api_key = get_anthropic_key()

    system = f"""\
You are {clone_name}, an AI clone executing a specific step of a larger task.

Your job: complete ONLY this one step. Be direct and efficient.
If you need to call a tool, call it. If you need to reason, reason.
After completing the step, report what was done in 1–3 sentences.

{f"Context from previous steps:\n{context_so_far}" if context_so_far else ""}"""

    messages: list[dict] = [{"role": "user", "content": step_description}]

    for iteration in range(_MAX_EXEC_ITERATIONS):
        body: dict = {
            "model": _EXEC_MODEL,
            "max_tokens": 1024,
            "system": system,
            "messages": messages,
        }
        if mcp_tools:
            body["tools"] = mcp_tools

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            _log.error("Task step LLM call failed (iter %d): %s", iteration, exc)
            return f"Step failed: {exc}"

        stop_reason = data.get("stop_reason", "end_turn")
        content_blocks = data.get("content", [])
        messages.append({"role": "assistant", "content": content_blocks})

        if stop_reason == "end_turn":
            text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
            return " ".join(text_parts).strip() or "Step completed."

        if stop_reason != "tool_use":
            text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
            return " ".join(text_parts).strip() or "Step completed."

        # Execute tool calls
        tool_results: list[dict] = []
        from doppel.brain.tools.mcp_client import call_tool, call_native_tool_with_refresh
        from doppel.brain.tools.connectors import call_native_tool

        for block in content_blocks:
            if block.get("type") != "tool_use":
                continue
            tool_name: str = block["name"]
            tool_args: dict = block.get("input", {})
            tool_id: str = block["id"]

            server = servers_by_name.get(tool_name)
            if server is None:
                result_text = f"[No server for tool: {tool_name}]"
            elif server.native:
                result_text = await call_native_tool(server.name, tool_name, tool_args, server.api_key or "")
            else:
                result_text = await call_tool(server, tool_name, tool_args)

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result_text,
            })

        messages.append({"role": "user", "content": tool_results})

    return "Step reached iteration limit."


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

async def _update_task(task_id: UUID, updates: dict) -> None:
    """Persist task state to DB using a fresh session (fire-and-forget safe)."""
    from sqlalchemy import text as sql_text
    try:
        async with AsyncSessionLocal() as session:
            set_parts = ", ".join(f"{k} = :{k}" for k in updates)
            updates["task_id"] = str(task_id)
            updates["updated_at"] = datetime.now(timezone.utc)
            await session.execute(
                sql_text(f"UPDATE clone_tasks SET {set_parts}, updated_at = :updated_at WHERE id = :task_id"),
                updates,
            )
            await session.commit()
    except Exception as exc:
        _log.error("Failed to update task %s: %s", task_id, exc)


async def _create_approval_proposal(clone_id: UUID, task_id: UUID, step_idx: int, step: dict) -> None:
    """Create a proposals record so the owner sees the approval request."""
    from sqlalchemy import text as sql_text
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                sql_text("""
                    INSERT INTO proposals
                      (clone_id, proposal_type, title, content, context, confidence, status)
                    VALUES
                      (:cid, 'task_approval', :title, :content, :ctx::jsonb, 0.9, 'pending')
                """),
                {
                    "cid": str(clone_id),
                    "title": f"Approval needed: {step['description'][:80]}",
                    "content": step["description"],
                    "ctx": json.dumps({"task_id": str(task_id), "step": step_idx}),
                },
            )
            await session.commit()
    except Exception as exc:
        _log.error("Failed to create approval proposal for task %s step %d: %s", task_id, step_idx, exc)


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

async def run_task(task_id: UUID) -> None:
    """
    Background coroutine: plan + execute a task end-to-end.

    Picks up where it left off if already partially planned/executed —
    checks current_step and plan_steps.status to resume after approval.
    """
    from sqlalchemy import text as sql_text

    async with AsyncSessionLocal() as session:
        row = await session.execute(
            sql_text("SELECT id, clone_id, instruction, status, plan_steps, current_step FROM clone_tasks WHERE id = :tid"),
            {"tid": str(task_id)},
        )
        task = row.mappings().first()
        if not task:
            _log.error("run_task: task %s not found", task_id)
            return

        clone_id = UUID(str(task["clone_id"]))
        instruction: str = task["instruction"]
        plan_steps: list = task["plan_steps"] or []
        current_step: int = task["current_step"] or 0

        # Load MCP tools
        mcp_tools, servers_by_name = await load_clone_tools(session, clone_id)

        # Load clone name
        name_row = await session.execute(
            sql_text("SELECT display_name FROM clone_identity WHERE clone_id = :cid"),
            {"cid": str(clone_id)},
        )
        name_rec = name_row.mappings().first()
        clone_name = name_rec["display_name"] if name_rec else "Clone"

    # ── Phase 1: Planning ────────────────────────────────────────────────────
    if not plan_steps:
        await _update_task(task_id, {"status": "planning"})
        try:
            tool_names = [t["name"] for t in mcp_tools]
            plan_steps, title = await _plan_task(instruction, clone_name, tool_names)
        except Exception as exc:
            _log.error("Task planning failed for %s: %s", task_id, exc)
            await _update_task(task_id, {
                "status": "failed",
                "error": f"Planning failed: {exc}",
                "completed_at": datetime.now(timezone.utc),
            })
            return

        await _update_task(task_id, {
            "plan_steps": json.dumps(plan_steps),
            "title": title,
            "status": "running",
        })

    # ── Phase 2: Execution ───────────────────────────────────────────────────
    await _update_task(task_id, {"status": "running"})
    context_parts: list[str] = []

    for i, step in enumerate(plan_steps):
        if step.get("status") in ("completed", "skipped"):
            if step.get("result"):
                context_parts.append(f"Step {i+1}: {step['result'][:300]}")
            continue

        if step.get("status") == "waiting_approval":
            # Still waiting — leave as-is
            await _update_task(task_id, {"status": "waiting_approval", "current_step": i})
            return

        # Check if approval is required before executing
        if step.get("requires_approval") and step.get("status") != "approved":
            # Mark step as waiting approval
            plan_steps[i]["status"] = "waiting_approval"
            await _update_task(task_id, {
                "plan_steps": json.dumps(plan_steps),
                "status": "waiting_approval",
                "current_step": i,
            })
            await _create_approval_proposal(clone_id, task_id, i, step)
            return

        # Execute the step
        plan_steps[i]["status"] = "running"
        await _update_task(task_id, {
            "plan_steps": json.dumps(plan_steps),
            "current_step": i,
        })

        context_so_far = "\n".join(context_parts)
        try:
            result_text = await _execute_step(
                step_description=step["description"],
                clone_name=clone_name,
                mcp_tools=mcp_tools,
                servers_by_name=servers_by_name,
                clone_id=clone_id,
                context_so_far=context_so_far,
            )
            plan_steps[i]["status"] = "completed"
            plan_steps[i]["result"] = result_text
            context_parts.append(f"Step {i+1}: {result_text[:300]}")
        except Exception as exc:
            _log.error("Task %s step %d failed: %s", task_id, i, exc)
            plan_steps[i]["status"] = "failed"
            plan_steps[i]["result"] = f"Error: {exc}"
            await _update_task(task_id, {
                "plan_steps": json.dumps(plan_steps),
                "status": "failed",
                "error": f"Step {i+1} failed: {exc}",
                "completed_at": datetime.now(timezone.utc),
            })
            return

        await _update_task(task_id, {"plan_steps": json.dumps(plan_steps)})

    # ── Phase 3: Completion ──────────────────────────────────────────────────
    final_result = "\n\n".join(context_parts) or "Task completed successfully."
    await _update_task(task_id, {
        "status": "completed",
        "plan_steps": json.dumps(plan_steps),
        "result": final_result,
        "completed_at": datetime.now(timezone.utc),
    })
    _log.info("Task %s completed successfully", task_id)


async def resume_task(task_id: UUID) -> None:
    """
    Resume a task that is waiting for owner approval.
    Marks the current waiting_approval step as approved and re-runs.
    """
    from sqlalchemy import text as sql_text

    async with AsyncSessionLocal() as session:
        row = await session.execute(
            sql_text("SELECT plan_steps, current_step FROM clone_tasks WHERE id = :tid AND status = 'waiting_approval'"),
            {"tid": str(task_id)},
        )
        task = row.mappings().first()
        if not task:
            _log.warning("resume_task: task %s not in waiting_approval state", task_id)
            return

        plan_steps: list = task["plan_steps"] or []
        current_step: int = task["current_step"] or 0

    # Mark the current step as approved so _execute_step will run it
    if current_step < len(plan_steps):
        plan_steps[current_step]["status"] = "approved"

    await _update_task(task_id, {
        "plan_steps": json.dumps(plan_steps),
        "status": "pending",  # trigger run_task to pick up
    })

    # Kick off execution again
    asyncio.create_task(run_task(task_id))
