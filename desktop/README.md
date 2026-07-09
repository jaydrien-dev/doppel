# doppel desktop

Electron wrapper for the doppel web app. Loads https://doppel-pi.vercel.app in a native window.

## What it adds over the web app

- System tray icon — doppel lives in your menu bar / taskbar
- Global hotkey `Ctrl+Shift+D` (Win/Linux) or `Cmd+Shift+D` (Mac) — show/hide from anywhere
- Native OS notifications — task completed, approval needed, automation fired
- Launch at startup option
- `doppel://` deep link protocol — OAuth callbacks route back into the app
- Window size/position memory across restarts
- Downloadable .exe installer (Windows) and .dmg (Mac)

## Setup

```bash
cd desktop
npm install
```

## Development

```bash
npm run dev
```

Opens the app pointed at https://doppel-pi.vercel.app. Hot-reloads the Electron main process on changes.

## Build installers

```bash
# Both platforms (run on the target OS)
npm run dist

# Windows only
npm run dist:win

# Mac only
npm run dist:mac
```

Output goes to `dist-installer/`.

## Icons (required before building)

Add these files to `resources/`:

| File | Size | Used for |
|---|---|---|
| `icon.png` | 512×512 | Linux |
| `icon.ico` | Multi-size | Windows |
| `icon.icns` | Multi-size | macOS |
| `tray-icon.png` | 22×22 (or 44×44 @2x) | Menu bar / tray |

For macOS, the tray icon is automatically treated as a template image (inverts for dark/light menu bar).

## Using desktop features in the web app

The preload script exposes `window.doppelDesktop` when running in Electron:

```ts
// Check if running in desktop app
if (window.doppelDesktop?.isDesktop) {
  // Send a native notification
  window.doppelDesktop.notify("Task complete", "Your clone finished the task.")

  // Toggle launch at startup
  await window.doppelDesktop.setLaunchAtStartup(true)
}
```

TypeScript types are in `ui/types/desktop.d.ts`.
