import { app, BrowserWindow, globalShortcut, nativeImage, Tray, ipcMain, clipboard, desktopCapturer, Menu, screen } from "electron";
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
  HISTORY_LIST: "history:list",
  HISTORY_CLEAR: "history:clear",
  PIN_LAST: "pin:last"
};
let tray = null;
let mainWindow = null;
let captureWindows = [];
let editorWindow = null;
let captureEscShortcutRegistered = false;
let isQuitting = false;
let isClosingCaptureWindows = false;
let isCaptureStarting = false;
let captureSessionId = 0;
let history = [];
let lastCaptureDataUrl = null;
const isDev = !app.isPackaged;
let config;
function isCaptureActive() {
  return isCaptureStarting || captureWindows.length > 0;
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
function closeAllCaptureWindows() {
  captureSessionId++;
  isCaptureStarting = false;
  if (captureWindows.length <= 0) {
    unregisterCaptureEscShortcut();
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
      const previousHotkey = typeof parsed.hotkey === "string" ? parsed.hotkey : "";
      config = {
        configVersion: typeof parsed.configVersion === "number" ? parsed.configVersion : 1,
        hotkey: "F1",
        autoSaveToFile: parsed.autoSaveToFile ?? false,
        saveDir: parsed.saveDir ?? path.join(app.getPath("pictures"), "ElectronScreenshot"),
        openEditorAfterCapture: parsed.openEditorAfterCapture ?? true
      };
      if ((config.configVersion ?? 1) < 2) {
        config.configVersion = 2;
        saveConfig();
      } else if (previousHotkey.trim() !== "F1") {
        saveConfig();
      }
      return;
    } catch {
    }
  }
  config = {
    configVersion: 2,
    hotkey: "F1",
    autoSaveToFile: false,
    saveDir: path.join(app.getPath("pictures"), "ElectronScreenshot"),
    openEditorAfterCapture: true
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
    return;
  }
  const displays = screen.getAllDisplays();
  if (displays.length <= 0) {
    console.error("[main] no displays found");
    return;
  }
  const session = ++captureSessionId;
  isCaptureStarting = true;
  registerCaptureEscShortcut();
  if (tray) {
    updateTrayMenu();
  }
  void (async () => {
    console.log("[main] creating captureWindow(s)");
    let payloadByDisplayId = /* @__PURE__ */ new Map();
    try {
      for (const display of displays) {
        if (session !== captureSessionId) {
          return;
        }
        const thumbnailSize = {
          width: Math.round(display.bounds.width * display.scaleFactor),
          height: Math.round(display.bounds.height * display.scaleFactor)
        };
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize
        });
        if (session !== captureSessionId) {
          return;
        }
        const source = pickScreenSourceForDisplay(sources, display, displays);
        if (!source) {
          throw new Error(`cannot map screen source displayId=${display.id}`);
        }
        const image = source.thumbnail;
        if (image.isEmpty()) {
          throw new Error(`empty thumbnail displayId=${display.id}`);
        }
        payloadByDisplayId.set(display.id, {
          dataUrl: image.toDataURL(),
          displaySize: { width: display.bounds.width, height: display.bounds.height },
          scaleFactor: display.scaleFactor
        });
      }
    } catch (error) {
      console.error("[main] captureWindow capture error", error);
      closeAllCaptureWindows();
      unregisterCaptureEscShortcut();
      return;
    }
    if (session !== captureSessionId) {
      return;
    }
    const primaryDisplay = screen.getPrimaryDisplay();
    isClosingCaptureWindows = false;
    captureWindows = [];
    isCaptureStarting = false;
    for (const display of displays) {
      const payload = payloadByDisplayId.get(display.id);
      if (!payload) continue;
      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        backgroundColor: "#00000000",
        webPreferences: {
          preload: path.join(__dirname, "../preload/index.cjs"),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      win.setMenuBarVisibility(false);
      captureWindows.push(win);
      win.on("close", (e) => {
        if (isClosingCaptureWindows) return;
        e.preventDefault();
        closeAllCaptureWindows();
      });
      win.on("closed", () => {
        captureWindows = captureWindows.filter((w) => w !== win);
        if (captureWindows.length <= 0) {
          console.log("[main] captureWindow(s) closed");
          isClosingCaptureWindows = false;
          isCaptureStarting = false;
          unregisterCaptureEscShortcut();
          if (tray) {
            updateTrayMenu();
          }
        }
      });
      win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("[main] captureWindow did-fail-load", errorCode, errorDescription);
        closeAllCaptureWindows();
      });
      win.webContents.once("did-finish-load", () => {
        if (isDev) {
          win.webContents.openDevTools({ mode: "detach" });
          win.setAlwaysOnTop(false);
        }
        win.webContents.send("capture:set-background", {
          mode: "single",
          ...payload
        });
        win.show();
        if (display.id === primaryDisplay.id) {
          win.focus();
        }
      });
      if (isDev) {
        win.loadURL("http://localhost:5173/capture.html");
      } else {
        win.loadFile(path.join(__dirname, "../renderer/capture.html"));
      }
    }
    if (tray) {
      updateTrayMenu();
    }
  })();
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
  const hotkeyText = "F1";
  tray.setToolTip(`截图助手 - 按 ${hotkeyText} 开始截图`);
  updateTrayMenu();
}
function registerShortcuts() {
  globalShortcut.unregisterAll();
  if (!config) return;
  if (config.hotkey !== "F1") {
    config.hotkey = "F1";
    saveConfig();
  }
  const handler = () => {
    console.log("[main] global shortcut triggered", config.hotkey);
    if (isCaptureActive()) {
      closeAllCaptureWindows();
    } else {
      createCaptureWindow();
    }
  };
  const requestedHotkey = "F1";
  let ok = globalShortcut.register(requestedHotkey, handler);
  console.log("是否注册快捷键成功", ok, requestedHotkey);
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
    const { hotkey: _hotkey, ...rest } = patch;
    config = { ...config, ...rest, hotkey: "F1" };
    saveConfig();
    registerShortcuts();
    return config;
  });
  ipcMain.handle(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, async (_event, dataUrl) => {
    lastCaptureDataUrl = dataUrl;
    const image = nativeImage.createFromDataURL(dataUrl);
    clipboard.writeImage(image);
    let filePath = null;
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
    return filePath;
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
  const hotkeyText = "F1";
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
