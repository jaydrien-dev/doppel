const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  screen,
  nativeImage,
  desktopCapturer,
  clipboard,
  shell,
} = require("electron");
const path = require("path");
const fs   = require("fs");
const { exec } = require("child_process");

// Allow getUserMedia without a browser-level permission dialog.
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");

const ALLOWED_PERMS = ["microphone", "media", "display-capture", "screen", "camera"];

const IS_DEV = process.env.NODE_ENV !== "production";

// ─── Persistent Settings ───────────────────────────────────────────────────────

let _settings = {};
let _settingsPath = "";   // populated after app is ready

function loadSettings() {
  try {
    _settingsPath = path.join(app.getPath("userData"), "settings.json");
    _settings = JSON.parse(fs.readFileSync(_settingsPath, "utf8"));
  } catch { _settings = {}; }
}

function persistSettings(data) {
  Object.assign(_settings, data);
  try { fs.writeFileSync(_settingsPath, JSON.stringify(_settings, null, 2)); } catch {}
}
const RENDERER_URL = IS_DEV
  ? "http://localhost:5173"
  : `file://${path.join(__dirname, "dist/renderer/index.html")}`;

let win         = null;
let pillWin     = null;
let responseWin = null;
let tray        = null;
let isOverlay   = false;

const NORMAL_SIZE    = { width: 1160, height: 820 };
const PILL_WIDTH     = 300;
const PILL_COMPACT_H = 64;

// ─── Main Window ─────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    ...NORMAL_SIZE,
    minWidth: 760,
    minHeight: 560,
    frame:       false,
    transparent: true,
    backgroundColor: "#00000000",
    titleBarStyle: "hidden",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Grant microphone + display-capture permission without prompting
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMS.includes(permission));
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMS.includes(permission);
  });

  win.loadURL(RENDERER_URL);
  win.once("ready-to-show", () => win.show());

  if (IS_DEV) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  // Hide to tray on close
  win.on("close", (e) => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });
}

// ─── Pill Window ──────────────────────────────────────────────────────────────

function createPillWindow(cloneInfo = {}) {
  if (pillWin && !pillWin.isDestroyed()) {
    pillWin.destroy();
    pillWin = null;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const params = new URLSearchParams({
    id:     cloneInfo.id        ?? "",
    name:   cloneInfo.name      ?? "",
    handle: cloneInfo.handle    ?? "",
    avatar: cloneInfo.avatar_url ?? "",
  });

  const pillURL = IS_DEV
    ? `http://localhost:5173/pill.html?${params}`
    : `file://${path.join(__dirname, "dist/renderer/pill.html")}?${params}`;

  pillWin = new BrowserWindow({
    width:       PILL_WIDTH,
    height:      PILL_COMPACT_H,
    x:           width  - PILL_WIDTH - 24,
    y:           height - PILL_COMPACT_H - 24,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    resizable:   false,
    movable:     true,
    hasShadow:   false,
    skipTaskbar: true,
    webPreferences: {
      preload:          path.join(__dirname, "preload.pill.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  pillWin.setAlwaysOnTop(true, "floating");

  pillWin.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMS.includes(permission));
  });
  pillWin.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMS.includes(permission);
  });

  pillWin.loadURL(pillURL);

  // Forward renderer console to terminal
  startClipboardPoll();
  pillWin.webContents.on("console-message", (_e, level, msg) => {
    const prefix = ["", "warn", "error", "debug"][level] || "";
    console.log(`[pill${prefix ? ":"+prefix : ""}] ${msg}`);
  });

  if (IS_DEV) {
    pillWin.webContents.openDevTools({ mode: "detach" });
  }

  pillWin.on("closed", () => { pillWin = null; stopClipboardPoll(); });
}

// ─── Response Overlay Window ─────────────────────────────────────────────────

const RESPONSE_WIDTH = 380;
const RESPONSE_HEIGHT = 200;

function createResponseWindow(cloneInfo = {}) {
  if (responseWin && !responseWin.isDestroyed()) {
    responseWin.destroy();
    responseWin = null;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const params = new URLSearchParams({
    name: cloneInfo.name ?? "",
  });

  // Position just above the pill (pill is bottom-right, response floats above it)
  const rx = width  - RESPONSE_WIDTH - 16;
  const ry = height - PILL_COMPACT_H - 24 - RESPONSE_HEIGHT - 8;

  const responseURL = IS_DEV
    ? `http://localhost:5173/response.html?${params}`
    : `file://${path.join(__dirname, "dist/renderer/response.html")}?${params}`;

  responseWin = new BrowserWindow({
    width:       RESPONSE_WIDTH,
    height:      RESPONSE_HEIGHT,
    x:           rx,
    y:           ry,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    resizable:   false,
    movable:     false,
    hasShadow:   false,
    skipTaskbar: true,
    focusable:   false,
    webPreferences: {
      preload:          path.join(__dirname, "preload.response.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  responseWin.setAlwaysOnTop(true, "floating");
  responseWin.setIgnoreMouseEvents(true);
  responseWin.loadURL(responseURL);
  responseWin.on("closed", () => { responseWin = null; });
}

function destroyResponseWindow() {
  if (responseWin && !responseWin.isDestroyed()) {
    responseWin.destroy();
    responseWin = null;
  }
}

// ─── Clipboard Polling ────────────────────────────────────────────────────────

let _lastClipboard     = "";
let _clipboardInterval = null;

function startClipboardPoll() {
  if (_clipboardInterval) return;
  _clipboardInterval = setInterval(() => {
    if (!pillWin || pillWin.isDestroyed()) return;
    const text = clipboard.readText();
    if (text && text !== _lastClipboard && text.length < 5000) {
      _lastClipboard = text;
      pillWin.webContents.send("clipboard-changed", text);
    }
  }, 500);
}

function stopClipboardPoll() {
  if (_clipboardInterval) {
    clearInterval(_clipboardInterval);
    _clipboardInterval = null;
  }
}

// ─── Active Window ────────────────────────────────────────────────────────────

function getActiveApp(callback) {
  if (process.platform === "win32") {
    exec(
      'powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne \\"\\"} | Sort-Object CPU -Descending | Select-Object -First 1 | ForEach-Object {\\"$($_.ProcessName)|$($_.MainWindowTitle)\\"}"',
      { timeout: 2000 },
      (err, stdout) => {
        if (err || !stdout.trim()) { callback(null); return; }
        const [appName, ...rest] = stdout.trim().split("|");
        callback({ appName: appName.trim(), windowTitle: rest.join("|").trim() });
      }
    );
  } else if (process.platform === "darwin") {
    exec(
      "osascript -e 'tell application \"System Events\" to get name of first application process whose frontmost is true'",
      { timeout: 2000 },
      (err, stdout) => {
        if (err) { callback(null); return; }
        callback({ appName: stdout.trim(), windowTitle: "" });
      }
    );
  } else {
    callback(null);
  }
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.on("win-minimize", () => win?.minimize());
ipcMain.on("win-close",    () => { win?.hide(); });

// Settings
ipcMain.handle("get-settings",  ()        => _settings);
ipcMain.on("save-settings", (_, data) => persistSettings(data));

// Open external URL in default browser
ipcMain.on("open-external", (_, url) => shell.openExternal(url));

// Active window query
ipcMain.handle("get-active-app", () =>
  new Promise((resolve) => getActiveApp((info) => resolve(info)))
);

// Screen capture: return source ID so the renderer can use getUserMedia
// (thumbnail approach gives black images on Windows with transparent windows)
ipcMain.handle("get-screen-source-id", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 },   // minimal — we only need the ID
    });
    console.log("[main] screen sources:", sources.map(s => s.name));
    const primary = sources.find(s =>
      s.name === "Entire Screen" || s.name === "Screen 1" ||
      s.name === "Screen" || s.name.startsWith("Display") || s.name.startsWith("Screen")
    ) ?? sources[0];
    if (!primary) { console.warn("[main] no screen source found"); return null; }
    console.log("[main] using source:", primary.name);
    return primary.id;
  } catch (e) {
    console.error("[main] get-screen-source-id failed:", e.message);
    return null;
  }
});

// Pill: open from main window
ipcMain.on("open-pill", (_, cloneInfo) => {
  createPillWindow(cloneInfo);
  createResponseWindow(cloneInfo);
  win?.hide();
  isOverlay = true;
  updateTrayMenu();
});

// Pill: resize (renderer calls when state changes)
ipcMain.on("pill-resize", (_, newHeight) => {
  if (!pillWin || pillWin.isDestroyed()) return;
  const [x, y] = pillWin.getPosition();
  const [w, oldH] = pillWin.getSize();
  // Anchor bottom edge — grow upward
  const dy = newHeight - oldH;
  pillWin.setBounds({ x, y: y - dy, width: w, height: newHeight }, false);
});

// Response overlay: show text
ipcMain.on("show-response", (_, text) => {
  if (responseWin && !responseWin.isDestroyed()) {
    responseWin.webContents.send("response-text", text);
  }
});

// Response overlay: hide
ipcMain.on("hide-response", () => {
  if (responseWin && !responseWin.isDestroyed()) {
    responseWin.webContents.send("response-hide");
  }
});

// Pill: exit → restore main window
ipcMain.on("pill-exit", () => {
  if (pillWin && !pillWin.isDestroyed()) { pillWin.destroy(); pillWin = null; }
  destroyResponseWindow();
  isOverlay = false;
  win?.show();
  win?.focus();
  win?.webContents.send("overlay-changed", false);
  updateTrayMenu();
});

// Pill: open full app
ipcMain.on("pill-open-full", () => {
  if (pillWin && !pillWin.isDestroyed()) { pillWin.destroy(); pillWin = null; }
  destroyResponseWindow();
  isOverlay = false;
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.focus();
    win.setAlwaysOnTop(false);
    win.setResizable(true);
    win.setOpacity(1);
    win.setSize(NORMAL_SIZE.width, NORMAL_SIZE.height, true);
    win.center();
    win.webContents.send("overlay-changed", false);
  }
  updateTrayMenu();
});

// ─── Tray ─────────────────────────────────────────────────────────────────────

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show",         click: () => { win?.show(); win?.focus(); } },
    { label: "Overlay Pill", type: "checkbox", checked: !!(pillWin && !pillWin.isDestroyed()),
      click: (item) => {
        if (item.checked) {
          createPillWindow({});
          win?.hide();
        } else {
          if (pillWin && !pillWin.isDestroyed()) { pillWin.destroy(); pillWin = null; }
          win?.show();
        }
      }
    },
    { type: "separator" },
    { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function buildTray() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  let img;
  try {
    img = nativeImage.createFromPath(iconPath);
    if (process.platform === "darwin") img = img.resize({ width: 16, height: 16 });
  } catch {
    img = nativeImage.createEmpty();
  }

  tray = new Tray(img);
  tray.setToolTip("doppel");
  updateTrayMenu();

  tray.on("click", () => {
    if (pillWin && !pillWin.isDestroyed()) {
      pillWin.isVisible() ? pillWin.hide() : pillWin.show();
    } else if (win) {
      win.isVisible() && win.isFocused() ? win.hide() : (win.show(), win.focus());
    }
  });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  buildTray();

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (pillWin && !pillWin.isDestroyed()) {
      pillWin.isVisible() ? pillWin.hide() : (pillWin.show(), pillWin.focus());
    } else {
      win?.isVisible() && win.isFocused() ? win.hide() : (win?.show(), win?.focus());
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else win?.show();
  });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => globalShortcut.unregisterAll());
