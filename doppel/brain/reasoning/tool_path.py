"""
Tool Path — agentic loop for MCP tool use.

When the clone has connected MCP servers and the message appears to need an
action (post to Slack, search Drive, etc.), the brain routes here instead of
fast/slow path.

Loop:
  1. Build prompt with memory + identity + available tools
  2. Call Anthropic with tools=mcp_tools
  3. If stop_reason == "tool_use" → execute tools via mcp_client, feed results back
  4. Repeat until stop_reason == "end_turn" or max 8 iterations
  5. Return final text + ReasoningTrace

Streaming variant yields SSE events so the desktop agent panel shows live
tool call progress.
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator
from uuid import uuid4

from doppel.brain.context import get_anthropic_key
from doppel.brain.identity.layer import IdentityLayer
from doppel.brain.memory.working import WorkingMemoryTurn
from doppel.brain.models.types import BrainInput, MemoryContext, ReasoningTrace
from uuid import UUID
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession
from doppel.brain.tools.mcp_client import MCPServer, call_tool, call_native_tool_with_refresh
from doppel.brain.tools.connectors import call_native_tool

_log = logging.getLogger(__name__)

_MAX_TOOL_ITERATIONS = 8
_MODEL = "claude-sonnet-5"


def _build_messages(
    brain_input: BrainInput,
    memory: MemoryContext,
    working: list[WorkingMemoryTurn],
) -> list[dict]:
    """Assemble the initial messages array from working memory + current message."""
    messages: list[dict] = []

    # Working memory (recent turns)
    for turn in working[-12:]:  # last 12 turns max
        role = "user" if turn.role == "user" else "assistant"
        messages.append({"role": role, "content": turn.content})

    # Current message
    messages.append({"role": "user", "content": brain_input.message})
    return messages


_WRITE_VERBS = {"send", "create", "post", "write", "delete", "remove", "update",
                "edit", "reply", "forward", "move", "archive", "upload", "insert",
                "add", "patch", "put", "publish", "submit", "set", "reset", "push"}


def _is_write_tool(tool_name: str) -> bool:
    lower = tool_name.lower().replace("-", "_")
    return any(verb in lower.split("_") or lower.startswith(verb) for verb in _WRITE_VERBS)


def _filter_read_only(tools: list[dict]) -> list[dict]:
    """Remove any tool whose name suggests a write/mutating operation."""
    return [t for t in tools if not _is_write_tool(t.get("name", ""))]


def _build_system(
    identity: IdentityLayer,
    memory: MemoryContext,
    recent_actions: list[dict] | None = None,
    read_only: bool = False,
) -> str:
    """Build the system prompt for the tool path."""
    import datetime

    persona = identity.render_persona_block()

    # Inject relevant memory as context
    context_parts: list[str] = []
    if memory.episodic:
        excerpts = "\n".join(f"- {c.content[:300]}" for c in memory.episodic[:5])
        context_parts.append(f"## Relevant knowledge\n{excerpts}")
    if memory.semantic:
        facts = "\n".join(f"- {f.fact}" for f in memory.semantic[:5])
        context_parts.append(f"## Key facts\n{facts}")

    # Inject recent tool actions from past sessions so clone has cross-session context
    if recent_actions:
        lines: list[str] = []
        now = datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)
        for action in recent_actions:
            tool = action.get("title", "")
            ctx = action.get("context") or {}
            args = ctx.get("args") or {}
            # Build a compact one-liner: tool_name | key args | relative time
            arg_summary = ", ".join(f"{k}={str(v)[:60]}" for k, v in list(args.items())[:3])
            ts = action.get("created_at")
            if ts:
                try:
                    if isinstance(ts, str):
                        dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    else:
                        dt = ts.replace(tzinfo=datetime.timezone.utc) if ts.tzinfo is None else ts
                    diff = int((now - dt).total_seconds())
                    if diff < 3600:
                        rel = f"{diff // 60}m ago"
                    elif diff < 86400:
                        rel = f"{diff // 3600}h ago"
                    else:
                        rel = f"{diff // 86400}d ago"
                except Exception:
                    rel = ""
            else:
                rel = ""
            lines.append(f"- {tool}: {arg_summary} ({rel})" if arg_summary else f"- {tool} ({rel})")
        context_parts.append("## Recent tool actions (previous sessions)\n" + "\n".join(lines))

    context_block = "\n\n".join(context_parts)

    if read_only:
        mode_block = """\
## Mode: Read-only
You can read, search, and fetch data from connected sources to answer the user's question.
You CANNOT send, create, post, delete, or modify anything. Read-only access only.
If the user asks you to take a write action (send email, post message, create file, etc.),
tell them to switch to Agent mode by clicking the Agent button in the chat."""
    else:
        mode_block = """\
## Mode: Agent (full access)
You are an execution agent with full tool access. Take decisive action — read AND write.
Complete the task end-to-end without asking for unnecessary confirmation.
If a tool call fails, retry with adjusted parameters or try an alternative approach.
Never give up after one failure — exhaust all options before reporting an error.
NEVER say you can't run in the background or suggest Zapier/n8n/Make."""

    return f"""{persona}

{context_block}

{mode_block}

## Tool use rules
- Call tools with precise arguments extracted from the user's request.
- After each tool result, decide: is the task complete, or do you need another tool call?
- Never fabricate tool results. If a search returns nothing, say so and try a different query.
- Respond in plain, direct sentences. No email sign-offs, no bullet lists of steps.

## Voice — this is non-negotiable
You are a specific person's clone, not a generic AI agent. Every response — including failure
reports, limitations, and partial results — must sound like that person, not like an AI system.

BANNED phrases (any of these = persona failure):
- "I need to be upfront", "To be transparent", "I should mention"
- "my web search tool", "my tool is", "the tool is failing", "tool outage"
- "As an AI", "as a language model", "I am programmed to"
- "Certainly!", "Happy to help!", "I'd be happy to", "Absolutely!"
- "violate the quality and honesty standards I hold myself to"
- Any phrase that sounds like an AI system narrating its own capabilities

When a tool fails or returns nothing: report it simply, in first person, as the person would
talk — not as a system status message. "The search isn't pulling anything up" not "my web
search tool is currently failing entirely." Keep trying or ask one sharp question. No apologies,
no structured lists of fallback options unless that is genuinely how this person communicates."""


async def _log_tool_action(
    clone_id: UUID,
    tool_name: str,
    tool_args: dict,
    result: str,
    server_name: str,
) -> None:
    """Insert a tool execution record into proposals for the approvals page.

    Uses its own fresh session so it never interferes with the caller's session
    or partial transactions (same pattern as _persist_async in orchestrator.py).
    """
    from doppel.brain.db.connection import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as fresh:
            await fresh.execute(
                sql_text("""
                    INSERT INTO proposals
                      (clone_id, proposal_type, title, content, context, confidence, status, executed_at)
                    VALUES
                      (:cid, 'tool_action', :title, :content, CAST(:ctx AS jsonb), :conf, 'executed', NOW())
                """),
                {
                    "cid": str(clone_id),
                    "title": tool_name,
                    "content": result[:2000] if result else "",
                    "ctx": json.dumps({"args": tool_args, "server": server_name}),
                    "conf": 0.85,
                },
            )
            await fresh.commit()
    except Exception as exc:
        _log.warning("Failed to log tool action to proposals: %s", exc)


async def run(
    brain_input: BrainInput,
    identity: IdentityLayer,
    memory: MemoryContext,
    working: list[WorkingMemoryTurn],
    mcp_tools: list[dict],
    servers_by_name: dict[str, MCPServer],
    session: AsyncSession | None = None,
    clone_id: UUID | None = None,
    recent_actions: list[dict] | None = None,
    read_only: bool = False,
) -> tuple[str, ReasoningTrace]:
    """
    Non-streaming tool path. Returns (response_text, trace).
    """
    import httpx

    trace = ReasoningTrace(id=uuid4(), path="fast")
    trace.framing = "tool_path"

    messages = _build_messages(brain_input, memory, working)
    system = _build_system(identity, memory, recent_actions, read_only=read_only)
    api_key = get_anthropic_key()

    active_tools = _filter_read_only(mcp_tools) if read_only else mcp_tools
    tool_names_called: list[str] = []

    for iteration in range(_MAX_TOOL_ITERATIONS):
        body = {
            "model": _MODEL,
            "max_tokens": 4096,
            "system": system,
            "tools": active_tools,
            "messages": messages,
        }

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
            _log.error("Tool path LLM call failed (iter %d): %s", iteration, exc)
            trace.needs_escalation = True
            return f"I ran into a problem executing that. Please try again.", trace

        stop_reason = data.get("stop_reason", "end_turn")
        content_blocks = data.get("content", [])

        # Add assistant message to messages
        messages.append({"role": "assistant", "content": content_blocks})

        if stop_reason == "end_turn":
            # Extract final text
            text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
            final_text = " ".join(text_parts).strip() or "Done."
            trace.selected_approach = f"tool_path:{','.join(tool_names_called) or 'none'}"
            trace.confidence = 0.85
            return final_text, trace

        if stop_reason != "tool_use":
            _log.warning("Tool path unexpected stop_reason: %s", stop_reason)
            text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
            return " ".join(text_parts).strip() or "Done.", trace

        # Execute tool calls
        tool_results: list[dict] = []
        for block in content_blocks:
            if block.get("type") != "tool_use":
                continue
            tool_name: str = block["name"]
            tool_args: dict = block.get("input", {})
            tool_id: str = block["id"]
            tool_names_called.append(tool_name)

            server = servers_by_name.get(tool_name)
            if server is None:
                result_text = f"[No server found for tool: {tool_name}]"
                _log.warning("tool_path: no server for tool %s", tool_name)
            elif server.native:
                if session is not None:
                    result_text = await call_native_tool_with_refresh(server, tool_name, tool_args, session)
                else:
                    result_text = await call_native_tool(server.name, tool_name, tool_args, server.api_key or "")
            else:
                result_text = await call_tool(server, tool_name, tool_args)

            # Log to proposals table for approvals page (fire-and-forget, own session)
            if clone_id is not None:
                await _log_tool_action(
                    clone_id, tool_name, tool_args, result_text,
                    server.name if server else "unknown",
                )

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result_text,
            })

        messages.append({"role": "user", "content": tool_results})

    # Hit max iterations
    _log.warning("Tool path hit max iterations (%d)", _MAX_TOOL_ITERATIONS)
    trace.needs_escalation = True
    return "I completed several steps but couldn't fully finish the task. Please review what was done.", trace


async def run_stream(
    brain_input: BrainInput,
    identity: IdentityLayer,
    memory: MemoryContext,
    working: list[WorkingMemoryTurn],
    mcp_tools: list[dict],
    servers_by_name: dict[str, MCPServer],
    session: AsyncSession | None = None,
    clone_id: UUID | None = None,
    recent_actions: list[dict] | None = None,
    read_only: bool = False,
) -> AsyncGenerator[tuple[str, object], None]:
    """
    Streaming tool path. Yields:
      ("tool_call", {"tool": name, "detail": args_summary})  ← before calling
      ("tool_result", {"tool": name, "status": "ok"|"error"}) ← after calling
      ("token", text_chunk)  ← final response tokens
      ("done", (full_text, trace))
    """
    import httpx

    trace = ReasoningTrace(id=uuid4(), path="fast")
    trace.framing = "tool_path"

    messages = _build_messages(brain_input, memory, working)
    system = _build_system(identity, memory, recent_actions, read_only=read_only)
    api_key = get_anthropic_key()

    active_tools = _filter_read_only(mcp_tools) if read_only else mcp_tools
    tool_names_called: list[str] = []

    for iteration in range(_MAX_TOOL_ITERATIONS):
        body = {
            "model": _MODEL,
            "max_tokens": 4096,
            "system": system,
            "tools": active_tools,
            "messages": messages,
        }

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
            _log.error("Tool path stream LLM call failed (iter %d): %s", iteration, exc)
            error_msg = "I ran into a problem. Please try again."
            yield ("token", error_msg)
            yield ("done", (error_msg, trace))
            return

        stop_reason = data.get("stop_reason", "end_turn")
        content_blocks = data.get("content", [])
        messages.append({"role": "assistant", "content": content_blocks})

        if stop_reason == "end_turn":
            text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
            final_text = " ".join(text_parts).strip() or "Done."
            # Yield final text as tokens
            yield ("token", final_text)
            trace.selected_approach = f"tool_path:{','.join(tool_names_called) or 'none'}"
            trace.confidence = 0.85
            yield ("done", (final_text, trace))
            return

        if stop_reason != "tool_use":
            text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
            final_text = " ".join(text_parts).strip() or "Done."
            yield ("token", final_text)
            yield ("done", (final_text, trace))
            return

        # Execute tool calls
        tool_results: list[dict] = []
        for block in content_blocks:
            if block.get("type") != "tool_use":
                continue
            tool_name: str = block["name"]
            tool_args: dict = block.get("input", {})
            tool_id: str = block["id"]
            tool_names_called.append(tool_name)

            # Emit tool_call event (picked up by orchestrator → SSE)
            args_summary = ", ".join(f"{k}={str(v)[:40]}" for k, v in list(tool_args.items())[:3])
            yield ("tool_call", {"tool": tool_name, "detail": args_summary})

            server = servers_by_name.get(tool_name)
            if server is None:
                result_text = f"[No server found for tool: {tool_name}]"
                yield ("tool_result", {"tool": tool_name, "status": "error"})
            elif server.native:
                if session is not None:
                    result_text = await call_native_tool_with_refresh(server, tool_name, tool_args, session)
                else:
                    result_text = await call_native_tool(server.name, tool_name, tool_args, server.api_key or "")
                status = "error" if "Authorization failed" in result_text else "ok"
                yield ("tool_result", {"tool": tool_name, "status": status})
            else:
                result_text = await call_tool(server, tool_name, tool_args)
                yield ("tool_result", {"tool": tool_name, "status": "ok"})

            # Log to proposals table for approvals page (fire-and-forget, own session)
            if clone_id is not None:
                await _log_tool_action(
                    clone_id, tool_name, tool_args, result_text,
                    server.name if server else "unknown",
                )

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result_text,
            })

        messages.append({"role": "user", "content": tool_results})

    _log.warning("Tool path stream hit max iterations (%d)", _MAX_TOOL_ITERATIONS)
    msg = "I completed several steps but couldn't fully finish. Please review."
    yield ("token", msg)
    yield ("done", (msg, trace))
