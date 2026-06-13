"""
Doppel Agent Sidecar
====================
Standalone FastAPI WebSocket server compiled with PyInstaller.
No database, no auth — controlled entirely by the Electron main process.

Routes:
  GET  /health
  WS   /task/stream?clone_name=<str>&monitor_index=<int>

The client sends one JSON frame:
  {
    "instruction":          "open Chrome and search for X",
    "api_key":              "sk-ant-…",         # required
    "conversation_history": [...]               # optional
  }
"""

from __future__ import annotations

import asyncio
import os
import sys
import types

# ---------------------------------------------------------------------------
# Shim doppel.config BEFORE computer_agent is imported.
# computer_agent.py does `from doppel.config import settings` at module level.
# We inject a minimal stand-in with the two fields the agent actually uses.
# ---------------------------------------------------------------------------

class _FakeSettings:
    anthropic_api_key: str  = os.environ.get("ANTHROPIC_API_KEY", "")
    computer_use_model: str = os.environ.get("COMPUTER_USE_MODEL", "claude-opus-4-6")

_doppel_pkg          = types.ModuleType("doppel")
_config_mod          = types.ModuleType("doppel.config")
_config_mod.settings = _FakeSettings()          # type: ignore[attr-defined]
_doppel_pkg.config   = _config_mod              # type: ignore[attr-defined]
sys.modules.setdefault("doppel",        _doppel_pkg)
sys.modules.setdefault("doppel.config", _config_mod)

# Now safe to import — PyInstaller bundles computer_agent.py alongside server.py
import computer_agent  # type: ignore[import]  # noqa: E402

import uvicorn
from fastapi import FastAPI, WebSocket
from starlette.websockets import WebSocketDisconnect

AGENT_PORT = int(os.environ.get("DOPPEL_AGENT_PORT", "8001"))

app = FastAPI(title="Doppel Agent Sidecar", version="1.0.0")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.websocket("/task/stream")
async def task_stream(
    websocket: WebSocket,
    clone_name: str    = "Agent",
    monitor_index: int = 1,
) -> None:
    await websocket.accept()

    # ── Receive task payload ────────────────────────────────────────────────
    try:
        payload = await asyncio.wait_for(websocket.receive_json(), timeout=30)
    except asyncio.TimeoutError:
        await websocket.send_json({"type": "error", "message": "Timed out waiting for task."})
        return
    except WebSocketDisconnect:
        return

    instruction: str = (payload.get("instruction") or "").strip()
    if not instruction:
        await websocket.send_json({"type": "error", "message": "No instruction provided."})
        return

    api_key: str = (payload.get("api_key") or "").strip()
    if not api_key:
        await websocket.send_json({
            "type": "error",
            "message": "Anthropic API key not configured. Open Settings → API Keys → Anthropic API Key.",
        })
        return

    # ── Build session context from conversation history ─────────────────────
    session_context = ""
    history: list[dict] = payload.get("conversation_history", [])
    if history:
        lines = [
            f"{'User' if m.get('role') == 'user' else 'Clone'}: {str(m.get('content', '')).strip()}"
            for m in history[-20:]
            if str(m.get("content", "")).strip()
        ]
        if lines:
            session_context = "\n".join(lines)

    # ── Stop listener ───────────────────────────────────────────────────────
    stop_event = asyncio.Event()

    async def _listen_stop() -> None:
        try:
            while True:
                msg = await websocket.receive_json()
                if msg.get("action") == "stop":
                    stop_event.set()
                    break
        except Exception:
            stop_event.set()

    listen_task = asyncio.create_task(_listen_stop())

    # ── Run agent ───────────────────────────────────────────────────────────
    try:
        async for event in computer_agent.run_computer_task(
            clone_name=clone_name,
            instruction=instruction,
            monitor_index=monitor_index,
            brain_query_fn=None,   # no memory in sidecar
            api_key=api_key,
            session_context=session_context,
        ):
            if stop_event.is_set():
                await websocket.send_json({"type": "done", "result": "Task stopped by user."})
                break
            try:
                await websocket.send_json(event)
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        listen_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=AGENT_PORT, workers=1, log_level="warning")
