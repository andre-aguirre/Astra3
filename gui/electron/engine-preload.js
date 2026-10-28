// ============================================================
// Astra3: preload for the Astra3 Engine window (renderer/engine.html)
// ============================================================
// The window draws the scenes the Astra3 Engine hands over and returns
// each image; this is the whole of what it can ask the app for.
// ============================================================

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("astra3Engine", {
  onJob: (callback) => ipcRenderer.on("engine:job", (_event, payload) => callback(payload)),
  onStatus: (callback) => ipcRenderer.on("engine:status", (_event, status) => callback(status)),
  onShow: (callback) => ipcRenderer.on("engine:show", (_event, payload) => callback(payload)),
  onRun: (callback) => ipcRenderer.on("engine:run", (_event, payload) => callback(payload)),
  finish: (id, result) => ipcRenderer.send("engine:done", id, result),
  ready: () => ipcRenderer.send("engine:ready"),
  drag: (file) => ipcRenderer.send("engine:drag", file),
  save: (payload) => ipcRenderer.invoke("engine:save", payload),
});
