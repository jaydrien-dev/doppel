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
from doppel.brain.tools.mcp_client import MCPServer, call_tool
from doppel.brain.tools.connectors import call_native_tool

_log = logging.getLogger(__name__)

_MAX_TOOL_ITERATIONS = 8
_MODEL = "claude-sonnet-4-6"


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


def _build_system(identity: IdentityLayer, memory: MemoryContext) -> str:
    """Build the system prompt for the tool path."""
    persona = identity.render_persona_block()

    # Inject relevant memory as context
    context_parts: list[str] = []
    if memory.episodic:
        excerpts = "\n".join(f"- {c.content[:300]}" for c in memory.episodic[:5])
        context_parts.append(f"## Relevant knowledge\n{excerpts}")
    if memory.semantic:
        facts = "\n".join(f"- {f.fact}" for f in memory.semantic[:5])
        context_parts.append(f"## Key facts\n{facts}")

    context_block = "\n\n".join(context_parts)

    return f"""{persona}

{context_block}

## Tool use instructions
You have access to external tools. Use them when the user asks you to take an action (post, search, find, create, delete, etc.).
- Call the appropriate tool with the right arguments.
- After calling a tool, report the result clearly and concisely.
- If a tool fails, say so and offer an alternative.
- Never fabricate tool results.
- Respond in plain conversational sentences. Never use email sign-offs (Best, Regards, Cheers, etc.), bullet lists of steps, or formal closings."""


async def run(
    brain_input: BrainInput,
    identity: IdentityLayer,
    memory: MemoryContext,
    working: list[WorkingMemoryTurn],
    mcp_tools: list[dict],
    servers_by_name: dict[str, MCPServer],
) -> tuple[str, ReasoningTrace]:
    """
    Non-streaming tool path. Returns (response_text, trace).
    """
    import httpx

    trace = ReasoningTrace(id=uuid4(), path="fast")
    trace.framing = "tool_path"

    messages = _build_messages(brain_input, memory, working)
    system = _build_system(identity, memory)
    api_key = get_anthropic_key()

    tool_names_called: list[str] = []

    for iteration in range(_MAX_TOOL_ITERATIONS):
        body = {
            "model": _MODEL,
            "max_tokens": 1024,
            "system": system,
            "tools": mcp_tools,
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
                result_text = await call_native_tool(server.name, tool_name, tool_args, server.api_key or "")
            else:
                result_text = await call_tool(server, tool_name, tool_args)

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
    system = _build_system(identity, memory)
    api_key = get_anthropic_key()

    tool_names_called: list[str] = []

    for iteration in range(_MAX_TOOL_ITERATIONS):
        body = {
            "model": _MODEL,
            "max_tokens": 1024,
            "system": system,
            "tools": mcp_tools,
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
                result_text = await call_native_tool(server.name, tool_name, tool_args, server.api_key or "")
                yield ("tool_result", {"tool": tool_name, "status": "ok"})
            else:
                result_text = await call_tool(server, tool_name, tool_args)
                yield ("tool_result", {"tool": tool_name, "status": "ok"})

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
