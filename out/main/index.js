import { app, BrowserWindow, globalShortcut, nativeImage, Tray, ipcMain, clipboard, desktopCapturer, Menu, screen, systemPreferences } from "electron";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
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
function clampNumber(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function clampMaskAlpha(raw, fallback = 0.7) {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return clampNumber(n, 0.6, 0.8);
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
let tray = null;
let mainWindow = null;
let captureWindows = [];
let inputWindow = null;
let editorWindow = null;
let captureEscShortcutRegistered = false;
let captureEnterShortcutRegistered = false;
let isQuitting = false;
let isClosingCaptureWindows = false;
let isCaptureStarting = false;
let captureEpoch = 0;
let captureRunId = 0;
let activeCaptureRunId = null;
let captureState = "idle";
let captureBackgroundPayload = null;
let captureVirtualBounds = null;
let history = [];
let lastCaptureDataUrl = null;
const isDev = !app.isPackaged;
let config;
function isCaptureActive() {
  return isCaptureStarting || captureWindows.length > 0 || activeCaptureRunId !== null;
}
function emitCaptureError(payload) {
  const full = { ...payload, platform: process.platform };
  console.error("[capture:error]", JSON.stringify(full));
}
function snapshotCaptureSession() {
  return {
    sessionId: activeCaptureRunId ?? 0,
    state: captureState,
    updatedAt: Date.now()
  };
}
function broadcastCaptureSessionState() {
  const snap = snapshotCaptureSession();
  for (const win of captureWindows) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.CAPTURE_SESSION_STATE, snap);
      }
    } catch {
    }
  }
}
function updateMaskMouseBehavior() {
  for (const win of captureWindows) {
    try {
      if (win.isDestroyed()) continue;
      if (win.__captureRole !== "mask") continue;
      win.setIgnoreMouseEvents(true, { forward: true });
    } catch {
    }
  }
  if (inputWindow && !inputWindow.isDestroyed()) {
    try {
      if (captureState === "selecting") {
        inputWindow.setIgnoreMouseEvents(false);
      } else {
        inputWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    } catch {
    }
  }
}
function transitionCaptureState(next) {
  if (captureState === next) return;
  if (!isCaptureStateTransitionAllowed(captureState, next)) {
    console.warn("[main] invalid capture state transition", captureState, "->", next);
    return;
  }
  captureState = next;
  broadcastCaptureSessionState();
  updateMaskMouseBehavior();
}
function isSessionCurrent(epoch, runId) {
  return epoch === captureEpoch && activeCaptureRunId === runId;
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
    const sessionId = activeCaptureRunId ?? 0;
    if (!sessionId) return;
    if (!inputWindow || inputWindow.isDestroyed()) return;
    try {
      inputWindow.webContents.send(IPC_CHANNELS.CAPTURE_CONFIRM_REQUEST, { sessionId });
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
function closeAllCaptureWindows(reason = "canceled") {
  captureEpoch++;
  isCaptureStarting = false;
  unregisterCaptureEnterShortcut();
  captureBackgroundPayload = null;
  captureVirtualBounds = null;
  inputWindow = null;
  if (reason === "finishing") {
    transitionCaptureState("finishing");
  } else if (reason === "canceled") {
    transitionCaptureState("canceled");
  }
  if (captureWindows.length <= 0) {
    unregisterCaptureEscShortcut();
    unregisterCaptureEnterShortcut();
    activeCaptureRunId = null;
    transitionCaptureState("idle");
    if (tray) {
      updateTrayMenu();
    }
    return;
  }
  if (isClosingCaptureWindows) return;
  isClosingCaptureWindows = true;
  for (const win of captureWindows) {
    try {
      if (!win.isDestroyed()) {
        win.close();
      }
    } catch {
    }
  }
}
function getConfigPath() {
  const userData = app.getPath("userData");
  return path.join(userData, "config.json");
}
function loadConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    try {
      const parsed = JSON.parse(raw);
      const rawHotkey = typeof parsed.hotkey === "string" ? parsed.hotkey.trim() : "";
      const maskAlpha = clampMaskAlpha(parsed.maskAlpha, 0.7);
      config = {
        configVersion: typeof parsed.configVersion === "number" ? parsed.configVersion : 1,
        hotkey: rawHotkey || "F1",
        autoSaveToFile: parsed.autoSaveToFile ?? false,
        saveDir: parsed.saveDir ?? path.join(app.getPath("pictures"), "ElectronScreenshot"),
        openEditorAfterCapture: parsed.openEditorAfterCapture ?? true,
        maskAlpha
      };
      if ((config.configVersion ?? 1) < 4) {
        config.configVersion = 4;
        saveConfig();
      }
      return;
    } catch {
    }
  }
  config = {
    configVersion: 4,
    hotkey: "F1",
    autoSaveToFile: false,
    saveDir: path.join(app.getPath("pictures"), "ElectronScreenshot"),
    openEditorAfterCapture: true,
    maskAlpha: 0.7
  };
}
function saveConfig() {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
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
      history = Array.isArray(parsed) ? parsed : [];
    } catch {
      history = [];
    }
  } else {
    history = [];
  }
}
function saveHistory() {
  const historyPath = getHistoryPath();
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
}
function createMainWindow() {
  if (mainWindow) return;
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.webContents.once("did-finish-load", () => {
    console.log("[main] settings window loaded");
  });
}
function createCaptureWindow() {
  if (isCaptureActive()) {
    console.log("[main] captureWindow already exists");
    emitCaptureError({
      sessionId: activeCaptureRunId ?? 0,
      code: CAPTURE_ERROR_CODES.ALREADY_ACTIVE,
      stage: "precheck",
      message: "capture session already active"
    });
    return;
  }
  const allDisplays = screen.getAllDisplays();
  if (allDisplays.length <= 0) {
    console.error("[main] no displays found");
    emitCaptureError({
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
        emitCaptureError({
          sessionId: 0,
          code: CAPTURE_ERROR_CODES.MACOS_SCREEN_PERMISSION,
          stage: "precheck",
          message: `screen permission not granted: ${status}`,
          details: { status }
        });
        return;
      }
    } catch (error) {
      emitCaptureError({
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
      emitCaptureError({
        sessionId: 0,
        code: CAPTURE_ERROR_CODES.LINUX_WAYLAND_LIMITATION,
        stage: "precheck",
        message: "running under Wayland may limit screen capture",
        details: { sessionType }
      });
    }
  }
  const epoch = ++captureEpoch;
  const session = ++captureRunId;
  activeCaptureRunId = session;
  isCaptureStarting = true;
  transitionCaptureState("masked");
  registerCaptureEscShortcut();
  if (tray) {
    updateTrayMenu();
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
  const screensPayload = composeMultiCaptureBackgroundPayload({ sessionId: session, displays: displayMetas, screens: [] });
  captureVirtualBounds = screensPayload.virtualBounds;
  captureBackgroundPayload = null;
  isClosingCaptureWindows = false;
  captureWindows = [];
  inputWindow = null;
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
        preload: path.join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    win.__captureRole = "mask";
    win.setMenuBarVisibility(false);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, "screen-saver");
    captureWindows.push(win);
    win.on("close", (e) => {
      if (isClosingCaptureWindows) return;
      e.preventDefault();
      closeAllCaptureWindows("canceled");
    });
    win.on("closed", () => {
      captureWindows = captureWindows.filter((w) => w !== win);
      if (captureWindows.length <= 0) {
        console.log("[main] captureWindow(s) closed");
        isClosingCaptureWindows = false;
        isCaptureStarting = false;
        activeCaptureRunId = null;
        inputWindow = null;
        captureBackgroundPayload = null;
        captureVirtualBounds = null;
        if (captureState === "masked" || captureState === "selecting") {
          transitionCaptureState("canceled");
        }
        transitionCaptureState("idle");
        unregisterCaptureEscShortcut();
        unregisterCaptureEnterShortcut();
        if (tray) updateTrayMenu();
      }
    });
    win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
      console.error("[main] maskWindow did-fail-load", errorCode, errorDescription);
      emitCaptureError({
        sessionId: session,
        code: CAPTURE_ERROR_CODES.WINDOW_LOAD_FAILED,
        stage: "mask-load",
        message: "mask window failed to load",
        details: { errorCode, errorDescription, displayId: display.id }
      });
      closeAllCaptureWindows("canceled");
    });
    win.webContents.once("did-finish-load", () => {
      try {
        const maskAlpha = clampMaskAlpha(config?.maskAlpha, 0.7);
        win.webContents.send(IPC_CHANNELS.CAPTURE_MASK_INIT, {
          sessionId: session,
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
      updateMaskMouseBehavior();
      broadcastCaptureSessionState();
    });
    if (isDev) {
      win.loadURL("http://localhost:5173/mask.html");
    } else {
      win.loadFile(path.join(__dirname, "../renderer/mask.html"));
    }
  }
  captureBackgroundPayload = screensPayload;
  enterSelectingMode();
  void (async () => {
    try {
      for (const display of displays) {
        if (!isSessionCurrent(epoch, session)) return;
        const thumbnailSize = {
          width: Math.round(display.bounds.width * display.scaleFactor),
          height: Math.round(display.bounds.height * display.scaleFactor)
        };
        let sources;
        try {
          sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
        } catch (error) {
          emitCaptureError({
            sessionId: session,
            code: CAPTURE_ERROR_CODES.DESKTOP_CAPTURER_FAILED,
            stage: "desktop-capture",
            message: "desktopCapturer.getSources failed",
            details: { displayId: display.id, error: String(error) }
          });
          throw error;
        }
        if (!isSessionCurrent(epoch, session)) return;
        if (!sources || sources.length <= 0) {
          emitCaptureError({
            sessionId: session,
            code: CAPTURE_ERROR_CODES.SOURCES_EMPTY,
            stage: "desktop-capture",
            message: "desktopCapturer returned empty sources",
            details: { displayId: display.id }
          });
          throw new Error(`empty sources displayId=${display.id}`);
        }
        const source = pickScreenSourceForDisplay(sources, display, allDisplays);
        if (!source) {
          emitCaptureError({
            sessionId: session,
            code: CAPTURE_ERROR_CODES.SOURCE_MAP_FAILED,
            stage: "map-source",
            message: "cannot map screen source for display",
            details: { displayId: display.id, sources: sources.map((s) => ({ id: s.id, name: s.name, display_id: s.display_id })) }
          });
          throw new Error(`cannot map screen source displayId=${display.id}`);
        }
        const image = source.thumbnail;
        if (image.isEmpty()) {
          emitCaptureError({
            sessionId: session,
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
    } catch (error) {
      console.error("[main] capture background error", error);
      emitCaptureError({
        sessionId: session,
        code: CAPTURE_ERROR_CODES.UNKNOWN,
        stage: "unknown",
        message: "capture background error",
        details: { error: String(error) }
      });
      closeAllCaptureWindows("canceled");
      unregisterCaptureEscShortcut();
      return;
    }
    if (!isSessionCurrent(epoch, session)) return;
    isCaptureStarting = false;
    captureBackgroundPayload = screensPayload;
    const currentInput = inputWindow;
    if (currentInput && !currentInput.isDestroyed()) {
      try {
        currentInput.webContents.send("capture:set-background", screensPayload);
      } catch {
      }
    }
    if (tray) updateTrayMenu();
  })();
}
function enterSelectingMode() {
  const sessionId = activeCaptureRunId ?? 0;
  if (!sessionId) return;
  if (inputWindow && !inputWindow.isDestroyed()) return;
  const vb = captureVirtualBounds;
  if (!vb) return;
  transitionCaptureState("selecting");
  registerCaptureEnterShortcut();
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
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.__captureRole = "input";
  inputWindow = win;
  win.setMenuBarVisibility(false);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  captureWindows.push(win);
  updateMaskMouseBehavior();
  win.on("close", (e) => {
    if (isClosingCaptureWindows) return;
    e.preventDefault();
    closeAllCaptureWindows("canceled");
  });
  win.on("closed", () => {
    captureWindows = captureWindows.filter((w) => w !== win);
    if (inputWindow === win) inputWindow = null;
    if (captureWindows.length <= 0) {
      console.log("[main] captureWindow(s) closed");
      isClosingCaptureWindows = false;
      isCaptureStarting = false;
      activeCaptureRunId = null;
      inputWindow = null;
      captureBackgroundPayload = null;
      captureVirtualBounds = null;
      if (captureState === "masked" || captureState === "selecting") {
        transitionCaptureState("canceled");
      }
      transitionCaptureState("idle");
      unregisterCaptureEscShortcut();
      unregisterCaptureEnterShortcut();
      if (tray) updateTrayMenu();
    }
  });
  win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("[main] inputWindow did-fail-load", errorCode, errorDescription);
    emitCaptureError({
      sessionId,
      code: CAPTURE_ERROR_CODES.WINDOW_LOAD_FAILED,
      stage: "input-load",
      message: "input window failed to load",
      details: { errorCode, errorDescription }
    });
    closeAllCaptureWindows("canceled");
  });
  win.webContents.once("did-finish-load", () => {
    if (captureBackgroundPayload && captureBackgroundPayload.sessionId === sessionId) {
      try {
        win.webContents.send("capture:set-background", captureBackgroundPayload);
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
    updateMaskMouseBehavior();
    broadcastCaptureSessionState();
  });
  if (isDev) {
    win.loadURL("http://localhost:5173/capture.html");
  } else {
    win.loadFile(path.join(__dirname, "../renderer/capture.html"));
  }
}
function createEditorWindow() {
  if (editorWindow) {
    editorWindow.focus();
    return;
  }
  editorWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  editorWindow.setMenuBarVisibility(false);
  if (isDev) {
    editorWindow.loadURL("http://localhost:5173/editor.html");
  } else {
    editorWindow.loadFile(path.join(__dirname, "../renderer/editor.html"));
  }
  editorWindow.on("closed", () => {
    editorWindow = null;
  });
}
function createTray() {
  if (tray) return;
  const iconPath = path.join(app.getAppPath(), "assets", "favicon.ico");
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon;
  tray = new Tray(trayIcon);
  const hotkeyText = config?.hotkey || "F1";
  tray.setToolTip(`截图助手 - 按 ${hotkeyText} 开始截图`);
  updateTrayMenu();
}
let registeredScreenshotHotkey = null;
function registerShortcuts(allowFallbackToF1 = true) {
  if (!config) return;
  const handler = () => {
    console.log("[main] global shortcut triggered", config.hotkey);
    if (!isCaptureActive()) {
      createCaptureWindow();
      return;
    }
    if (captureState === "masked") {
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
        config.hotkey = "F1";
        saveConfig();
        actualHotkey = "F1";
      }
    } catch {
    }
  }
  registeredScreenshotHotkey = ok ? actualHotkey : null;
  console.log("[main] registerShortcuts", config.hotkey, ok ? "success" : "failed");
  if (tray) {
    updateTrayMenu();
  }
  if (!ok && tray) {
    tray.displayBalloon({
      title: "快捷键注册失败",
      content: `无法注册截图快捷键：${requestedHotkey}。请检查系统是否占用该按键，或以管理员权限运行。`
    });
  }
}
function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return config;
  });
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, patch) => {
    const prev = config;
    const requestedHotkey = typeof patch.hotkey === "string" ? patch.hotkey.trim() : null;
    if (requestedHotkey !== null && requestedHotkey.length === 0) {
      throw new Error("截图快捷键不能为空");
    }
    const { hotkey: _hotkey, ...rest } = patch;
    const maskAlpha = clampMaskAlpha(rest.maskAlpha, config.maskAlpha);
    config = {
      ...config,
      ...rest,
      hotkey: requestedHotkey ?? config.hotkey,
      maskAlpha
    };
    saveConfig();
    registerShortcuts(false);
    if (registeredScreenshotHotkey === null) {
      config = prev;
      saveConfig();
      registerShortcuts(false);
      throw new Error("快捷键注册失败，可能已被系统占用");
    }
    return config;
  });
  ipcMain.handle(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, async (_event, dataUrl) => {
    let filePath = null;
    try {
      lastCaptureDataUrl = dataUrl;
      const image = nativeImage.createFromDataURL(dataUrl);
      clipboard.writeImage(image);
      if (config.autoSaveToFile) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        const dir = config.saveDir;
        await fs.promises.mkdir(dir, { recursive: true });
        const filename = `screenshot-${Date.now()}.png`;
        filePath = path.join(dir, filename);
        await fs.promises.writeFile(filePath, buffer);
        const record = {
          id: randomUUID(),
          filePath,
          createdAt: Date.now()
        };
        history.unshift(record);
        if (history.length > 100) {
          history = history.slice(0, 100);
        }
        saveHistory();
      }
      if (config.openEditorAfterCapture) {
        createEditorWindow();
        editorWindow?.webContents.send("editor:image", dataUrl);
      }
      if (isCaptureActive()) {
        transitionCaptureState("finishing");
      }
      return filePath;
    } catch (error) {
      emitCaptureError({
        sessionId: activeCaptureRunId ?? 0,
        code: CAPTURE_ERROR_CODES.SAVE_FAILED,
        stage: "save",
        message: "save image failed",
        details: { error: String(error) }
      });
      throw error;
    }
  });
  ipcMain.on(IPC_CHANNELS.CAPTURE_SESSION_REPORT, (_event, report) => {
    if (!report || typeof report !== "object") return;
    if (typeof report.sessionId !== "number") return;
    if (report.sessionId !== activeCaptureRunId) return;
    if (report.state === "masked") transitionCaptureState("masked");
    else if (report.state === "selecting") transitionCaptureState("selecting");
    else if (report.state === "finishing") transitionCaptureState("finishing");
    else if (report.state === "canceled") transitionCaptureState("canceled");
  });
  ipcMain.on(IPC_CHANNELS.CAPTURE_SELECTION_UPDATE, (_event, payload) => {
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.sessionId !== "number") return;
    if (payload.sessionId !== activeCaptureRunId) return;
    for (const win of captureWindows) {
      try {
        if (win.isDestroyed()) continue;
        if (win.__captureRole !== "mask") continue;
        win.webContents.send(IPC_CHANNELS.CAPTURE_SELECTION_BROADCAST, payload);
      } catch {
      }
    }
  });
  ipcMain.on(IPC_CHANNELS.CAPTURE_CLOSE, (_event, req) => {
    if (!req || typeof req !== "object") return;
    if (typeof req.sessionId !== "number") return;
    if (req.sessionId !== activeCaptureRunId) return;
    const reason = req.reason === "finishing" ? "finishing" : "canceled";
    closeAllCaptureWindows(reason);
  });
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () => {
    return history;
  });
  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => {
    history = [];
    saveHistory();
  });
  ipcMain.handle(IPC_CHANNELS.PIN_LAST, () => {
    if (!lastCaptureDataUrl) return;
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
          <img src="${lastCaptureDataUrl}" />
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
app.whenReady().then(() => {
  loadConfig();
  loadHistory();
  createMainWindow();
  createTray();
  registerShortcuts();
  registerIpcHandlers();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
app.on("before-quit", () => {
  isQuitting = true;
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
function updateTrayMenu() {
  if (!tray) return;
  const hotkeyText = config?.hotkey || "F1";
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
        createMainWindow();
        mainWindow?.show();
        mainWindow?.focus();
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
