#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/../.."

echo "[agent] Copying computer_agent.py from doppel package..."
cp -f "$ROOT_DIR/doppel/brain/tasks/computer_agent.py" "$SCRIPT_DIR/computer_agent.py"

echo "[agent] Setting up venv..."
if [ ! -d "$SCRIPT_DIR/.venv" ]; then
    python3 -m venv "$SCRIPT_DIR/.venv"
fi
source "$SCRIPT_DIR/.venv/bin/activate"
pip install --quiet -r "$SCRIPT_DIR/requirements.txt"

echo "[agent] Building with PyInstaller..."
pyinstaller \
    --onefile \
    --name doppel-agent \
    --distpath "$SCRIPT_DIR/../assets/bin" \
    --workpath "$SCRIPT_DIR/build" \
    --specpath "$SCRIPT_DIR" \
    --hidden-import uvicorn.logging \
    --hidden-import uvicorn.loops \
    --hidden-import uvicorn.loops.auto \
    --hidden-import uvicorn.protocols \
    --hidden-import uvicorn.protocols.http \
    --hidden-import uvicorn.protocols.http.auto \
    --hidden-import uvicorn.protocols.websockets \
    --hidden-import uvicorn.protocols.websockets.auto \
    --hidden-import uvicorn.protocols.websockets.websockets_impl \
    --hidden-import uvicorn.lifespan \
    --hidden-import uvicorn.lifespan.on \
    --hidden-import starlette.routing \
    --hidden-import starlette.websockets \
    --hidden-import anyio \
    --hidden-import "anyio._backends._asyncio" \
    --hidden-import websockets.legacy \
    --hidden-import websockets.legacy.server \
    --hidden-import anthropic \
    --hidden-import pyautogui \
    --hidden-import mss \
    --hidden-import "PIL._imaging" \
    --hidden-import pyperclip \
    --noconfirm \
    "$SCRIPT_DIR/server.py"

echo "[agent] Build complete: desktop/assets/bin/doppel-agent"
