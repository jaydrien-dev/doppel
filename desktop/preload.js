const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron:      true,
  openPill:        (cloneInfo) => ipcRenderer.send("open-pill", cloneInfo),
  minimize:        ()          => ipcRenderer.send("win-minimize"),
  close:           ()          => ipcRenderer.send("win-close"),
  getSettings:     ()          => ipcRenderer.invoke("get-settings"),
  saveSettings:    (data)      => ipcRenderer.send("save-settings", data),
  openExternal:    (url)       => ipcRenderer.send("open-external", url),
  onOverlayChanged: (cb) => {
    ipcRenderer.on("overlay-changed", (_, val) => cb(val));
    return () => ipcRenderer.removeAllListeners("overlay-changed");
  },
});
