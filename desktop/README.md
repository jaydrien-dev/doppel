# doppel desktop

Electron wrapper around the doppel web app. Same UI, same auth, same everything — plus system tray, global hotkey, and an overlay mode that floats the clone over other windows.

## Setup

```bash
cd desktop
npm install
```

Add icon files to `assets/`:
- `icon.png` — 512×512 PNG (used by Linux + tray fallback)
- `icon.icns` — macOS (generate from PNG: `iconutil` or `electron-icon-maker`)
- `icon.ico` — Windows (generate from PNG: `png2ico` or online converter)

Set the app URL:

```bash
# .env in desktop/ or just set the env var:
DOPPEL_URL=https://your-deployed-url.vercel.app
```

## Dev

```bash
# Run against local Next.js dev server (default: http://localhost:3000)
npm start

# Or point at production:
DOPPEL_URL=https://your-app.vercel.app npm start
```

## Build

```bash
npm run build:win    # Windows .exe installer → release/
npm run build:mac    # macOS .dmg → release/
npm run build        # Both
```

## Hotkey

`Ctrl+Shift+Space` (Windows) / `Cmd+Shift+Space` (Mac) — toggle overlay mode from anywhere.

## Overlay mode

Compact 400×680px window, always-on-top, bottom-right of screen. The clone's chat is always accessible while working in other apps. Trigger from:
- The keyboard shortcut above
- System tray right-click → Overlay Mode
- The Overlay button in the chat composer bar (only visible in the desktop app)
