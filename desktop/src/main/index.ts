import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  shell,
  ipcMain,
  Notification,
  nativeTheme,
  net,
  session,
  screen,
  desktopCapturer,
} from "electron";
import { join } from "path";
import { createServer, type Server } from "http";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import Store from "electron-store";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROTOCOL = "doppel";
const CLERK_FAPI = "https://electric-moray-73.clerk.accounts.dev";
const HOTKEY = "CommandOrControl+Alt+D";

// ─── Store ────────────────────────────────────────────────────────────────────

interface StoreSchema {
  launchAtStartup: boolean;
  windowBounds: { width: number; height: number; x?: number; y?: number };
  screenwatchEnabled: boolean;
}

const store = new Store<StoreSchema>({
  defaults: {
    launchAtStartup: false,
    windowBounds: { width: 1440, height: 900 },
    screenwatchEnabled: false,
  },
});

// ─── State ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let screenwatchTimer: ReturnType<typeof setInterval> | null = null;
let screenwatchCloneId: string | null = null;
let lastScreenHash: string | null = null;

// ─── Single instance lock ─────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (deepLink) handleDeepLink(deepLink);
    showWindow();
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow(): void {
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 960,
    minHeight: 600,
    title: "doppel",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#080808",
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Disable webSecurity so file:// can call https:// APIs and Clerk can
      // reach its backend (electric-moray-73.clerk.accounts.dev) without CORS
      webSecurity: false,
      sandbox: false,
    },
    show: false,
  });

  // In dev mode electron-vite sets ELECTRON_RENDERER_URL to the vite dev server
  // (http://localhost:PORT) so Clerk can initialize — file:// is not a valid origin.
  // In production we fall back to the bundled file.
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    // Open DevTools automatically in dev so we can see console errors
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../../out/renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Allow Clerk OAuth popups (Google, GitHub, etc.) opened by Clerk JS
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("clerk.accounts.dev") || url.includes("clerk.com")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Allow navigation within the renderer (localhost dev, file://) and Clerk
  // auth domains (redirect-based sign-in). Block everything else.
  mainWindow.webContents.on("will-navigate", (_event, url) => {
    const isLocal = url.startsWith("file://") || url.includes("localhost");
    const isClerk = url.includes("clerk.accounts.dev") || url.includes("accounts.clerk.com");
    if (!isLocal && !isClerk) {
      _event.preventDefault();
      shell.openExternal(url);
    }
  });

  const saveBounds = () => {
    if (!mainWindow) return;
    store.set("windowBounds", mainWindow.getBounds());
  };
  mainWindow.on("resize", saveBounds);
  mainWindow.on("move", saveBounds);

  mainWindow.on("close", (e) => {
    if (!isQuitting && process.platform === "darwin") {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray(): void {
  const icon = getTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("doppel");
  rebuildTrayMenu();
  tray.on("click", () => {
    if (mainWindow?.isVisible() && mainWindow?.isFocused()) mainWindow.hide();
    else showWindow();
  });
  nativeTheme.on("updated", rebuildTrayMenu);
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  const launchAtStartup = store.get("launchAtStartup");
  const menu = Menu.buildFromTemplate([
    { label: "Open doppel", click: () => showWindow() },
    { type: "separator" },
    {
      label: "Launch at startup",
      type: "checkbox",
      checked: launchAtStartup,
      click: () => {
        const next = !store.get("launchAtStartup");
        store.set("launchAtStartup", next);
        app.setLoginItemSettings({ openAtLogin: next, openAsHidden: true });
        rebuildTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Quit doppel",
      accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);
  tray.setContextMenu(menu);
}

// ─── Quick Capture Window ─────────────────────────────────────────────────────

function openCaptureWindow(): void {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.focus();
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;

  captureWindow = new BrowserWindow({
    width: 480,
    height: 180,
    x: x + Math.round((width - 480) / 2),
    y: y + Math.round(height * 0.25),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      sandbox: false,
    },
    show: false,
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    captureWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#capture`);
  } else {
    captureWindow.loadFile(join(__dirname, "../../out/renderer/index.html"), { hash: "capture" });
  }

  captureWindow.once("ready-to-show", () => captureWindow?.show());
  captureWindow.on("closed", () => { captureWindow = null; });
}

function closeCaptureWindow(): void {
  if (captureWindow && !captureWindow.isDestroyed()) captureWindow.close();
  captureWindow = null;
}

// ─── Hotkey ───────────────────────────────────────────────────────────────────

function registerHotkey(): void {
  // Quick capture hotkey — opens tiny floating capture window
  const ok = globalShortcut.register(HOTKEY, () => {
    openCaptureWindow();
  });
  if (!ok) console.warn(`[doppel] Could not register hotkey ${HOTKEY}`);

  // Voice memo hotkey — toggles recording in the renderer
  const voiceOk = globalShortcut.register("CommandOrControl+Shift+V", () => {
    if (mainWindow) {
      showWindow();
      mainWindow.webContents.send("doppel:voice-hotkey");
    }
  });
  if (!voiceOk) console.warn("[doppel] Could not register voice memo hotkey");
}

// ─── Deep link ────────────────────────────────────────────────────────────────

function handleDeepLink(url: string): void {
  console.log("[doppel] deep link:", url);
  showWindow();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showWindow(): void {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function getAppIcon(): string | undefined {
  try {
    if (process.platform === "win32") return join(__dirname, "../../resources/icon.ico");
    if (process.platform === "darwin") return join(__dirname, "../../resources/icon.icns");
    return join(__dirname, "../../resources/icon.png");
  } catch { return undefined; }
}

function getTrayIcon(): Electron.NativeImage {
  try {
    const img = nativeImage.createFromPath(join(__dirname, "../../resources/tray-icon.png"));
    if (process.platform === "darwin") img.setTemplateImage(true);
    return img;
  } catch { return nativeImage.createEmpty(); }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.on("doppel:notify", (_event, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: getAppIcon() ?? undefined }).show();
  }
});
ipcMain.handle("doppel:platform", () => process.platform);
ipcMain.handle("doppel:set-launch-at-startup", (_event, enabled: boolean) => {
  store.set("launchAtStartup", enabled);
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
});
ipcMain.handle("doppel:get-launch-at-startup", () => store.get("launchAtStartup"));

// ─── Quick Capture IPC ───────────────────────────────────────────────────────

ipcMain.handle(
  "doppel:capture-submit",
  async (_event, { cloneId, text }: { cloneId: string; text: string }) => {
    try {
      const auth = await getClerkAuth();
      if (!auth) return { ok: false, error: "Not signed in" };

      const res = await net.fetch("https://doppel.up.railway.app/ingestion/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": auth.userId,
        },
        body: JSON.stringify({ clone_id: cloneId, text, source: "quick_capture" }),
      });
      const data = await res.json();
      return { ok: res.ok, ...data };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
);

ipcMain.handle("doppel:capture-close", () => {
  closeCaptureWindow();
  return { ok: true };
});

ipcMain.handle("doppel:capture-get-clone", async () => {
  // Return the user's first clone id so the capture window can ingest
  try {
    const auth = await getClerkAuth();
    if (!auth) return null;
    const res = await net.fetch("https://doppel.up.railway.app/clones", {
      headers: { "X-User-Id": auth.userId },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const clones = Array.isArray(data) ? data : data.clones ?? [];
    return clones.length > 0 ? { clone_id: clones[0].clone_id, display_name: clones[0].display_name } : null;
  } catch {
    return null;
  }
});

// ─── Screenwatch ─────────────────────────────────────────────────────────────
// Fixed 5-second capture interval. Only sends to backend when the screen
// content actually changes (hash comparison) to minimize API costs.

const SCREENWATCH_INTERVAL_MS = 5_000;

ipcMain.handle(
  "doppel:screenwatch-start",
  async (_event, { cloneId }: { cloneId: string }) => {
    if (screenwatchTimer) clearInterval(screenwatchTimer);
    screenwatchCloneId = cloneId;
    lastScreenHash = null;
    store.set("screenwatchEnabled", true);

    const doCapture = async () => {
      if (!screenwatchCloneId) return;
      if (mainWindow?.isMinimized()) return;

      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 1920, height: 1080 },
        });
        if (sources.length === 0) {
          console.warn("[screenwatch] no screen sources available");
          return;
        }

        const pngBuffer = sources[0].thumbnail.toPNG();
        if (pngBuffer.length < 1000) {
          console.warn("[screenwatch] screenshot too small, skipping");
          return;
        }

        // Skip if screen hasn't changed (hash comparison)
        const hash = createHash("md5").update(pngBuffer).digest("hex");
        if (hash === lastScreenHash) return;
        lastScreenHash = hash;

        const auth = await getClerkAuth();
        if (!auth) {
          console.warn("[screenwatch] no auth, skipping capture");
          return;
        }

        const base64 = pngBuffer.toString("base64");
        const res = await net.fetch("https://doppel.up.railway.app/observation/screenwatch/capture", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": auth.userId,
          },
          body: JSON.stringify({ clone_id: screenwatchCloneId, image_base64: base64 }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("[screenwatch] backend error:", res.status, text);
        } else {
          console.log("[screenwatch] capture sent successfully");
        }
      } catch (e) {
        console.error("[screenwatch] capture failed:", e);
      }
    };

    screenwatchTimer = setInterval(doCapture, SCREENWATCH_INTERVAL_MS);
    // Delay first capture slightly to ensure backend source row is committed
    setTimeout(doCapture, 1500);
    return { ok: true };
  }
);

ipcMain.handle("doppel:screenwatch-stop", () => {
  if (screenwatchTimer) {
    clearInterval(screenwatchTimer);
    screenwatchTimer = null;
  }
  screenwatchCloneId = null;
  lastScreenHash = null;
  store.set("screenwatchEnabled", false);
  return { ok: true };
});

ipcMain.handle("doppel:screenwatch-status", () => ({
  enabled: store.get("screenwatchEnabled"),
  running: screenwatchTimer !== null,
}));

// ─── Voice Memos ─────────────────────────────────────────────────────────────

ipcMain.handle(
  "doppel:voice-upload",
  async (_event, { cloneId, audioBase64 }: { cloneId: string; audioBase64: string }) => {
    try {
      const auth = await getClerkAuth();
      if (!auth) return { ok: false, error: "Not signed in" };

      const boundary = `----DoppelVoice${Date.now()}`;
      const audioBuffer = Buffer.from(audioBase64, "base64");

      // Build multipart/form-data body
      const parts: Buffer[] = [];
      const enc = (s: string) => Buffer.from(s, "utf-8");

      // clone_id field
      parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="clone_id"\r\n\r\n${cloneId}\r\n`));
      // audio file field
      parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="memo.webm"\r\nContent-Type: audio/webm\r\n\r\n`));
      parts.push(audioBuffer);
      parts.push(enc(`\r\n--${boundary}--\r\n`));

      const body = Buffer.concat(parts);

      const res = await net.fetch("https://doppel.up.railway.app/ingestion/voice-memo", {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "X-User-Id": auth.userId,
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[voice-memo] backend error:", res.status, text);
        return { ok: false, error: `Backend error: ${res.status}` };
      }

      const data = await res.json();
      return { ok: true, ...data };
    } catch (e) {
      console.error("[voice-memo] upload failed:", e);
      return { ok: false, error: String(e) };
    }
  }
);

// ─── Clerk auth ──────────────────────────────────────────────────────────────

interface AuthInfo {
  userId: string;
  firstName: string;
  lastName: string;
}

/** Cached auth — set once on successful sign-in, used by IPC handlers. */
let cachedAuth: AuthInfo | null = null;

/** Check for an existing Clerk session via the Frontend API cookies. */
async function getClerkAuth(): Promise<AuthInfo | null> {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: CLERK_FAPI });
    if (!cookies.some((c) => c.name === "__client")) return cachedAuth;

    const res = await net.fetch(`${CLERK_FAPI}/v1/client`, {
      credentials: "include",
    });
    if (!res.ok) return cachedAuth;
    const data = (await res.json()) as {
      response?: { sessions?: Array<{
        status: string;
        user?: { id: string; first_name?: string; last_name?: string };
      }> };
    };
    const active = (data?.response?.sessions ?? []).find(
      (s) => s.status === "active"
    );
    if (!active?.user) return cachedAuth;
    cachedAuth = {
      userId: active.user.id,
      firstName: active.user.first_name ?? "",
      lastName: active.user.last_name ?? "",
    };
    return cachedAuth;
  } catch {
    return cachedAuth;
  }
}

/** Sign in via Clerk Frontend API with email + password.
 *  Sets the __client cookie in the default session on success. */
async function signInWithCredentials(
  email: string,
  password: string
): Promise<{ auth: AuthInfo | null; error?: string }> {
  try {
    const res = await net.fetch(`${CLERK_FAPI}/v1/client/sign_ins`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `identifier=${encodeURIComponent(email)}&strategy=password&password=${encodeURIComponent(password)}`,
      credentials: "include",
    });

    const data = (await res.json()) as {
      response?: {
        status?: string;
        created_session_id?: string;
      };
      errors?: Array<{ message?: string; long_message?: string; code?: string }>;
    };

    // API-level errors (wrong password, user not found, etc.)
    if (data.errors && data.errors.length > 0) {
      const msg = data.errors[0].long_message || data.errors[0].message || "Sign in failed.";
      return { auth: null, error: msg };
    }

    const status = data.response?.status;

    if (status === "needs_second_factor") {
      return { auth: null, error: "Two-factor authentication is not yet supported in the desktop app." };
    }

    if (status === "needs_first_factor") {
      return { auth: null, error: "Could not verify credentials. Please check your email and password." };
    }

    if (status === "complete") {
      // Cookie should now be set — read session info
      const auth = await getClerkAuth();
      if (auth) return { auth };
      return { auth: null, error: "Signed in but could not load session. Please try again." };
    }

    return { auth: null, error: `Unexpected sign-in status: ${status}` };
  } catch (e) {
    return { auth: null, error: "Could not reach the sign-in service. Check your internet connection." };
  }
}

/** Singleton guard — only one sign-in popup at a time. */
let signInPromise: Promise<AuthInfo | null> | null = null;

/** Tiny localhost server so Clerk JS gets an HTTP origin (needed for OAuth). */
function serveSignInPage(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const html = readFileSync(
      join(__dirname, "../../resources/signin.html"),
      "utf-8"
    );
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.listen(0, "localhost", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error("Could not start auth server"));
      }
    });
  });
}

/** Open the sign-in popup with the full Clerk sign-in UI (Google, email, etc.). */
function signInPopup(): Promise<AuthInfo | null> {
  if (signInPromise) return signInPromise;

  signInPromise = (async () => {
    const existing = await getClerkAuth();
    if (existing) return existing;

    // Serve from localhost so Clerk JS has an HTTP origin for OAuth
    const { server, port } = await serveSignInPage();

    return new Promise<AuthInfo | null>((resolve) => {
      const popup = new BrowserWindow({
        width: 480,
        height: 700,
        parent: mainWindow ?? undefined,
        modal: false,
        backgroundColor: "#080808",
        autoHideMenuBar: true,
        title: "Sign in to doppel",
        webPreferences: {
          preload: join(__dirname, "../preload/index.js"),
          contextIsolation: true,
          nodeIntegration: false,
          // webSecurity must be true (default) — Clerk FAPI requires
          // the browser to send the Origin header on API requests.
        },
      });

      popup.loadURL(`http://localhost:${port}`);

      let resolved = false;
      const finish = (auth: AuthInfo | null) => {
        if (resolved) return;
        resolved = true;
        signInPromise = null;
        server.close();
        if (auth) cachedAuth = auth; // Cache so IPC handlers can use it
        resolve(auth);
      };

      // Clerk JS encodes user info in the title when sign-in completes
      popup.webContents.on("page-title-updated", (_event, title) => {
        if (resolved || !title.startsWith("auth:")) return;
        try {
          const info = JSON.parse(title.slice(5)) as AuthInfo;
          if (info.userId) {
            popup.close();
            finish(info);
          }
        } catch { /* ignore parse errors */ }
      });

      popup.on("closed", () => {
        if (!resolved) finish(null);
      });

      // Allow OAuth popups (Google, GitHub, etc.) opened by Clerk
      popup.webContents.setWindowOpenHandler(({ url }) => {
        if (
          url.includes("clerk") ||
          url.includes("accounts.dev") ||
          url.includes("google.com") ||
          url.includes("googleapis.com") ||
          url.includes("github.com") ||
          url.includes("localhost")
        ) {
          return { action: "allow" };
        }
        shell.openExternal(url);
        return { action: "deny" };
      });
    });
  })();

  return signInPromise;
}

ipcMain.handle("doppel:get-auth", () => getClerkAuth());
ipcMain.handle("doppel:sign-in", () => signInPopup());

// Fallback: direct email+password sign-in via Clerk REST API
ipcMain.handle(
  "doppel:submit-credentials",
  async (_event, email: string, password: string) => {
    const result = await signInWithCredentials(email, password);
    if (result.auth) {
      cachedAuth = result.auth;
      return { auth: result.auth };
    }
    return { error: result.error ?? "Sign in failed." };
  }
);

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient(PROTOCOL);
  const launchAtStartup = store.get("launchAtStartup");
  app.setLoginItemSettings({ openAtLogin: launchAtStartup, openAsHidden: true });

  createWindow();
  createTray();
  registerHotkey();

  app.on("open-url", (_event, url) => handleDeepLink(url));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
  else showWindow();
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("before-quit", () => {
  isQuitting = true;
  if (screenwatchTimer) {
    clearInterval(screenwatchTimer);
    screenwatchTimer = null;
  }
});
