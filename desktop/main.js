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
  Notification,
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

let win           = null;
let pillWin       = null;
let responseWin   = null;
let quickAskWin   = null;
let debateWin     = null;
let voiceCallWin  = null;
let tray          = null;
let isOverlay     = false;

// Pending voice call data (set before window is created so renderer can invoke it)
let _pendingVoiceCallData = null;

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

// ─── Quick Ask Window ─────────────────────────────────────────────────────────

const QUICKASK_W = 360;
const QUICKASK_H = 480;

function createQuickAskWindow(cloneInfo = {}) {
  if (quickAskWin && !quickAskWin.isDestroyed()) {
    quickAskWin.focus();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const params = new URLSearchParams();
  if (cloneInfo.cloneId)     params.set("clone_id",     cloneInfo.cloneId);
  if (cloneInfo.cloneName)   params.set("clone_name",   cloneInfo.cloneName);
  if (cloneInfo.cloneHandle) params.set("clone_handle", cloneInfo.cloneHandle);
  const qs = params.toString() ? `?${params}` : "";

  const quickAskURL = IS_DEV
    ? `http://localhost:5173/quickask.html${qs}`
    : `file://${path.join(__dirname, "dist/renderer/quickask.html")}${qs}`;

  quickAskWin = new BrowserWindow({
    width:       QUICKASK_W,
    height:      QUICKASK_H,
    x:           Math.round((width  - QUICKASK_W) / 2),
    y:           Math.round((height - QUICKASK_H) / 2.2),
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    resizable:   false,
    movable:     true,
    hasShadow:   false,
    skipTaskbar: true,
    show:        false,
    webPreferences: {
      preload:          path.join(__dirname, "preload.quickask.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  quickAskWin.setAlwaysOnTop(true, "floating");
  quickAskWin.loadURL(quickAskURL);
  quickAskWin.once("ready-to-show", () => {
    quickAskWin.show();
    quickAskWin.focus();
  });

  // Close when focus is lost (click outside)
  quickAskWin.on("blur", () => {
    if (quickAskWin && !quickAskWin.isDestroyed()) {
      quickAskWin.destroy();
      quickAskWin = null;
    }
  });

  quickAskWin.on("closed", () => { quickAskWin = null; });
}

// ─── Debate Window ────────────────────────────────────────────────────────────

const DEBATE_W = 520;
const DEBATE_H = 560;

function createDebateWindow() {
  if (debateWin && !debateWin.isDestroyed()) {
    debateWin.focus();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const debateURL = IS_DEV
    ? "http://localhost:5173/debate.html"
    : `file://${path.join(__dirname, "dist/renderer/debate.html")}`;

  debateWin = new BrowserWindow({
    width:       DEBATE_W,
    height:      DEBATE_H,
    x:           Math.round((width  - DEBATE_W) / 2),
    y:           Math.round((height - DEBATE_H) / 2.2),
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    resizable:   false,
    movable:     true,
    hasShadow:   false,
    skipTaskbar: true,
    show:        false,
    webPreferences: {
      preload:          path.join(__dirname, "preload.debate.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  debateWin.setAlwaysOnTop(true, "floating");
  debateWin.loadURL(debateURL);
  debateWin.once("ready-to-show", () => { debateWin.show(); debateWin.focus(); });
  debateWin.on("blur", () => {/* keep open — user is selecting clones etc. */});
  debateWin.on("closed", () => { debateWin = null; });
}

// ─── Voice Call Window ────────────────────────────────────────────────────────

const VOICECALL_W = 320;
const VOICECALL_H = 400;

function createVoiceCallWindow() {
  if (voiceCallWin && !voiceCallWin.isDestroyed()) {
    voiceCallWin.focus();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const voiceCallURL = IS_DEV
    ? "http://localhost:5173/voicecall.html"
    : `file://${path.join(__dirname, "dist/renderer/voicecall.html")}`;

  voiceCallWin = new BrowserWindow({
    width:       VOICECALL_W,
    height:      VOICECALL_H,
    x:           Math.round((width  - VOICECALL_W) / 2),
    y:           Math.round((height - VOICECALL_H) / 2.5),
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    resizable:   false,
    movable:     true,
    hasShadow:   false,
    skipTaskbar: false,
    show:        false,
    webPreferences: {
      preload:          path.join(__dirname, "preload.voicecall.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  voiceCallWin.setAlwaysOnTop(true, "pop-up-menu");
  voiceCallWin.loadURL(voiceCallURL);
  voiceCallWin.once("ready-to-show", () => { voiceCallWin.show(); voiceCallWin.focus(); });
  voiceCallWin.on("closed", () => { voiceCallWin = null; _pendingVoiceCallData = null; });
}

// ─── Proactive Nudges (Feature 1) ─────────────────────────────────────────────

let _nudgeInterval = null;

function makeUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function refreshNudgeLoop() {
  if (_nudgeInterval) { clearInterval(_nudgeInterval); _nudgeInterval = null; }
  if (!_settings.proactiveEnabled || !_settings.proactiveCloneId) return;
  const ms = Math.max(1, (_settings.proactiveIntervalMinutes ?? 30)) * 60 * 1000;
  _nudgeInterval = setInterval(sendProactiveNudge, ms);
  console.log(`[nudge] loop started — every ${_settings.proactiveIntervalMinutes ?? 30}min`);
}

async function sendProactiveNudge() {
  const { proactiveCloneId, proactiveCloneName, proactiveCloneHandle } = _settings;
  const apiUrl = _settings.fastapiUrl ?? "http://localhost:8000";
  const userId = _settings.userId ?? "";
  if (!proactiveCloneId) return;

  try {
    const headers = { "Content-Type": "application/json" };
    if (userId) headers["X-User-Id"] = userId;

    const res = await fetch(`${apiUrl}/brain/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        clone_id:      proactiveCloneId,
        session_id:    makeUUID(),
        message:       "You are proactively reaching out to advise the user. Send one brief, valuable insight or nudge right now. Under 2 sentences. Be direct.",
        context_type:  "chat",
        response_mode: "fast",
        owner_mode:    false,
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    const text = data.response ?? data.message ?? "";
    if (!text) return;

    const notif = new Notification({
      title: proactiveCloneName ?? "doppel",
      body:  text.slice(0, 200),
      icon:  path.join(__dirname, "assets", "icon.png"),
    });
    notif.on("click", () => createQuickAskWindow({
      cloneId:     proactiveCloneId,
      cloneName:   proactiveCloneName,
      cloneHandle: proactiveCloneHandle,
    }));
    notif.show();
    console.log("[nudge] sent:", text.slice(0, 60));
  } catch (e) {
    console.error("[nudge] failed:", e.message);
  }
}

// ─── Voice Call Scheduler (Feature 5) ────────────────────────────────────────

let _voiceCallTimer     = null;
let _lastVoiceCallDate  = null;

const VC_PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function cloneColor(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return VC_PALETTE[h % VC_PALETTE.length];
}

function refreshVoiceScheduler() {
  if (_voiceCallTimer) { clearInterval(_voiceCallTimer); _voiceCallTimer = null; }
  if (!_settings.voiceCallEnabled || !_settings.voiceCallCloneId || !_settings.voiceCallTime) return;
  _voiceCallTimer = setInterval(checkVoiceCallTime, 60 * 1000);
  console.log(`[voicecall] scheduler started — daily at ${_settings.voiceCallTime}`);
}

function checkVoiceCallTime() {
  const now   = new Date();
  const hhmm  = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  if (hhmm !== _settings.voiceCallTime) return;
  const today = now.toDateString();
  if (_lastVoiceCallDate === today) return;      // already called today
  _lastVoiceCallDate = today;
  triggerVoiceCall();
}

async function triggerVoiceCall() {
  const { voiceCallCloneId, voiceCallCloneName, voiceCallCloneHandle } = _settings;
  const apiUrl = _settings.fastapiUrl ?? "http://localhost:8000";
  const userId = _settings.userId ?? "";
  if (!voiceCallCloneId) return;

  try {
    const headers = { "Content-Type": "application/json" };
    if (userId) headers["X-User-Id"] = userId;

    const res = await fetch(`${apiUrl}/brain/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        clone_id:      voiceCallCloneId,
        session_id:    makeUUID(),
        message:       "You're calling the user for a daily check-in. Give them a warm, personal message: a reflection, insight, or question to carry through their day. 2-3 sentences max.",
        context_type:  "chat",
        response_mode: "pro",
        owner_mode:    false,
      }),
    });

    if (!res.ok) return;
    const data    = await res.json();
    const message = data.response ?? data.message ?? "";
    if (!message) return;

    _pendingVoiceCallData = {
      cloneName:   voiceCallCloneName ?? "Your Clone",
      cloneHandle: voiceCallCloneHandle ?? "",
      cloneColor:  cloneColor(voiceCallCloneName),
      message,
    };
    createVoiceCallWindow();
    console.log("[voicecall] triggered for", voiceCallCloneName);
  } catch (e) {
    console.error("[voicecall] failed:", e.message);
  }
}

// ─── Quick Access Hotkeys (feature 6) ────────────────────────────────────────

const QUICK_ACCESS_HOTKEYS = ["CommandOrControl+Alt+1", "CommandOrControl+Alt+2", "CommandOrControl+Alt+3"];

function refreshQuickAccessHotkeys() {
  // Unregister all slots first
  QUICK_ACCESS_HOTKEYS.forEach(hk => { try { globalShortcut.unregister(hk); } catch {} });

  const slots = _settings.quickAccess ?? [];
  slots.forEach((slot, i) => {
    if (!slot?.cloneId) return;
    const hotkey = QUICK_ACCESS_HOTKEYS[i];
    if (!hotkey) return;
    try {
      globalShortcut.register(hotkey, () => createQuickAskWindow({
        cloneId:     slot.cloneId,
        cloneName:   slot.cloneName,
        cloneHandle: slot.cloneHandle,
      }));
    } catch (e) {
      console.warn(`[main] could not register ${hotkey}:`, e.message);
    }
  });
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
ipcMain.on("save-settings", (_, data) => {
  persistSettings(data);
  refreshQuickAccessHotkeys();
  refreshNudgeLoop();
  refreshVoiceScheduler();
});

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

// Quick Ask: close
ipcMain.on("quickask-close", () => {
  if (quickAskWin && !quickAskWin.isDestroyed()) {
    quickAskWin.destroy();
    quickAskWin = null;
  }
});

// Debate: close
ipcMain.on("debate-close", () => {
  if (debateWin && !debateWin.isDestroyed()) {
    debateWin.destroy();
    debateWin = null;
  }
});

// Voice Call: close + data fetch
ipcMain.on("voicecall-close", () => {
  if (voiceCallWin && !voiceCallWin.isDestroyed()) {
    voiceCallWin.destroy();
    voiceCallWin = null;
  }
  _pendingVoiceCallData = null;
});

ipcMain.handle("get-voicecall-data", () => _pendingVoiceCallData);

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
    { label: "Show",       click: () => { win?.show(); win?.focus(); } },
    { label: "Quick Ask",  accelerator: "CommandOrControl+Alt+Space", click: () => createQuickAskWindow() },
    { label: "Debate",     click: () => createDebateWindow() },
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
  refreshQuickAccessHotkeys();
  refreshNudgeLoop();
  refreshVoiceScheduler();

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (pillWin && !pillWin.isDestroyed()) {
      pillWin.isVisible() ? pillWin.hide() : (pillWin.show(), pillWin.focus());
    } else {
      win?.isVisible() && win.isFocused() ? win.hide() : (win?.show(), win?.focus());
    }
  });

  // Quick Ask: Ctrl+Alt+Space (Win) / Cmd+Alt+Space (Mac)
  globalShortcut.register("CommandOrControl+Alt+Space", () => {
    if (quickAskWin && !quickAskWin.isDestroyed()) {
      quickAskWin.destroy();
      quickAskWin = null;
    } else {
      createQuickAskWindow();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else win?.show();
  });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => globalShortcut.unregisterAll());
