const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("responseAPI", {
  onText: (cb) => {
    ipcRenderer.on("response-text", (_, text) => cb(text));
    return () => ipcRenderer.removeAllListeners("response-text");
  },
  onHide: (cb) => {
    ipcRenderer.on("response-hide", () => cb());
    return () => ipcRenderer.removeAllListeners("response-hide");
  },
});
