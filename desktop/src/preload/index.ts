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

  /** True when running inside the Electron desktop app */
  isDesktop: true,
});
