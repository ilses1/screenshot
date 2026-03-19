"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  SETTINGS_GET: "settings:get",
  SETTINGS_UPDATE: "settings:update",
  CAPTURE_SAVE_IMAGE: "capture:save-image",
  CAPTURE_SESSION_STATE: "capture:session-state",
  CAPTURE_SESSION_REPORT: "capture:session-report",
  CAPTURE_MASK_INIT: "capture:mask-init",
  CAPTURE_SELECTION_UPDATE: "capture:selection-update",
  CAPTURE_SELECTION_BROADCAST: "capture:selection-broadcast",
  CAPTURE_CONFIRM_REQUEST: "capture:confirm-request",
  CAPTURE_CLOSE: "capture:close",
  HISTORY_LIST: "history:list",
  HISTORY_CLEAR: "history:clear",
  PIN_LAST: "pin:last"
};
const writeImageDataUrlToClipboard = (dataUrl) => {
  const image = electron.nativeImage.createFromDataURL(dataUrl);
  if (!electron.clipboard || typeof electron.clipboard.writeImage !== "function") {
    console.error("剪贴板对象不可用，无法写入图片");
    return;
  }
  electron.clipboard.writeImage(image);
};
electron.contextBridge.exposeInMainWorld("api", {
  ping: () => "pong",
  getSettings: () => electron.ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (patch) => electron.ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, patch),
  getHistory: () => electron.ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST),
  clearHistory: () => electron.ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),
  pinLast: () => electron.ipcRenderer.invoke(IPC_CHANNELS.PIN_LAST)
});
electron.contextBridge.exposeInMainWorld("captureApi", {
  onSetBackground: (handler) => {
    electron.ipcRenderer.on("capture:set-background", (_event, payload) => {
      handler(payload);
    });
  },
  onSessionState: (handler) => {
    electron.ipcRenderer.on(IPC_CHANNELS.CAPTURE_SESSION_STATE, (_event, snapshot) => {
      handler(snapshot);
    });
  },
  reportSessionState: (report) => {
    electron.ipcRenderer.send(IPC_CHANNELS.CAPTURE_SESSION_REPORT, report);
  },
  onMaskInit: (handler) => {
    electron.ipcRenderer.on(IPC_CHANNELS.CAPTURE_MASK_INIT, (_event, payload) => {
      handler(payload);
    });
  },
  sendSelectionRect: (payload) => {
    electron.ipcRenderer.send(IPC_CHANNELS.CAPTURE_SELECTION_UPDATE, payload);
  },
  onSelectionRect: (handler) => {
    electron.ipcRenderer.on(IPC_CHANNELS.CAPTURE_SELECTION_BROADCAST, (_event, payload) => {
      handler(payload);
    });
  },
  onConfirmRequest: (handler) => {
    electron.ipcRenderer.on(IPC_CHANNELS.CAPTURE_CONFIRM_REQUEST, (_event, payload) => {
      handler(payload);
    });
  },
  requestClose: (payload) => {
    electron.ipcRenderer.send(IPC_CHANNELS.CAPTURE_CLOSE, payload);
  },
  saveImageToClipboard: (dataUrl) => {
    writeImageDataUrlToClipboard(dataUrl);
  },
  saveImage: (dataUrl) => electron.ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, dataUrl)
});
electron.contextBridge.exposeInMainWorld("editorApi", {
  saveToClipboardAndPersist: (dataUrl) => {
    writeImageDataUrlToClipboard(dataUrl);
    return electron.ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, dataUrl);
  },
  onImage: (handler) => {
    electron.ipcRenderer.on("editor:image", (_event, dataUrl) => {
      handler(dataUrl);
    });
  }
});
