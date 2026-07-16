import { contextBridge, ipcRenderer } from "electron";

/**
 * Exposes a safe `window.doppelDesktop` API to the renderer (your Next.js web app).
 * The web app can call these to use native desktop features.
 */
contextBridge.exposeInMainWorld("doppelDesktop", {
  /** Send a native OS notification */
  notify: (title: string, body: string) =>
    ipcRenderer.send("doppel:notify", { title, body }),

  /** Get the current OS platform */
  platform: () => ipcRenderer.invoke("doppel:platform"),

  /** Read launch-at-startup setting */
  getLaunchAtStartup: () => ipcRenderer.invoke("doppel:get-launch-at-startup"),

  /** Set launch-at-startup preference */
  setLaunchAtStartup: (enabled: boolean) =>
    ipcRenderer.invoke("doppel:set-launch-at-startup", enabled),

  /** Check for an existing Clerk session (returns user info or null) */
  getAuth: (): Promise<{ userId: string; firstName: string; lastName: string } | null> =>
    ipcRenderer.invoke("doppel:get-auth"),

  /** Open the sign-in popup; resolves with user info once done (or null if dismissed) */
  signIn: (): Promise<{ userId: string; firstName: string; lastName: string } | null> =>
    ipcRenderer.invoke("doppel:sign-in"),

  /** Submit email + password to Clerk (called from sign-in popup form) */
  submitCredentials: (email: string, password: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke("doppel:submit-credentials", email, password),

  /** Start screenwatch (5-second interval, change-detection built in) */
  startScreenwatch: (cloneId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("doppel:screenwatch-start", { cloneId }),

  /** Stop screenwatch captures */
  stopScreenwatch: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("doppel:screenwatch-stop"),

  /** Get current screenwatch status */
  screenwatchStatus: (): Promise<{ enabled: boolean; running: boolean }> =>
    ipcRenderer.invoke("doppel:screenwatch-status"),

  /** Upload a voice memo (base64 audio) for transcription + ingestion */
  uploadVoiceMemo: (cloneId: string, audioBase64: string): Promise<{ ok: boolean; transcript?: string; error?: string }> =>
    ipcRenderer.invoke("doppel:voice-upload", { cloneId, audioBase64 }),

  /** Listen for the global voice-memo hotkey (Ctrl+Shift+V) */
  onVoiceHotkey: (callback: () => void) => {
    ipcRenderer.on("doppel:voice-hotkey", callback);
    return () => { ipcRenderer.removeListener("doppel:voice-hotkey", callback); };
  },

  /** Quick capture — submit text from floating capture window */
  captureSubmit: (cloneId: string, text: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("doppel:capture-submit", { cloneId, text }),

  /** Quick capture — close the floating capture window */
  captureClose: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("doppel:capture-close"),

  /** Quick capture — get the user's default clone for ingestion */
  captureGetClone: (): Promise<{ clone_id: string; display_name: string } | null> =>
    ipcRenderer.invoke("doppel:capture-get-clone"),

  /** True when running inside the Electron desktop app */
  isDesktop: true,
});
