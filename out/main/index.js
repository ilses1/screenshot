import { app, BrowserWindow, globalShortcut, nativeImage, Tray, Menu, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
let tray = null;
let mainWindow = null;
let captureWindow = null;
let editorWindow = null;
let history = [];
let lastCaptureDataUrl = null;
const isDev = !app.isPackaged;
let config;
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
      config = {
        hotkey: parsed.hotkey ?? "Alt+`",
        autoSaveToFile: parsed.autoSaveToFile ?? false,
        saveDir: parsed.saveDir ?? path.join(app.getPath("pictures"), "ElectronScreenshot"),
        openEditorAfterCapture: parsed.openEditorAfterCapture ?? false
      };
      return;
    } catch {
    }
  }
  config = {
    hotkey: "Alt+`",
    autoSaveToFile: false,
    saveDir: path.join(app.getPath("pictures"), "ElectronScreenshot"),
    openEditorAfterCapture: false
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
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function createCaptureWindow() {
  if (captureWindow) {
    return;
  }
  captureWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  captureWindow.setMenuBarVisibility(false);
  if (isDev) {
    captureWindow.loadURL("http://localhost:5173/capture.html");
  } else {
    captureWindow.loadFile(path.join(__dirname, "../renderer/capture.html"));
  }
  captureWindow.on("closed", () => {
    captureWindow = null;
  });
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
      nodeIntegration: true,
      contextIsolation: false
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
  const iconPath = path.join(__dirname, "../../assets/icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon;
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "截图",
      click: () => {
        createCaptureWindow();
      }
    },
    {
      label: "设置",
      click: () => {
        createMainWindow();
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setToolTip("Electron Screenshot");
  tray.setContextMenu(contextMenu);
}
function registerShortcuts() {
  globalShortcut.unregisterAll();
  if (!config?.hotkey) return;
  globalShortcut.register(config.hotkey, () => {
    createCaptureWindow();
  });
}
function registerIpcHandlers() {
  ipcMain.handle("settings:get", () => {
    return config;
  });
  ipcMain.handle("settings:update", (_event, patch) => {
    config = { ...config, ...patch };
    saveConfig();
    registerShortcuts();
    return config;
  });
  ipcMain.handle("capture:save-image", async (_event, dataUrl) => {
    lastCaptureDataUrl = dataUrl;
    if (!config.autoSaveToFile) return null;
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const dir = config.saveDir;
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = `screenshot-${Date.now()}.png`;
    const filePath = path.join(dir, filename);
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
    if (config.openEditorAfterCapture) {
      createEditorWindow();
      editorWindow?.webContents.send("editor:image", dataUrl);
    }
    return filePath;
  });
  ipcMain.handle("history:list", () => {
    return history;
  });
  ipcMain.handle("history:clear", () => {
    history = [];
    saveHistory();
  });
  ipcMain.handle("pin:last", () => {
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
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
