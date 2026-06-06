const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pillAPI", {
  resize:             (h)   => ipcRenderer.send("pill-resize", h),
  exit:               ()    => ipcRenderer.send("pill-exit"),
  openFull:           ()    => ipcRenderer.send("pill-open-full"),
  getSettings:        ()    => ipcRenderer.invoke("get-settings"),
  getActiveApp:       ()    => ipcRenderer.invoke("get-active-app"),
  onClipboardChange:  (cb)  => ipcRenderer.on("clipboard-changed", (_e, text) => cb(text)),
  offClipboardChange: (cb)  => ipcRenderer.removeListener("clipboard-changed", (_e, text) => cb(text)),
});

// Screen capture: returns the desktopCapturer source ID for getUserMedia
contextBridge.exposeInMainWorld("pillGetScreenSourceId", () => ipcRenderer.invoke("get-screen-source-id"));

// Response overlay
contextBridge.exposeInMainWorld("pillResponseAPI", {
  show: (text) => ipcRenderer.send("show-response", text),
  hide: ()     => ipcRenderer.send("hide-response"),
});
