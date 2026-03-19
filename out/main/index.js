import { app, globalShortcut, nativeImage, Tray, Menu, ipcMain, clipboard, BrowserWindow, desktopCapturer, screen, systemPreferences } from "electron";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
function clampNumber(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function clampMaskAlpha(raw, fallback = 0.7) {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return clampNumber(n, 0.6, 0.8);
}
function getConfigPath() {
  const userData = app.getPath("userData");
  return path.join(userData, "config.json");
}
function saveConfig(config) {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
function loadConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    try {
      const parsed = JSON.parse(raw);
      const rawHotkey = typeof parsed.hotkey === "string" ? parsed.hotkey.trim() : "";
      const maskAlpha = clampMaskAlpha(parsed.maskAlpha, 0.7);
      const next = {
        configVersion: typeof parsed.configVersion === "number" ? parsed.configVersion : 1,
        hotkey: rawHotkey || "F1",
        autoSaveToFile: parsed.autoSaveToFile ?? false,
        saveDir: parsed.saveDir ?? path.join(app.getPath("pictures"), "ElectronScreenshot"),
        openEditorAfterCapture: parsed.openEditorAfterCapture ?? true,
        maskAlpha
      };
      if ((next.configVersion ?? 1) < 4) {
        next.configVersion = 4;
        saveConfig(next);
      }
      return next;
    } catch {
    }
  }
  return {
    configVersion: 4,
    hotkey: "F1",
    autoSaveToFile: false,
    saveDir: path.join(app.getPath("pictures"), "ElectronScreenshot"),
    openEditorAfterCapture: true,
    maskAlpha: 0.7
  };
}
function getHistoryPath() {
  const userData = app.getPath("userData");
  return path.join(userData, "history.json");
}
function loadHistory() {
  const historyPath = getHistoryPath();
  if (fs.existsSync(historyPath)) {
    try {
      const raw = fs.readFileSync(historyPath, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
function saveHistory(history) {
  const historyPath = getHistoryPath();
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
}
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
  CAPTURE_ERROR: "capture:error",
  CAPTURE_CLOSE: "capture:close",
  HISTORY_LIST: "history:list",
  HISTORY_CLEAR: "history:clear",
  PIN_LAST: "pin:last"
};
function createShortcutsController(params) {
  const { configRef: configRef2, trayRef: trayRef2, saveConfig: saveConfig2, updateTrayMenu: updateTrayMenu2, isCaptureActive, createCaptureWindow, enterSelectingMode, closeAllCaptureWindows, getCaptureState, getActiveCaptureRunId, getInputWindow } = params;
  let registeredScreenshotHotkey = null;
  let captureEscShortcutRegistered = false;
  let captureEnterShortcutRegistered = false;
  function registerCaptureEscShortcut() {
    if (captureEscShortcutRegistered) return;
    const ok = globalShortcut.register("Esc", () => {
      if (isCaptureActive()) {
        closeAllCaptureWindows();
      }
    });
    if (ok) {
      captureEscShortcutRegistered = true;
    }
  }
  function unregisterCaptureEscShortcut() {
    if (!captureEscShortcutRegistered) return;
    globalShortcut.unregister("Esc");
    captureEscShortcutRegistered = false;
  }
  function registerCaptureEnterShortcut() {
    if (captureEnterShortcutRegistered) return;
    const ok = globalShortcut.register("Enter", () => {
      const sessionId = getActiveCaptureRunId() ?? 0;
      if (!sessionId) return;
      const win = getInputWindow();
      if (!win || win.isDestroyed()) return;
      try {
        win.webContents.send(IPC_CHANNELS.CAPTURE_CONFIRM_REQUEST, { sessionId });
      } catch {
      }
    });
    if (ok) captureEnterShortcutRegistered = true;
  }
  function unregisterCaptureEnterShortcut() {
    if (!captureEnterShortcutRegistered) return;
    globalShortcut.unregister("Enter");
    captureEnterShortcutRegistered = false;
  }
  function registerShortcuts(allowFallbackToF1 = true) {
    const config = configRef2.current;
    if (!config) return;
    const handler = () => {
      console.log("[main] global shortcut triggered", configRef2.current.hotkey);
      if (!isCaptureActive()) {
        createCaptureWindow();
        return;
      }
      if (getCaptureState() === "masked") {
        enterSelectingMode();
        return;
      }
      closeAllCaptureWindows();
    };
    const requestedHotkey = (config.hotkey || "F1").trim() || "F1";
    if (registeredScreenshotHotkey) {
      try {
        globalShortcut.unregister(registeredScreenshotHotkey);
      } catch {
      }
    }
    let ok = globalShortcut.register(requestedHotkey, handler);
    let actualHotkey = requestedHotkey;
    console.log("是否注册快捷键成功", ok, requestedHotkey);
    if (!ok && allowFallbackToF1 && requestedHotkey !== "F1") {
      try {
        ok = globalShortcut.register("F1", handler);
        if (ok) {
          configRef2.current.hotkey = "F1";
          saveConfig2(configRef2.current);
          actualHotkey = "F1";
        }
      } catch {
      }
    }
    registeredScreenshotHotkey = ok ? actualHotkey : null;
    console.log("[main] registerShortcuts", configRef2.current.hotkey, ok ? "success" : "failed");
    if (trayRef2.current) {
      updateTrayMenu2();
    }
    if (!ok && trayRef2.current) {
      trayRef2.current.displayBalloon({
        title: "快捷键注册失败",
        content: `无法注册截图快捷键：${requestedHotkey}。请检查系统是否占用该按键，或以管理员权限运行。`
      });
    }
  }
  return {
    registerShortcuts,
    registerCaptureEscShortcut,
    unregisterCaptureEscShortcut,
    registerCaptureEnterShortcut,
    unregisterCaptureEnterShortcut,
    getRegisteredScreenshotHotkey: () => registeredScreenshotHotkey
  };
}
function createTray(params) {
  const { trayRef: trayRef2, configRef: configRef2, updateTrayMenu: updateTrayMenu2 } = params;
  if (trayRef2.current) return;
  const iconPath = path.join(app.getAppPath(), "assets", "favicon.ico");
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon;
  trayRef2.current = new Tray(trayIcon);
  const hotkeyText = configRef2.current?.hotkey || "F1";
  trayRef2.current.setToolTip(`截图助手 - 按 ${hotkeyText} 开始截图`);
  updateTrayMenu2();
}
function updateTrayMenu$1(params) {
  const { trayRef: trayRef2, configRef: configRef2, isCaptureActive, closeAllCaptureWindows, createCaptureWindow, createMainWindow: createMainWindow2, mainWindowRef: mainWindowRef2 } = params;
  const tray = trayRef2.current;
  if (!tray) return;
  const hotkeyText = configRef2.current?.hotkey || "F1";
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isCaptureActive() ? "结束截图" : "截图",
      click: () => {
        if (isCaptureActive()) {
          console.log("[main] tray menu click: stop capture");
          closeAllCaptureWindows();
        } else {
          console.log("[main] tray menu click: screenshot");
          createCaptureWindow();
        }
      }
    },
    {
      label: "设置",
      click: () => {
        console.log("[main] tray menu click: settings");
        createMainWindow2();
        mainWindowRef2.current?.show();
        mainWindowRef2.current?.focus();
      }
    },
    {
      label: "退出",
      click: () => {
        console.log("[main] tray menu click: quit");
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(
    isCaptureActive() ? `截图助手 - 按 ${hotkeyText} 开始截图（正在截图）` : `截图助手 - 按 ${hotkeyText} 开始截图`
  );
}
const CAPTURE_ERROR_CODES = {
  ALREADY_ACTIVE: "CAPTURE_ALREADY_ACTIVE",
  NO_DISPLAYS: "CAPTURE_NO_DISPLAYS",
  MACOS_SCREEN_PERMISSION: "CAPTURE_MACOS_SCREEN_PERMISSION",
  LINUX_WAYLAND_LIMITATION: "CAPTURE_LINUX_WAYLAND_LIMITATION",
  DESKTOP_CAPTURER_FAILED: "CAPTURE_DESKTOP_CAPTURER_FAILED",
  SOURCES_EMPTY: "CAPTURE_SOURCES_EMPTY",
  SOURCE_MAP_FAILED: "CAPTURE_SOURCE_MAP_FAILED",
  THUMBNAIL_EMPTY: "CAPTURE_THUMBNAIL_EMPTY",
  WINDOW_LOAD_FAILED: "CAPTURE_WINDOW_LOAD_FAILED",
  SAVE_FAILED: "CAPTURE_SAVE_FAILED",
  UNKNOWN: "CAPTURE_UNKNOWN"
};
function registerIpcHandlers(params) {
  const { configRef: configRef2, historyRef: historyRef2, lastCaptureDataUrlRef: lastCaptureDataUrlRef2, saveConfig: saveConfig2, saveHistory: saveHistory2, shortcuts: shortcuts2, createEditorWindow: createEditorWindow2, editorWindowRef: editorWindowRef2, isCaptureActive, transitionCaptureState, getActiveCaptureRunId, broadcastSelectionToMasks, handleCaptureSessionReport, handleCaptureClose, emitCaptureError: emitCaptureError2 } = params;
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return configRef2.current;
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, patch) => {
    const prev = configRef2.current;
    const requestedHotkey = typeof patch.hotkey === "string" ? patch.hotkey.trim() : null;
    if (requestedHotkey !== null && requestedHotkey.length === 0) {
      throw new Error("截图快捷键不能为空");
    }
    const { hotkey: _hotkey, ...rest } = patch;
    const maskAlpha = clampMaskAlpha(rest.maskAlpha, configRef2.current.maskAlpha);
    configRef2.current = {
      ...configRef2.current,
      ...rest,
      hotkey: requestedHotkey ?? configRef2.current.hotkey,
      maskAlpha
    };
    saveConfig2(configRef2.current);
    shortcuts2.registerShortcuts(false);
    if (shortcuts2.getRegisteredScreenshotHotkey() === null) {
      configRef2.current = prev;
      saveConfig2(configRef2.current);
      shortcuts2.registerShortcuts(false);
      throw new Error("快捷键注册失败，可能已被系统占用");
    }
    return configRef2.current;
  });
  ipcMain.handle(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, async (_event, dataUrl) => {
    let filePath = null;
    try {
      lastCaptureDataUrlRef2.current = dataUrl;
      const image = nativeImage.createFromDataURL(dataUrl);
      clipboard.writeImage(image);
      if (configRef2.current.autoSaveToFile) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        const dir = configRef2.current.saveDir;
        await fs.promises.mkdir(dir, { recursive: true });
        const filename = `screenshot-${Date.now()}.png`;
        filePath = path.join(dir, filename);
        await fs.promises.writeFile(filePath, buffer);
        const record = {
          id: randomUUID(),
          filePath,
          createdAt: Date.now()
        };
        historyRef2.current.unshift(record);
        if (historyRef2.current.length > 100) {
          historyRef2.current = historyRef2.current.slice(0, 100);
        }
        saveHistory2(historyRef2.current);
      }
      if (configRef2.current.openEditorAfterCapture) {
        createEditorWindow2();
        editorWindowRef2.current?.webContents.send("editor:image", dataUrl);
      }
      if (isCaptureActive()) {
        transitionCaptureState("finishing");
      }
      return filePath;
    } catch (error) {
      emitCaptureError2({
        sessionId: getActiveCaptureRunId() ?? 0,
        code: CAPTURE_ERROR_CODES.SAVE_FAILED,
        stage: "save",
        message: "save image failed",
        details: { error: String(error) }
      });
      throw error;
    }
  });
  ipcMain.on(IPC_CHANNELS.CAPTURE_SESSION_REPORT, (_event, report) => {
    handleCaptureSessionReport(report);
  });
  ipcMain.on(IPC_CHANNELS.CAPTURE_SELECTION_UPDATE, (_event, payload) => {
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.sessionId !== "number") return;
    if (payload.sessionId !== getActiveCaptureRunId()) return;
    broadcastSelectionToMasks(payload);
  });
  ipcMain.on(IPC_CHANNELS.CAPTURE_CLOSE, (_event, req) => {
    handleCaptureClose(req);
  });
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () => {
    return historyRef2.current;
  });
  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => {
    historyRef2.current = [];
    saveHistory2(historyRef2.current);
  });
  ipcMain.handle(IPC_CHANNELS.PIN_LAST, () => {
    if (!lastCaptureDataUrlRef2.current) return;
    const pinWindow = new BrowserWindow({
      frame: false,
      transparent: true,
      resizable: true,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: "#00000000"
    });
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: transparent;
              -webkit-app-region: drag;
            }
            img {
              display: block;
            }
          </style>
        </head>
        <body>
          <img src="${lastCaptureDataUrlRef2.current}" />
        </body>
      </html>
    `;
    pinWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  });
  ipcMain.handle("CAPTURE_GET_SOURCES", async (_event, opts) => {
    const sources = await desktopCapturer.getSources(opts);
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  });
}
function getVirtualBounds(displays) {
  if (displays.length <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const first = displays[0].bounds;
  return displays.reduce(
    (acc, d) => {
      const b = d.bounds;
      const x1 = Math.min(acc.x, b.x);
      const y1 = Math.min(acc.y, b.y);
      const x2 = Math.max(acc.x + acc.width, b.x + b.width);
      const y2 = Math.max(acc.y + acc.height, b.y + b.height);
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    },
    { x: first.x, y: first.y, width: first.width, height: first.height }
  );
}
function computeCompositeScaleFactor(displays) {
  const factors = displays.map((d) => d.scaleFactor).filter((n) => Number.isFinite(n));
  return Math.max(1, ...factors);
}
function composeMultiCaptureBackgroundPayload(params) {
  const { sessionId, displays, screens } = params;
  return {
    mode: "multi",
    sessionId,
    virtualBounds: getVirtualBounds(displays),
    compositeScaleFactor: computeCompositeScaleFactor(displays),
    screens,
    displays
  };
}
function parseScreenNumber(name) {
  const m = name.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
function pickScreenSourceForDisplay(sources, targetDisplay, displays) {
  const displayId = String(targetDisplay.id);
  const byDisplayId = sources.find((s) => String(s.display_id ?? "") === displayId);
  if (byDisplayId) return byDisplayId;
  const sortedDisplays = [...displays].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  const targetIndex = sortedDisplays.findIndex((d) => d.id === targetDisplay.id);
  const numberedSources = sources.map((s) => ({ s, n: parseScreenNumber(s.name) })).filter((x) => typeof x.n === "number").sort((a, b) => a.n - b.n);
  if (targetIndex >= 0 && targetIndex < numberedSources.length) {
    return numberedSources[targetIndex].s;
  }
  if (sources.length === 1) return sources[0];
  return null;
}
async function populateMultiCaptureScreens(params) {
  const { epoch, sessionId, displays, allDisplays, screensPayload, isSessionCurrent, desktopCapturer: desktopCapturer2, emitCaptureError: emitCaptureError2 } = params;
  for (const display of displays) {
    if (!isSessionCurrent(epoch, sessionId)) return;
    const thumbnailSize = {
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor)
    };
    let sources;
    try {
      sources = await desktopCapturer2.getSources({ types: ["screen"], thumbnailSize });
    } catch (error) {
      emitCaptureError2({
        sessionId,
        code: CAPTURE_ERROR_CODES.DESKTOP_CAPTURER_FAILED,
        stage: "desktop-capture",
        message: "desktopCapturer.getSources failed",
        details: { displayId: display.id, error: String(error) }
      });
      throw error;
    }
    if (!isSessionCurrent(epoch, sessionId)) return;
    if (!sources || sources.length <= 0) {
      emitCaptureError2({
        sessionId,
        code: CAPTURE_ERROR_CODES.SOURCES_EMPTY,
        stage: "desktop-capture",
        message: "desktopCapturer returned empty sources",
        details: { displayId: display.id }
      });
      throw new Error(`empty sources displayId=${display.id}`);
    }
    const source = pickScreenSourceForDisplay(sources, display, allDisplays);
    if (!source) {
      emitCaptureError2({
        sessionId,
        code: CAPTURE_ERROR_CODES.SOURCE_MAP_FAILED,
        stage: "map-source",
        message: "cannot map screen source for display",
        details: { displayId: display.id, sources: sources.map((s) => ({ id: s.id, name: s.name, display_id: s.display_id })) }
      });
      throw new Error(`cannot map screen source displayId=${display.id}`);
    }
    const image = source.thumbnail;
    if (image.isEmpty()) {
      emitCaptureError2({
        sessionId,
        code: CAPTURE_ERROR_CODES.THUMBNAIL_EMPTY,
        stage: "thumbnail",
        message: "screen thumbnail is empty",
        details: { displayId: display.id, sourceId: source.id, sourceName: source.name }
      });
      throw new Error(`empty thumbnail displayId=${display.id}`);
    }
    screensPayload.screens.push({
      displayId: display.id,
      bounds: { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height },
      scaleFactor: display.scaleFactor,
      dataUrl: image.toDataURL()
    });
  }
}
function createCaptureWindowsUtilities(params) {
  const { captureWindowsRef: captureWindowsRef2, inputWindowRef: inputWindowRef2 } = params;
  function broadcastCaptureSessionState(snap) {
    for (const win of captureWindowsRef2.current) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.CAPTURE_SESSION_STATE, snap);
        }
      } catch {
      }
    }
  }
  function updateMaskMouseBehavior(state) {
    for (const win of captureWindowsRef2.current) {
      try {
        if (win.isDestroyed()) continue;
        if (win.__captureRole !== "mask") continue;
        win.setIgnoreMouseEvents(true, { forward: true });
      } catch {
      }
    }
    const input = inputWindowRef2.current;
    if (input && !input.isDestroyed()) {
      try {
        if (state === "selecting") {
          input.setIgnoreMouseEvents(false);
        } else {
          input.setIgnoreMouseEvents(true, { forward: true });
        }
      } catch {
      }
    }
  }
  function broadcastSelectionToMasks(payload) {
    for (const win of captureWindowsRef2.current) {
      try {
        if (win.isDestroyed()) continue;
        if (win.__captureRole !== "mask") continue;
        win.webContents.send(IPC_CHANNELS.CAPTURE_SELECTION_BROADCAST, payload);
      } catch {
      }
    }
  }
  return {
    broadcastCaptureSessionState,
    updateMaskMouseBehavior,
    broadcastSelectionToMasks
  };
}
function createCaptureWindowsController(params) {
  const { isDev: isDev2, baseDir: baseDir2, configRef: configRef2, trayRef: trayRef2, captureWindowsRef: captureWindowsRef2, inputWindowRef: inputWindowRef2, captureBackgroundPayloadRef: captureBackgroundPayloadRef2, captureVirtualBoundsRef: captureVirtualBoundsRef2, isClosingCaptureWindowsRef: isClosingCaptureWindowsRef2, session: session2, shortcuts: shortcuts2, updateTrayMenu: updateTrayMenu2, emitCaptureError: emitCaptureError2, utilities: utilities2 } = params;
  function closeAllCaptureWindows(reason = "canceled") {
    session2.bumpEpoch();
    session2.setCaptureStarting(false);
    shortcuts2.unregisterCaptureEnterShortcut();
    captureBackgroundPayloadRef2.current = null;
    captureVirtualBoundsRef2.current = null;
    inputWindowRef2.current = null;
    if (reason === "finishing") {
      session2.transitionCaptureState("finishing");
    } else if (reason === "canceled") {
      session2.transitionCaptureState("canceled");
    }
    if (captureWindowsRef2.current.length <= 0) {
      shortcuts2.unregisterCaptureEscShortcut();
      shortcuts2.unregisterCaptureEnterShortcut();
      session2.setActiveRunId(null);
      session2.transitionCaptureState("idle");
      if (trayRef2.current) {
        updateTrayMenu2();
      }
      return;
    }
    if (isClosingCaptureWindowsRef2.current) return;
    isClosingCaptureWindowsRef2.current = true;
    for (const win of captureWindowsRef2.current) {
      try {
        if (!win.isDestroyed()) {
          win.close();
        }
      } catch {
      }
    }
  }
  function enterSelectingMode() {
    const sessionId = session2.getActiveRunId() ?? 0;
    if (!sessionId) return;
    if (inputWindowRef2.current && !inputWindowRef2.current.isDestroyed()) return;
    const vb = captureVirtualBoundsRef2.current;
    if (!vb) return;
    session2.transitionCaptureState("selecting");
    shortcuts2.registerCaptureEnterShortcut();
    const expectedBounds = { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
    const win = new BrowserWindow({
      x: expectedBounds.x,
      y: expectedBounds.y,
      width: expectedBounds.width,
      height: expectedBounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      useContentSize: true,
      enableLargerThanScreen: true,
      show: false,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: path.join(baseDir2, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    win.__captureRole = "input";
    inputWindowRef2.current = win;
    win.setMenuBarVisibility(false);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, "screen-saver");
    captureWindowsRef2.current.push(win);
    utilities2.updateMaskMouseBehavior(session2.getState());
    win.on("close", (e) => {
      if (isClosingCaptureWindowsRef2.current) return;
      e.preventDefault();
      closeAllCaptureWindows("canceled");
    });
    win.on("closed", () => {
      captureWindowsRef2.current = captureWindowsRef2.current.filter((w) => w !== win);
      if (inputWindowRef2.current === win) inputWindowRef2.current = null;
      if (captureWindowsRef2.current.length <= 0) {
        console.log("[main] captureWindow(s) closed");
        isClosingCaptureWindowsRef2.current = false;
        session2.setCaptureStarting(false);
        session2.setActiveRunId(null);
        inputWindowRef2.current = null;
        captureBackgroundPayloadRef2.current = null;
        captureVirtualBoundsRef2.current = null;
        if (session2.getState() === "masked" || session2.getState() === "selecting") {
          session2.transitionCaptureState("canceled");
        }
        session2.transitionCaptureState("idle");
        shortcuts2.unregisterCaptureEscShortcut();
        shortcuts2.unregisterCaptureEnterShortcut();
        if (trayRef2.current) updateTrayMenu2();
      }
    });
    win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
      console.error("[main] inputWindow did-fail-load", errorCode, errorDescription);
      emitCaptureError2({
        sessionId,
        code: CAPTURE_ERROR_CODES.WINDOW_LOAD_FAILED,
        stage: "input-load",
        message: "input window failed to load",
        details: { errorCode, errorDescription }
      });
      closeAllCaptureWindows("canceled");
    });
    win.webContents.once("did-finish-load", () => {
      if (captureBackgroundPayloadRef2.current && captureBackgroundPayloadRef2.current.sessionId === sessionId) {
        try {
          win.webContents.send("capture:set-background", captureBackgroundPayloadRef2.current);
        } catch {
        }
      }
      win.showInactive();
      try {
        const actual = win.getBounds();
        if (actual.x !== expectedBounds.x || actual.y !== expectedBounds.y || actual.width !== expectedBounds.width || actual.height !== expectedBounds.height) {
          console.warn("[main] input bounds mismatch", { expectedBounds, actual });
          win.setBounds(expectedBounds, false);
        }
      } catch {
      }
      utilities2.updateMaskMouseBehavior(session2.getState());
      utilities2.broadcastCaptureSessionState(session2.snapshotCaptureSession());
    });
    if (isDev2) {
      win.loadURL("http://localhost:5173/capture.html");
    } else {
      win.loadFile(path.join(baseDir2, "../renderer/capture.html"));
    }
  }
  function createCaptureWindow() {
    if (session2.isCaptureActive()) {
      console.log("[main] captureWindow already exists");
      emitCaptureError2({
        sessionId: session2.getActiveRunId() ?? 0,
        code: CAPTURE_ERROR_CODES.ALREADY_ACTIVE,
        stage: "precheck",
        message: "capture session already active"
      });
      return;
    }
    const allDisplays = screen.getAllDisplays();
    if (allDisplays.length <= 0) {
      console.error("[main] no displays found");
      emitCaptureError2({
        sessionId: 0,
        code: CAPTURE_ERROR_CODES.NO_DISPLAYS,
        stage: "precheck",
        message: "no displays found"
      });
      return;
    }
    const targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const displays = [targetDisplay];
    if (process.platform === "darwin") {
      try {
        const status = systemPreferences.getMediaAccessStatus("screen");
        if (status !== "granted") {
          emitCaptureError2({
            sessionId: 0,
            code: CAPTURE_ERROR_CODES.MACOS_SCREEN_PERMISSION,
            stage: "precheck",
            message: `screen permission not granted: ${status}`,
            details: { status }
          });
          return;
        }
      } catch (error) {
        emitCaptureError2({
          sessionId: 0,
          code: CAPTURE_ERROR_CODES.MACOS_SCREEN_PERMISSION,
          stage: "precheck",
          message: "failed to read macOS screen permission status",
          details: { error: String(error) }
        });
      }
    }
    if (process.platform === "linux") {
      const sessionType = process.env.XDG_SESSION_TYPE;
      if (typeof sessionType === "string" && sessionType.toLowerCase() === "wayland") {
        emitCaptureError2({
          sessionId: 0,
          code: CAPTURE_ERROR_CODES.LINUX_WAYLAND_LIMITATION,
          stage: "precheck",
          message: "running under Wayland may limit screen capture",
          details: { sessionType }
        });
      }
    }
    const epoch = session2.bumpEpoch();
    const sessionId = session2.nextRunId();
    session2.setActiveRunId(sessionId);
    session2.setCaptureStarting(true);
    session2.transitionCaptureState("masked");
    shortcuts2.registerCaptureEscShortcut();
    if (trayRef2.current) {
      updateTrayMenu2();
    }
    console.log("[main] creating capture mask windows");
    const primaryDisplay = screen.getPrimaryDisplay();
    const displayMetas = displays.map((d) => ({
      id: d.id,
      bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
      workArea: { x: d.workArea.x, y: d.workArea.y, width: d.workArea.width, height: d.workArea.height },
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
      isPrimary: d.id === primaryDisplay.id
    }));
    const screensPayload = composeMultiCaptureBackgroundPayload({ sessionId, displays: displayMetas, screens: [] });
    captureVirtualBoundsRef2.current = screensPayload.virtualBounds;
    captureBackgroundPayloadRef2.current = null;
    isClosingCaptureWindowsRef2.current = false;
    captureWindowsRef2.current = [];
    inputWindowRef2.current = null;
    for (const display of displays) {
      const expectedBounds = { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height };
      const win = new BrowserWindow({
        x: expectedBounds.x,
        y: expectedBounds.y,
        width: expectedBounds.width,
        height: expectedBounds.height,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        focusable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        useContentSize: true,
        enableLargerThanScreen: true,
        show: false,
        backgroundColor: "#00000000",
        webPreferences: {
          preload: path.join(baseDir2, "../preload/index.cjs"),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      win.__captureRole = "mask";
      win.setMenuBarVisibility(false);
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true, "screen-saver");
      captureWindowsRef2.current.push(win);
      win.on("close", (e) => {
        if (isClosingCaptureWindowsRef2.current) return;
        e.preventDefault();
        closeAllCaptureWindows("canceled");
      });
      win.on("closed", () => {
        captureWindowsRef2.current = captureWindowsRef2.current.filter((w) => w !== win);
        if (captureWindowsRef2.current.length <= 0) {
          console.log("[main] captureWindow(s) closed");
          isClosingCaptureWindowsRef2.current = false;
          session2.setCaptureStarting(false);
          session2.setActiveRunId(null);
          inputWindowRef2.current = null;
          captureBackgroundPayloadRef2.current = null;
          captureVirtualBoundsRef2.current = null;
          if (session2.getState() === "masked" || session2.getState() === "selecting") {
            session2.transitionCaptureState("canceled");
          }
          session2.transitionCaptureState("idle");
          shortcuts2.unregisterCaptureEscShortcut();
          shortcuts2.unregisterCaptureEnterShortcut();
          if (trayRef2.current) updateTrayMenu2();
        }
      });
      win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("[main] maskWindow did-fail-load", errorCode, errorDescription);
        emitCaptureError2({
          sessionId,
          code: CAPTURE_ERROR_CODES.WINDOW_LOAD_FAILED,
          stage: "mask-load",
          message: "mask window failed to load",
          details: { errorCode, errorDescription, displayId: display.id }
        });
        closeAllCaptureWindows("canceled");
      });
      win.webContents.once("did-finish-load", () => {
        try {
          const maskAlpha = clampMaskAlpha(configRef2.current?.maskAlpha, 0.7);
          win.webContents.send(IPC_CHANNELS.CAPTURE_MASK_INIT, {
            sessionId,
            displayId: display.id,
            displayBounds: expectedBounds,
            maskAlpha
          });
        } catch {
        }
        win.showInactive();
        try {
          const actual = win.getBounds();
          if (actual.x !== expectedBounds.x || actual.y !== expectedBounds.y || actual.width !== expectedBounds.width || actual.height !== expectedBounds.height) {
            console.warn("[main] mask bounds mismatch", { displayId: display.id, expectedBounds, actual, scaleFactor: display.scaleFactor });
            win.setBounds(expectedBounds, false);
          }
        } catch {
        }
        utilities2.updateMaskMouseBehavior(session2.getState());
        utilities2.broadcastCaptureSessionState(session2.snapshotCaptureSession());
      });
      if (isDev2) {
        win.loadURL("http://localhost:5173/mask.html");
      } else {
        win.loadFile(path.join(baseDir2, "../renderer/mask.html"));
      }
    }
    captureBackgroundPayloadRef2.current = screensPayload;
    enterSelectingMode();
    void (async () => {
      try {
        await populateMultiCaptureScreens({
          epoch,
          sessionId,
          displays,
          allDisplays,
          screensPayload,
          isSessionCurrent: session2.isSessionCurrent,
          desktopCapturer,
          emitCaptureError: emitCaptureError2
        });
      } catch (error) {
        console.error("[main] capture background error", error);
        emitCaptureError2({
          sessionId,
          code: CAPTURE_ERROR_CODES.UNKNOWN,
          stage: "unknown",
          message: "capture background error",
          details: { error: String(error) }
        });
        closeAllCaptureWindows("canceled");
        shortcuts2.unregisterCaptureEscShortcut();
        return;
      }
      if (!session2.isSessionCurrent(epoch, sessionId)) return;
      session2.setCaptureStarting(false);
      captureBackgroundPayloadRef2.current = screensPayload;
      const currentInput = inputWindowRef2.current;
      if (currentInput && !currentInput.isDestroyed()) {
        try {
          currentInput.webContents.send("capture:set-background", screensPayload);
        } catch {
        }
      }
      if (trayRef2.current) updateTrayMenu2();
    })();
  }
  function handleCaptureSessionReport(report) {
    if (!report || typeof report !== "object") return;
    if (typeof report.sessionId !== "number") return;
    if (report.sessionId !== session2.getActiveRunId()) return;
    if (report.state === "masked") session2.transitionCaptureState("masked");
    else if (report.state === "selecting") session2.transitionCaptureState("selecting");
    else if (report.state === "finishing") session2.transitionCaptureState("finishing");
    else if (report.state === "canceled") session2.transitionCaptureState("canceled");
  }
  function handleCaptureClose(req) {
    if (!req || typeof req !== "object") return;
    if (typeof req.sessionId !== "number") return;
    if (req.sessionId !== session2.getActiveRunId()) return;
    const reason = req.reason === "finishing" ? "finishing" : "canceled";
    closeAllCaptureWindows(reason);
  }
  return {
    createCaptureWindow,
    enterSelectingMode,
    closeAllCaptureWindows,
    handleCaptureSessionReport,
    handleCaptureClose
  };
}
function createEditorWindow(params) {
  const { isDev: isDev2, baseDir: baseDir2, editorWindowRef: editorWindowRef2 } = params;
  if (editorWindowRef2.current) {
    editorWindowRef2.current.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    webPreferences: {
      preload: path.join(baseDir2, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  editorWindowRef2.current = win;
  win.setMenuBarVisibility(false);
  if (isDev2) {
    win.loadURL("http://localhost:5173/editor.html");
  } else {
    win.loadFile(path.join(baseDir2, "../renderer/editor.html"));
  }
  win.on("closed", () => {
    editorWindowRef2.current = null;
  });
}
function createMainWindow(params) {
  const { isDev: isDev2, baseDir: baseDir2, isQuittingRef: isQuittingRef2, mainWindowRef: mainWindowRef2 } = params;
  if (mainWindowRef2.current) return;
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(baseDir2, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindowRef2.current = win;
  win.setMenuBarVisibility(false);
  win.on("close", (e) => {
    if (isQuittingRef2.current) return;
    e.preventDefault();
    mainWindowRef2.current?.hide();
  });
  win.on("closed", () => {
    mainWindowRef2.current = null;
  });
  if (isDev2) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(baseDir2, "../renderer/index.html"));
  }
  win.webContents.once("did-finish-load", () => {
    console.log("[main] settings window loaded");
  });
}
const CAPTURE_STATE_ALLOWED = {
  idle: /* @__PURE__ */ new Set(["masked"]),
  masked: /* @__PURE__ */ new Set(["selecting", "finishing", "canceled", "idle"]),
  selecting: /* @__PURE__ */ new Set(["masked", "finishing", "canceled"]),
  finishing: /* @__PURE__ */ new Set(["idle"]),
  canceled: /* @__PURE__ */ new Set(["idle"])
};
function isCaptureStateTransitionAllowed(from, to) {
  if (from === to) return true;
  return Boolean(CAPTURE_STATE_ALLOWED[from]?.has(to));
}
function createCaptureSessionController(deps) {
  let captureEpoch = 0;
  let captureRunId = 0;
  let activeCaptureRunId = null;
  let captureState = "idle";
  let isCaptureStarting = false;
  function isCaptureActive() {
    return isCaptureStarting || deps.getCaptureWindowsCount() > 0 || activeCaptureRunId !== null;
  }
  function snapshotCaptureSession() {
    return {
      sessionId: activeCaptureRunId ?? 0,
      state: captureState,
      updatedAt: Date.now()
    };
  }
  function transitionCaptureState(next) {
    if (captureState === next) return;
    if (!isCaptureStateTransitionAllowed(captureState, next)) {
      console.warn("[main] invalid capture state transition", captureState, "->", next);
      return;
    }
    captureState = next;
    deps.broadcastCaptureSessionState(snapshotCaptureSession());
    deps.updateMaskMouseBehavior(captureState);
  }
  function bumpEpoch() {
    captureEpoch++;
    return captureEpoch;
  }
  function nextRunId() {
    captureRunId++;
    return captureRunId;
  }
  function isSessionCurrent(epoch, runId) {
    return epoch === captureEpoch && activeCaptureRunId === runId;
  }
  return {
    isCaptureActive,
    snapshotCaptureSession,
    transitionCaptureState,
    bumpEpoch,
    nextRunId,
    isSessionCurrent,
    getEpoch: () => captureEpoch,
    getActiveRunId: () => activeCaptureRunId,
    setActiveRunId: (runId) => {
      activeCaptureRunId = runId;
    },
    getState: () => captureState,
    setCaptureStarting: (v) => {
      isCaptureStarting = v;
    }
  };
}
const trayRef = { current: null };
const mainWindowRef = { current: null };
const editorWindowRef = { current: null };
const captureWindowsRef = { current: [] };
const inputWindowRef = { current: null };
const captureBackgroundPayloadRef = { current: null };
const captureVirtualBoundsRef = { current: null };
const historyRef = { current: [] };
const lastCaptureDataUrlRef = { current: null };
const isQuittingRef = { current: false };
const isClosingCaptureWindowsRef = { current: false };
const configRef = { current: null };
const isDev = !app.isPackaged;
const baseDir = __dirname;
function emitCaptureError(payload) {
  const full = { ...payload, platform: process.platform };
  console.error("[capture:error]", JSON.stringify(full));
}
const utilities = createCaptureWindowsUtilities({ captureWindowsRef, inputWindowRef });
const session = createCaptureSessionController({
  getCaptureWindowsCount: () => captureWindowsRef.current.length,
  broadcastCaptureSessionState: utilities.broadcastCaptureSessionState,
  updateMaskMouseBehavior: utilities.updateMaskMouseBehavior
});
const captureCtrlRef = { current: null };
let updateTrayMenu = () => {
};
const ensureMainWindow = () => {
  createMainWindow({ isDev, baseDir, isQuittingRef, mainWindowRef });
};
const ensureEditorWindow = () => {
  createEditorWindow({ isDev, baseDir, editorWindowRef });
};
const shortcuts = createShortcutsController({
  configRef,
  trayRef,
  saveConfig,
  updateTrayMenu: () => updateTrayMenu(),
  isCaptureActive: () => session.isCaptureActive(),
  createCaptureWindow: () => captureCtrlRef.current?.createCaptureWindow(),
  enterSelectingMode: () => captureCtrlRef.current?.enterSelectingMode(),
  closeAllCaptureWindows: () => captureCtrlRef.current?.closeAllCaptureWindows(),
  getCaptureState: () => session.getState(),
  getActiveCaptureRunId: () => session.getActiveRunId(),
  getInputWindow: () => inputWindowRef.current
});
const captureCtrl = createCaptureWindowsController({
  isDev,
  baseDir,
  configRef,
  trayRef,
  captureWindowsRef,
  inputWindowRef,
  captureBackgroundPayloadRef,
  captureVirtualBoundsRef,
  isClosingCaptureWindowsRef,
  session,
  shortcuts,
  updateTrayMenu: () => updateTrayMenu(),
  emitCaptureError,
  utilities
});
captureCtrlRef.current = captureCtrl;
updateTrayMenu = () => {
  updateTrayMenu$1({
    trayRef,
    configRef,
    isCaptureActive: () => session.isCaptureActive(),
    closeAllCaptureWindows: () => captureCtrl.closeAllCaptureWindows(),
    createCaptureWindow: () => captureCtrl.createCaptureWindow(),
    createMainWindow: () => ensureMainWindow(),
    mainWindowRef
  });
};
app.whenReady().then(() => {
  configRef.current = loadConfig();
  historyRef.current = loadHistory();
  ensureMainWindow();
  createTray({ trayRef, configRef, updateTrayMenu: () => updateTrayMenu() });
  shortcuts.registerShortcuts();
  registerIpcHandlers({
    configRef,
    historyRef,
    lastCaptureDataUrlRef,
    saveConfig,
    saveHistory,
    shortcuts,
    createEditorWindow: () => ensureEditorWindow(),
    editorWindowRef,
    isCaptureActive: () => session.isCaptureActive(),
    transitionCaptureState: (next) => session.transitionCaptureState(next),
    getActiveCaptureRunId: () => session.getActiveRunId(),
    broadcastSelectionToMasks: (payload) => utilities.broadcastSelectionToMasks(payload),
    handleCaptureSessionReport: (report) => captureCtrl.handleCaptureSessionReport(report),
    handleCaptureClose: (req) => captureCtrl.handleCaptureClose(req),
    emitCaptureError
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ensureMainWindow();
    }
  });
});
app.on("before-quit", () => {
  isQuittingRef.current = true;
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
