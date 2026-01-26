"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  ping: () => "pong",
  getSettings: () => electron.ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => electron.ipcRenderer.invoke("settings:update", patch),
  getHistory: () => electron.ipcRenderer.invoke("history:list"),
  clearHistory: () => electron.ipcRenderer.invoke("history:clear"),
  pinLast: () => electron.ipcRenderer.invoke("pin:last")
});
electron.contextBridge.exposeInMainWorld("captureApi", {
  onSetBackground: (handler) => {
    electron.ipcRenderer.on("capture:set-background", (_event, payload) => {
      handler(payload);
    });
  },
  saveImageToClipboard: (dataUrl) => {
    const image = electron.nativeImage.createFromDataURL(dataUrl);
    electron.clipboard.writeImage(image);
  },
  saveImage: (dataUrl) => electron.ipcRenderer.invoke("capture:save-image", dataUrl)
});
electron.contextBridge.exposeInMainWorld("editorApi", {
  saveToClipboardAndPersist: (dataUrl) => {
    const image = electron.nativeImage.createFromDataURL(dataUrl);
    electron.clipboard.writeImage(image);
    return electron.ipcRenderer.invoke("capture:save-image", dataUrl);
  },
  onImage: (handler) => {
    electron.ipcRenderer.on("editor:image", (_event, dataUrl) => {
      handler(dataUrl);
    });
  }
});
