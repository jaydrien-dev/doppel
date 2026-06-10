const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("debateAPI", {
  close:       () => ipcRenderer.send("debate-close"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
});
