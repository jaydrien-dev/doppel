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
import copy
import io
import logging
import sys
from typing import AsyncGenerator, Awaitable, Callable

# Make the process DPI-aware on Windows so pyautogui coordinates match
# the physical pixel coordinates reported by mss (no scaling mismatch).
if sys.platform == "win32":
    import ctypes
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # PROCESS_PER_MONITOR_DPI_AWARE
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

import pyautogui
import mss
import mss.tools
from PIL import Image
import anthropic

from doppel.config import settings

logger = logging.getLogger(__name__)

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.0

# ---------------------------------------------------------------------------
# Action classification
# ---------------------------------------------------------------------------

# These change visible state — always screenshot after so the model can verify
_CLICK_ACTIONS = {"left_click", "right_click", "double_click", "middle_click", "left_click_drag"}

# These are fast/predictable — return text confirmation only, no screenshot
# The model should batch these freely and request an explicit screenshot only
# when it needs to verify state afterwards.
_FAST_ACTIONS = {"type", "key", "scroll", "mouse_move", "cursor_position"}

# Settle time per action type (seconds)
_WAIT: dict[str, float] = {
    "left_click":      0.10,
    "right_click":     0.10,
    "double_click":    0.20,
    "middle_click":    0.10,
    "left_click_drag": 0.20,
    "type":            0.04,
    "key":             0.05,
    "scroll":          0.06,
    "mouse_move":      0.02,
    "cursor_position": 0.00,
}


# ---------------------------------------------------------------------------
# Monitor enumeration
# ---------------------------------------------------------------------------

def list_monitors() -> list[dict]:
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
    quality: int = 65,
    max_width: int = 1024,
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
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _capture_jpeg, monitor_index)


# ---------------------------------------------------------------------------
# History pruning — keeps context window small throughout long tasks
# ---------------------------------------------------------------------------

def _prune_history(messages: list[dict], keep_last: int = 2) -> list[dict]:
    """
    Return a copy of messages with all but the last `keep_last` screenshot
    image blocks replaced by a tiny text placeholder.

    Without this, a 20-step task would send 20 full screenshots in every API
    call. Each screenshot is ~50-100K tokens of base64. Pruning keeps cost
    and latency flat regardless of task length.
    """
    # Walk the message list and record every image block location
    # Location = (msg_idx, content_idx, inner_idx_or_None)
    locations: list[tuple[int, int, int | None]] = []

    for mi, msg in enumerate(messages):
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for ci, block in enumerate(content):
            if not isinstance(block, dict):
                continue
            if block.get("type") == "image":
                locations.append((mi, ci, None))
            elif block.get("type") == "tool_result":
                inner = block.get("content")
                if isinstance(inner, list):
                    for ii, ib in enumerate(inner):
                        if isinstance(ib, dict) and ib.get("type") == "image":
                            locations.append((mi, ci, ii))

    n_drop = max(0, len(locations) - keep_last)
    if n_drop == 0:
        return messages

    pruned = copy.deepcopy(messages)
    PLACEHOLDER = {"type": "text", "text": "[screenshot]"}

    for mi, ci, ii in locations[:n_drop]:
        if ii is None:
            pruned[mi]["content"][ci] = PLACEHOLDER
        else:
            pruned[mi]["content"][ci]["content"][ii] = PLACEHOLDER

    return pruned


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

    Claude's coordinates are in the scaled screenshot space (e.g. 1024×576).
    We scale them back to actual monitor resolution, then add the global
    monitor offset so pyautogui lands in the right place on multi-monitor setups.
    """

    def __init__(
        self,
        monitor_offset: tuple[int, int] = (0, 0),
        scaled_size: tuple[int, int] = (1024, 576),
        actual_size: tuple[int, int] = (1920, 1080),
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
            pyautogui.moveTo(x, y)
            lx, ly = action["coordinate"]
            return f"move to ({lx}, {ly})"

        elif kind == "left_click_drag":
            sx, sy = self._g(action["start_coordinate"])
            ex, ey = self._g(action["coordinate"])
            pyautogui.mouseDown(button="left", x=sx, y=sy)
            pyautogui.moveTo(ex, ey, duration=0.18)
            pyautogui.mouseUp(button="left")
            return f"drag {action['start_coordinate']} → {action['coordinate']}"

        elif kind == "type":
            text = action.get("text", "")
            # Clipboard paste is ~instant vs character-by-character typing
            try:
                import pyperclip  # type: ignore
                pyperclip.copy(text)
                pyautogui.hotkey("ctrl", "v")
            except Exception:
                pyautogui.write(text, interval=0.0)
            preview = text[:60] + ("…" if len(text) > 60 else "")
            return f'typed "{preview}"'

        elif kind == "key":
            keys = _parse_hotkey(action.get("text", ""))
            if len(keys) == 1:
                pyautogui.press(keys[0])
            else:
                pyautogui.hotkey(*keys)
            return f"key: {action.get('text', '')}"

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
You are a skilled computer operator executing tasks as a productive employee would. \
Plan your steps, batch related actions, and move fast without second-guessing.

== SPEED RULES ==

1. Batch actions. Issue ALL predictable sequential actions in ONE response — \
   do not wait between steps you're certain about. \
   CRITICAL: clicking a field and typing into it are ONE batch: left_click → type → (optional) key Enter. \
   Never issue a click and then wait for confirmation before typing.
2. Screenshot policy:
   • After left_click / right_click / double_click / drag: a screenshot is returned automatically.
   • After type / key / scroll / mouse_move: you receive TEXT confirmation only (no screenshot). \
     Issue an explicit screenshot tool call only when you need to see state after these.
3. A click ALWAYS succeeds. Never click the same coordinate twice. \
   If you clicked a field, it is focused — type into it immediately. \
   The system will tell you if [REPEATED ACTION DETECTED] — if that happens, stop and proceed with the next step.
4. If something fails: try one alternative, then stop and report the error precisely.
5. query_brain before tasks involving {name}'s preferences, contacts, files, or past decisions.
6. When done: exactly one sentence stating what was accomplished.

== SESSION CONTEXT ==

If a SESSION CONTEXT section follows this prompt, it contains the recent chat \
between the user and {name}. Treat it as your working memory:
• "do what you just said", "execute that", "go ahead" → read the latest Clone: \
  entry and carry out whatever was described or planned there.
• "use the response you gave", "paste what you wrote" → extract that content \
  and type it into the target application.
• References to people, subjects, files, or decisions → resolve them from context \
  before querying the brain.
Always check SESSION CONTEXT before assuming you lack information.

== HARD LIMITS ==

• No passwords or credentials.
• No financial confirmations or purchases.
• No Send/Submit on emails without showing the draft first.
• No document signing or legal agreements.
• If genuinely unsafe: stop and state why in one sentence.\
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
    session_context: str = "",
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
        "message": f"Display {monitor_index}: {actual_w}×{actual_h} → {width}×{height}  ·  Starting task",
    }

    # --- Tools ---------------------------------------------------------------
    tools: list = [
        {
            "type": "computer_20251124",
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
    if session_context:
        system += f"\n\n== SESSION CONTEXT ==\n{session_context}"

    loop = asyncio.get_running_loop()

    # Repeat-action detection — stores (action_kind, coordinate_or_text) of last click
    _last_action_sig: tuple | None = None

    # --- Agent loop ----------------------------------------------------------
    for step in range(max_steps):
        yield {"type": "status", "message": f"Step {step + 1}…"}

        # Prune screenshots from history — keeps token count flat over time
        pruned_messages = _prune_history(messages, keep_last=2)

        try:
            response = await client.beta.messages.create(
                model=settings.computer_use_model,
                max_tokens=2048,
                system=system,
                tools=tools,  # type: ignore[arg-type]
                messages=pruned_messages,
                betas=["computer-use-2025-11-24"],
            )
        except anthropic.APIError as exc:
            yield {"type": "error", "message": f"API error: {exc}"}
            return

        # Emit any reasoning text
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
            yield {"type": "error", "message": f"Unexpected stop_reason: {response.stop_reason}"}
            return

        # --- Process tool calls (may be multiple — batched by the model) ----
        tool_results = []

        for block in response.content:
            if block.type != "tool_use":
                continue

            # ── Brain query ──────────────────────────────────────────────────
            if block.name == "query_brain":
                query: str = block.input.get("query", "")  # type: ignore[union-attr]
                yield {"type": "status", "message": f'Brain: "{query[:80]}"'}

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
                    # Explicit screenshot request
                    yield {"type": "action", "action": "screenshot", "detail": "Taking screenshot"}
                    img_b64, *_ = await take_screenshot(monitor_index)
                    yield {"type": "screenshot", "data": img_b64}
                    tool_results.append(_img_result(block.id, img_b64))

                elif action_kind in _CLICK_ACTIONS:
                    # Repeat-action guard: same coordinate clicked twice → skip + warn.
                    # Coordinates within 5px are treated as the same target.
                    coord = action.get("coordinate", [0, 0])
                    def _near(a: list, b: list) -> bool:
                        return abs(a[0] - b[0]) <= 5 and abs(a[1] - b[1]) <= 5
                    if _last_action_sig and _last_action_sig[0] == action_kind and _near(coord, list(_last_action_sig[1])):
                        warn = "[REPEATED ACTION DETECTED] You already performed this click. It succeeded. Do NOT click here again — proceed to the next step."
                        yield {"type": "action", "action": action_kind, "detail": f"skipped repeat at {coord}"}
                        tool_results.append(_text_result(block.id, warn))
                    else:
                        _last_action_sig = (action_kind, tuple(coord))
                        # Execute + screenshot (clicks change visible state)
                        detail = await loop.run_in_executor(None, executor.execute, action)
                        yield {"type": "action", "action": action_kind, "detail": detail}
                        await asyncio.sleep(_WAIT.get(action_kind, 0.10))
                        img_b64, *_ = await take_screenshot(monitor_index)
                        yield {"type": "screenshot", "data": img_b64}
                        tool_results.append(_img_result(block.id, img_b64))

                elif action_kind in _FAST_ACTIONS:
                    # Execute + text confirmation only — no screenshot
                    # The model can batch many of these freely
                    if action_kind in ("type", "key"):
                        _last_action_sig = None  # model has moved on from the last click
                    detail = await loop.run_in_executor(None, executor.execute, action)
                    yield {"type": "action", "action": action_kind, "detail": detail}
                    await asyncio.sleep(_WAIT.get(action_kind, 0.05))
                    tool_results.append(_text_result(block.id, detail))

                else:
                    # Unknown action — execute + screenshot to be safe
                    detail = await loop.run_in_executor(None, executor.execute, action)
                    yield {"type": "action", "action": action_kind, "detail": detail}
                    await asyncio.sleep(0.10)
                    img_b64, *_ = await take_screenshot(monitor_index)
                    yield {"type": "screenshot", "data": img_b64}
                    tool_results.append(_img_result(block.id, img_b64))

        messages.append({"role": "assistant", "content": response.content})  # type: ignore
        messages.append({"role": "user", "content": tool_results})

    yield {"type": "error", "message": "Reached maximum step limit. Task may be incomplete."}


# ---------------------------------------------------------------------------
# Tool result helpers
# ---------------------------------------------------------------------------

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


def _text_result(tool_use_id: str, text: str) -> dict:
    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "content": text,
    }
