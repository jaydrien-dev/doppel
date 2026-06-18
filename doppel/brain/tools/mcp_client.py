"""
MCP Client — connects to MCP servers via streamable HTTP transport.

Uses httpx (already in project) to call MCP servers without requiring the
full mcp Python SDK. Implements only what we need:
  - list_tools: discover available tools and their schemas
  - call_tool: execute a tool and return the text result

Encryption:
  API keys and extra headers are stored encrypted in clone_mcp_servers using
  the existing encrypt_field / decrypt_field helpers.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from doppel.brain.security.encryption import decrypt_field

_log = logging.getLogger(__name__)

_TOOL_CALL_TIMEOUT = 30.0   # seconds per MCP tool call
_LIST_TIMEOUT      = 10.0   # seconds for tools/list


@dataclass
class MCPServer:
    id: UUID
    name: str
    server_url: str
    transport: str          # 'sse' | 'streamablehttp'
    api_key: str | None     # decrypted
    extra_headers: dict     # decrypted
    native: bool = False    # True when handled by a native REST connector (no MCP proxy needed)


def _build_headers(server: MCPServer) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if server.api_key:
        headers["Authorization"] = f"Bearer {server.api_key}"
    headers.update(server.extra_headers)
    return headers


async def list_tools(server: MCPServer) -> list[dict]:
    """
    Call /tools/list on an MCP server and return Anthropic-format tool schemas.

    MCP /tools/list response shape:
      { "tools": [ { "name": "...", "description": "...", "inputSchema": {...} }, ... ] }

    Anthropic tool shape:
      { "name": "...", "description": "...", "input_schema": {...} }
    """
    url = server.server_url.rstrip("/") + "/tools/list"
    try:
        async with httpx.AsyncClient(timeout=_LIST_TIMEOUT) as client:
            resp = await client.post(url, headers=_build_headers(server), json={})
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        _log.warning("MCP list_tools failed for %s (%s): %s", server.name, url, exc)
        return []

    raw_tools: list[dict] = data.get("tools", [])
    anthropic_tools: list[dict] = []
    for t in raw_tools:
        anthropic_tools.append({
            "name": f"{server.name}__{t['name']}",   # namespace: "GoogleDrive__search_files"
            "description": t.get("description", ""),
            "input_schema": t.get("inputSchema", {"type": "object", "properties": {}}),
        })
    return anthropic_tools


async def call_tool(server: MCPServer, namespaced_tool_name: str, args: dict) -> str:
    """
    Execute a tool on an MCP server and return the text result.

    namespaced_tool_name: "GoogleDrive__search_files"  (server name + __ + tool name)
    Returns a plain string suitable for feeding back into the conversation.
    """
    # Strip server name prefix to get the actual tool name
    prefix = server.name + "__"
    actual_tool = (
        namespaced_tool_name[len(prefix):]
        if namespaced_tool_name.startswith(prefix)
        else namespaced_tool_name
    )

    url = server.server_url.rstrip("/") + "/tools/call"
    payload = {"name": actual_tool, "arguments": args}

    try:
        async with httpx.AsyncClient(timeout=_TOOL_CALL_TIMEOUT) as client:
            resp = await client.post(url, headers=_build_headers(server), json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        _log.warning("MCP call_tool HTTP error %s for %s: %s", exc.response.status_code, actual_tool, exc)
        return f"[Tool error: {exc.response.status_code} from {server.name}]"
    except Exception as exc:
        _log.warning("MCP call_tool failed for %s: %s", actual_tool, exc)
        return f"[Tool error: {exc}]"

    # MCP result shape: { "content": [ { "type": "text", "text": "..." } ], "isError": false }
    content_blocks = data.get("content", [])
    if not content_blocks:
        return "[Tool returned no content]"

    parts: list[str] = []
    for block in content_blocks:
        if block.get("type") == "text":
            parts.append(block.get("text", ""))
        elif block.get("type") == "resource":
            # Embedded resource — return the URI at minimum
            parts.append(f"[Resource: {block.get('resource', {}).get('uri', '?')}]")

    if data.get("isError"):
        _log.warning("MCP tool %s returned isError=true: %s", actual_tool, parts)

    return "\n".join(parts) or "[Empty result]"


async def load_clone_tools(
    session: AsyncSession,
    clone_id: UUID,
) -> tuple[list[dict], dict[str, MCPServer]]:
    """
    Load all enabled MCP servers for a clone, fetch their tool schemas,
    and return:
      - anthropic_tools: list of Anthropic-format tool dicts (with namespaced names)
      - servers_by_tool:  mapping of namespaced_tool_name → MCPServer

    Returns ([], {}) if no servers are configured or all are unreachable.
    This function never raises — failures are logged and skipped.
    """
    try:
        rows = await session.execute(
            text(
                "SELECT id, name, server_url, transport, api_key_enc, headers_enc "
                "FROM clone_mcp_servers "
                "WHERE clone_id = :cid AND enabled = TRUE"
            ),
            {"cid": str(clone_id)},
        )
        server_rows = rows.fetchall()
    except Exception as exc:
        _log.warning("load_clone_tools: DB query failed: %s", exc)
        return [], {}

    if not server_rows:
        return [], {}

    from doppel.brain.tools.connectors import get_native_tools

    all_tools: list[dict] = []
    servers_by_tool: dict[str, MCPServer] = {}

    for row in server_rows:
        # Decrypt credentials
        api_key = decrypt_field(row[4])
        extra_headers: dict = {}
        if row[5]:
            try:
                raw = decrypt_field(row[5])
                if raw:
                    extra_headers = json.loads(raw)
            except Exception:
                pass

        server = MCPServer(
            id=row[0],
            name=row[1],
            server_url=row[2],
            transport=row[3],
            api_key=api_key,
            extra_headers=extra_headers,
        )

        # Prefer native REST connector over placeholder MCP proxy URL
        native_tools = get_native_tools(server.name)
        if native_tools is not None:
            server.native = True
            tools = native_tools
            _log.debug("Using native connector for %s (%d tools)", server.name, len(tools))
        else:
            tools = await list_tools(server)

        for tool in tools:
            servers_by_tool[tool["name"]] = server
        all_tools.extend(tools)

    return all_tools, servers_by_tool
