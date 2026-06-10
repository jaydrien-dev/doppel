const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voiceCallAPI", {
  close:       () => ipcRenderer.send("voicecall-close"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  getCallData: () => ipcRenderer.invoke("get-voicecall-data"),
});
