const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quickAskAPI", {
  close:        ()  => ipcRenderer.send("quickask-close"),
  getSettings:  ()  => ipcRenderer.invoke("get-settings"),
  getActiveApp: ()  => ipcRenderer.invoke("get-active-app"),
});
