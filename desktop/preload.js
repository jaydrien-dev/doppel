const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron:      true,
  openPill:        (cloneInfo) => ipcRenderer.send("open-pill", cloneInfo),
  minimize:        ()          => ipcRenderer.send("win-minimize"),
  close:           ()          => ipcRenderer.send("win-close"),
  toggleFullscreen:()          => ipcRenderer.send("win-fullscreen"),
  getSettings:     ()          => ipcRenderer.invoke("get-settings"),
  saveSettings:    (data)      => ipcRenderer.send("save-settings", data),
  openExternal:    (url)       => ipcRenderer.send("open-external", url),
  getScreenSourceId: ()        => ipcRenderer.invoke("get-screen-source-id"),
  onOverlayChanged: (cb) => {
    ipcRenderer.on("overlay-changed", (_, val) => cb(val));
    return () => ipcRenderer.removeAllListeners("overlay-changed");
  },
  onFullscreenChanged: (cb) => {
    ipcRenderer.on("fullscreen-changed", (_, val) => cb(val));
    return () => ipcRenderer.removeAllListeners("fullscreen-changed");
  },
  getAgentSidecarUrl: () => ipcRenderer.invoke("get-agent-sidecar-url"),
  onAgentReady: (cb) => {
    ipcRenderer.on("agent-ready", (_, url) => cb(url));
    return () => ipcRenderer.removeAllListeners("agent-ready");
  },
});
