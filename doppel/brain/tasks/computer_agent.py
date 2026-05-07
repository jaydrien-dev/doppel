"""
Computer Use Agent
==================
Executes complex work tasks autonomously using Claude's computer use API.
Has access to the clone's memory/knowledge base to make informed decisions.

Multi-monitor aware: coordinates are automatically offset to the selected monitor.

Each call to `run_computer_task` is an async generator yielding event dicts:
  {"type": "status",     "message": str}
  {"type": "thought",    "text": str}
  {"type": "action",     "action": str, "detail": str}
  {"type": "screenshot", "data": str}           — base64 JPEG
  {"type": "brain",      "query": str, "result": str}  — memory lookup
  {"type": "done",       "result": str}
  {"type": "error",      "message": str}
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import time
from typing import AsyncGenerator, Awaitable, Callable

import pyautogui
import mss
import mss.tools
from PIL import Image
import anthropic

from doppel.config import settings

logger = logging.getLogger(__name__)

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.1

# ---------------------------------------------------------------------------
# Monitor enumeration
# ---------------------------------------------------------------------------

def list_monitors() -> list[dict]:
    """
    Return info on each physical monitor (excludes the combined virtual screen).
    Each dict: {index, width, height, left, top, name}
    """
    with mss.mss() as sct:
        return [
            {
                "index": i,
                "width":  m["width"],
                "height": m["height"],
                "left":   m["left"],
                "top":    m["top"],
                "name":   f"Display {i}  ({m['width']} × {m['height']})",
            }
            for i, m in enumerate(sct.monitors[1:], 1)
        ]


# ---------------------------------------------------------------------------
# Screen capture
# ---------------------------------------------------------------------------

def _capture_jpeg(
    monitor_index: int = 1,
    quality: int = 72,
    max_width: int = 1280,
) -> tuple[str, int, int, int, int]:
    """
    Capture monitor_index and return
    (base64_jpeg, scaled_width, scaled_height, actual_width, actual_height).
    scaled_* is what Claude sees; actual_* is the real monitor resolution.
    """
    with mss.mss() as sct:
        monitors = sct.monitors
        idx = monitor_index if 1 <= monitor_index < len(monitors) else 1
        raw = sct.grab(monitors[idx])
        img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")

    actual_w, actual_h = img.width, img.height

    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return base64.standard_b64encode(buf.getvalue()).decode(), img.width, img.height, actual_w, actual_h


async def take_screenshot(monitor_index: int = 1) -> tuple[str, int, int, int, int]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _capture_jpeg, monitor_index)


# ---------------------------------------------------------------------------
# Key mapping  (Claude uses X11 names; pyautogui uses its own)
# ---------------------------------------------------------------------------

_KEY_MAP: dict[str, str] = {
    "Return": "enter",      "BackSpace": "backspace",
    "Delete": "delete",     "Escape": "esc",
    "Tab": "tab",           "space": "space",
    "super": "win",         "Left": "left",
    "Right": "right",       "Up": "up",
    "Down": "down",         "Home": "home",
    "End": "end",           "Page_Up": "pageup",
    "Page_Down": "pagedown","caps_lock": "capslock",
    "Print": "printscreen", "Insert": "insert",
    **{f"F{i}": f"f{i}" for i in range(1, 13)},
}


def _map_key(k: str) -> str:
    return _KEY_MAP.get(k, k.lower())


def _parse_hotkey(text: str) -> list[str]:
    return [_map_key(k) for k in text.split("+")]


# ---------------------------------------------------------------------------
# Action executor — monitor-offset aware
# ---------------------------------------------------------------------------

class ActionExecutor:
    """
    Wraps pyautogui calls.

    Claude's coordinates are in the scaled screenshot space (e.g. 1280×720).
    We must scale them back to actual monitor resolution, then add the global
    monitor offset so pyautogui lands in the right place on multi-monitor setups.
    """

    def __init__(
        self,
        monitor_offset: tuple[int, int] = (0, 0),
        scaled_size: tuple[int, int] = (1280, 720),
        actual_size: tuple[int, int] = (1280, 720),
    ) -> None:
        self.ox, self.oy = monitor_offset
        self.scale_x = actual_size[0] / scaled_size[0] if scaled_size[0] else 1.0
        self.scale_y = actual_size[1] / scaled_size[1] if scaled_size[1] else 1.0

    def _g(self, coord: list) -> tuple[int, int]:
        """Scale from Claude's coordinate space → actual screen coordinates."""
        return (
            int(coord[0] * self.scale_x) + self.ox,
            int(coord[1] * self.scale_y) + self.oy,
        )

    def execute(self, action: dict) -> str:
        kind = action.get("action", "")

        if kind == "screenshot":
            return "screenshot"

        elif kind in ("left_click", "right_click", "double_click", "middle_click"):
            x, y = self._g(action["coordinate"])
            # Move first so the target window receives focus before the click
            pyautogui.moveTo(x, y, duration=0.15)
            time.sleep(0.05)
            if kind == "left_click":
                pyautogui.click(x, y, button="left")
            elif kind == "right_click":
                pyautogui.rightClick(x, y)
            elif kind == "double_click":
                pyautogui.doubleClick(x, y)
            elif kind == "middle_click":
                pyautogui.middleClick(x, y)
            lx, ly = action["coordinate"]
            return f"{kind.replace('_', ' ')} at ({lx}, {ly})"

        elif kind == "mouse_move":
            x, y = self._g(action["coordinate"])
            pyautogui.moveTo(x, y, duration=0.15)
            lx, ly = action["coordinate"]
            return f"move cursor to ({lx}, {ly})"

        elif kind == "left_click_drag":
            sx, sy = self._g(action["start_coordinate"])
            ex, ey = self._g(action["coordinate"])
            pyautogui.moveTo(sx, sy, duration=0.15)
            time.sleep(0.05)
            pyautogui.mouseDown(button="left")
            pyautogui.moveTo(ex, ey, duration=0.35)
            pyautogui.mouseUp(button="left")
            return f"drag {action['start_coordinate']} → {action['coordinate']}"

        elif kind == "type":
            text = action.get("text", "")
            try:
                pyautogui.write(text, interval=0.02)
            except Exception:
                try:
                    import pyperclip  # type: ignore
                    pyperclip.copy(text)
                    pyautogui.hotkey("ctrl", "v")
                except Exception:
                    pass
            preview = text[:60] + ("…" if len(text) > 60 else "")
            return f'type "{preview}"'

        elif kind == "key":
            keys = _parse_hotkey(action.get("text", ""))
            if len(keys) == 1:
                pyautogui.press(keys[0])
            else:
                pyautogui.hotkey(*keys)
            return f"key  {action.get('text', '')}"

        elif kind == "scroll":
            x, y = self._g(action["coordinate"])
            direction = action.get("direction", "down")
            amount = int(action.get("amount", 3))
            pyautogui.scroll(-amount if direction == "down" else amount, x=x, y=y)
            lx, ly = action["coordinate"]
            return f"scroll {direction} ×{amount} at ({lx}, {ly})"

        elif kind == "cursor_position":
            pos = pyautogui.position()
            return f"cursor at ({pos.x - self.ox}, {pos.y - self.oy})"

        return f"unknown action: {kind}"


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are {name}'s AI work assistant — built on Doppel's clone platform. \
You autonomously complete complex work tasks by controlling {name}'s computer \
AND drawing on {name}'s personal knowledge base.

== YOUR TWO SUPERPOWERS ==

1. Computer control — keyboard, mouse, screen.
2. Brain memory — you can call `query_brain` at any time to retrieve \
{name}'s past decisions, domain expertise, preferences, contacts, \
project context, and accumulated knowledge. \
USE THIS BEFORE MAKING ASSUMPTIONS. \
If a task involves {name}'s preferences, past work, or institutional \
knowledge, query_brain first.

== HOW TO WORK ==

• Think out loud before each major step. Say what you plan to do and why.
• Take a screenshot after each action to verify it worked.
• If an action fails, try once with a different approach, then stop and explain.
• Be efficient — complete tasks with minimum unnecessary actions.
• Summarise what you accomplished at the end.

== HARD LIMITS (never override) ==

• Do NOT open, read, or transmit files the user has not explicitly mentioned.
• Do NOT enter passwords or credentials into any form.
• Do NOT confirm purchases, payments, or financial transactions.
• Do NOT click "Send", "Submit", or "Confirm" on emails or messages \
  without first showing the user what you are about to send.
• Do NOT sign documents or accept legal terms on the user's behalf.
• If you are uncertain whether an action is safe: STOP and ask.

== SCOPE ==

This is a workplace productivity tool. \
You help {name} do their job faster — drafting, researching, organising, \
filling forms, running workflows. \
You are not a general-purpose computer controller. \
Refuse tasks that are clearly outside work context.\
"""


# ---------------------------------------------------------------------------
# Brain query tool definition (used alongside the computer tool)
# ---------------------------------------------------------------------------

BRAIN_TOOL = {
    "name": "query_brain",
    "description": (
        "Retrieve memories, knowledge, and past decisions from your knowledge base. "
        "Use this whenever you need to know: preferences, contacts, project names, "
        "past decisions, domain knowledge, or anything the user has told you before. "
        "Always call this before making assumptions about the user's context."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "A natural-language description of what you need to know.",
            }
        },
        "required": ["query"],
    },
}


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

BrainQueryFn = Callable[[str], Awaitable[str]]


async def run_computer_task(
    clone_name: str,
    instruction: str,
    monitor_index: int = 1,
    brain_query_fn: BrainQueryFn | None = None,
    max_steps: int = 80,
    api_key: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Async generator — pipe every yielded event to the frontend WebSocket.

    Parameters
    ----------
    clone_name      Display name of the clone (used in system prompt).
    instruction     The task the user wants completed.
    monitor_index   Which physical monitor to control (1 = primary).
    brain_query_fn  Async callable that takes a query string and returns
                    relevant memories as a formatted string.  If None,
                    brain queries return a "not available" message.
    max_steps       Hard cap on agent loop iterations.
    api_key         Anthropic API key to use. Falls back to settings if None.
    """
    client = anthropic.AsyncAnthropic(api_key=api_key or settings.anthropic_api_key)

    # Resolve monitor offset for coordinate translation
    monitors = list_monitors()
    mon = next((m for m in monitors if m["index"] == monitor_index), None)
    offset: tuple[int, int] = (mon["left"], mon["top"]) if mon else (0, 0)

    # --- Initial screenshot --------------------------------------------------
    yield {"type": "status", "message": f"Capturing display {monitor_index}…"}
    try:
        img_b64, width, height, actual_w, actual_h = await take_screenshot(monitor_index)
    except Exception as exc:
        yield {"type": "error", "message": f"Screenshot failed: {exc}"}
        return

    executor = ActionExecutor(
        monitor_offset=offset,
        scaled_size=(width, height),
        actual_size=(actual_w, actual_h),
    )

    yield {"type": "screenshot", "data": img_b64}
    yield {
        "type": "status",
        "message": f"Display {monitor_index}: {actual_w}×{actual_h} → scaled to {width}×{height}  ·  Starting task",
    }

    # --- Tools ---------------------------------------------------------------
    tools: list = [
        {
            "type": "computer_20250124",
            "name": "computer",
            "display_width_px": width,
            "display_height_px": height,
        },
        BRAIN_TOOL,
    ]

    # --- Conversation --------------------------------------------------------
    messages: list[dict] = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": img_b64,
                    },
                },
                {"type": "text", "text": instruction},
            ],
        }
    ]

    system = SYSTEM_PROMPT.format(name=clone_name)

    # --- Agent loop ----------------------------------------------------------
    for step in range(max_steps):
        yield {"type": "status", "message": f"Step {step + 1} — thinking…"}

        try:
            response = await client.beta.messages.create(
                model=settings.computer_use_model,
                max_tokens=4096,
                system=system,
                tools=tools,  # type: ignore[arg-type]
                messages=messages,
                betas=["computer-use-2025-01-24"],
            )
        except anthropic.APIError as exc:
            yield {"type": "error", "message": f"API error: {exc}"}
            return

        # Emit reasoning / narration text
        for block in response.content:
            if hasattr(block, "text") and block.text:
                yield {"type": "thought", "text": block.text}

        if response.stop_reason == "end_turn":
            final = " ".join(
                b.text for b in response.content
                if hasattr(b, "text") and b.text
            ).strip()
            yield {"type": "done", "result": final or "Task complete."}
            return

        if response.stop_reason != "tool_use":
            yield {
                "type": "error",
                "message": f"Unexpected stop_reason: {response.stop_reason}",
            }
            return

        # --- Process tool calls ---------------------------------------------
        tool_results = []

        for block in response.content:
            if block.type != "tool_use":
                continue

            # ── Brain query ──────────────────────────────────────────────────
            if block.name == "query_brain":
                query: str = block.input.get("query", "")  # type: ignore[union-attr]
                yield {"type": "status", "message": f'Querying brain: "{query[:80]}"'}

                if brain_query_fn:
                    try:
                        result = await brain_query_fn(query)
                    except Exception as exc:
                        result = f"Brain query failed: {exc}"
                else:
                    result = "Brain access not available in this session."

                yield {"type": "brain", "query": query, "result": result}
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

            # ── Computer actions ─────────────────────────────────────────────
            else:
                action: dict = block.input  # type: ignore[assignment]
                action_kind = action.get("action", "")

                if action_kind == "screenshot":
                    yield {"type": "action", "action": "screenshot", "detail": "Taking screenshot"}
                    img_b64, *_ = await take_screenshot(monitor_index)
                    yield {"type": "screenshot", "data": img_b64}
                    tool_results.append(_img_result(block.id, img_b64))

                else:
                    loop = asyncio.get_event_loop()
                    detail = await loop.run_in_executor(None, executor.execute, action)
                    yield {"type": "action", "action": action_kind, "detail": detail}
                    await asyncio.sleep(0.4)

                    img_b64, *_ = await take_screenshot(monitor_index)
                    yield {"type": "screenshot", "data": img_b64}
                    tool_results.append(_img_result(block.id, img_b64))

        messages.append({"role": "assistant", "content": response.content})  # type: ignore
        messages.append({"role": "user", "content": tool_results})

    yield {"type": "error", "message": "Reached maximum step limit. Task may be incomplete."}


def _img_result(tool_use_id: str, img_b64: str) -> dict:
    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "content": [{
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": img_b64,
            },
        }],
    }
