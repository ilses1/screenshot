import { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain, desktopCapturer, screen, clipboard } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AppConfig, ScreenshotRecord } from '../common/types'
import { IPC_CHANNELS } from '../common/ipcChannels'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let editorWindow: BrowserWindow | null = null
let captureEscShortcutRegistered = false

let history: ScreenshotRecord[] = []
let lastCaptureDataUrl: string | null = null

const isDev = !app.isPackaged

let config: AppConfig
function isCaptureActive() {
  return !!captureWindow
}

function registerCaptureEscShortcut() {
  if (captureEscShortcutRegistered) return
  const ok = globalShortcut.register('Esc', () => {
    if (isCaptureActive()) {
      captureWindow?.close()
    }
  })
  if (ok) {
    captureEscShortcutRegistered = true
  }
}

function unregisterCaptureEscShortcut() {
  if (!captureEscShortcutRegistered) return
  globalShortcut.unregister('Esc')
  captureEscShortcutRegistered = false
}

function getConfigPath() {
  const userData = app.getPath('userData')
  return path.join(userData, 'config.json')
}

function loadConfig() {
  const configPath = getConfigPath()
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8')
    try {
      const parsed = JSON.parse(raw)
      config = {
        hotkey: parsed.hotkey ?? 'F2',
        autoSaveToFile: parsed.autoSaveToFile ?? false,
        saveDir:
          parsed.saveDir ??
          path.join(app.getPath('pictures'), 'ElectronScreenshot'),
        openEditorAfterCapture: parsed.openEditorAfterCapture ?? true
      }
      return
    } catch {
    }
  }

  config = {
    hotkey: 'F2',
    autoSaveToFile: false,
    saveDir: path.join(app.getPath('pictures'), 'ElectronScreenshot'),
    openEditorAfterCapture: true
  }
}

function saveConfig() {
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

function getHistoryPath() {
  const userData = app.getPath('userData')
  return path.join(userData, 'history.json')
}

function loadHistory() {
  const historyPath = getHistoryPath()
  if (fs.existsSync(historyPath)) {
    try {
      const raw = fs.readFileSync(historyPath, 'utf-8')
      const parsed = JSON.parse(raw) as ScreenshotRecord[]
      history = Array.isArray(parsed) ? parsed : []
    } catch {
      history = []
    }
  } else {
    history = []
  }
}

function saveHistory() {
  const historyPath = getHistoryPath()
  fs.mkdirSync(path.dirname(historyPath), { recursive: true })
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8')
}

function createMainWindow() {
  if (mainWindow) return

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[main] settings window loaded')
  })
}

function createCaptureWindow() {
  if (captureWindow) {
    console.log('[main] captureWindow already exists')
    return
  }

  // 开启截图：创建全屏透明遮罩窗口（在光标所在显示器上）
  const cursorPoint = screen.getCursorScreenPoint()
  const targetDisplay = screen.getDisplayNearestPoint(cursorPoint)

  console.log('[main] creating captureWindow')
  captureWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  captureWindow.setMenuBarVisibility(false)

  if (isDev) {
    captureWindow.loadURL('http://localhost:5173/capture.html')
  } else {
    captureWindow.loadFile(path.join(__dirname, '../renderer/capture.html'))
  }

  captureWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[main] captureWindow did-fail-load', errorCode, errorDescription)
  })

  captureWindow.webContents.once('did-finish-load', async () => {
    console.log('[main] captureWindow did-finish-load')
    if (isDev) {
      captureWindow?.webContents.openDevTools({ mode: 'detach' })
      captureWindow?.setAlwaysOnTop(false)
    }
    try {
      const thumbnailSize = {
        width: Math.round(targetDisplay.bounds.width * targetDisplay.scaleFactor),
        height: Math.round(targetDisplay.bounds.height * targetDisplay.scaleFactor)
      }

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize
      })

      const displayId = String(targetDisplay.id)
      const source =
        sources.find(s => (s as any).display_id === displayId) ??
        sources[0]

      if (!source) {
        throw new Error('no screen sources')
      }

      const image = source.thumbnail
      if (image.isEmpty()) {
        throw new Error('empty thumbnail')
      }

      captureWindow?.webContents.send('capture:set-background', {
        dataUrl: image.toDataURL(),
        displaySize: { width: targetDisplay.bounds.width, height: targetDisplay.bounds.height },
        scaleFactor: targetDisplay.scaleFactor
      })

      captureWindow?.show()
      captureWindow?.focus()
      registerCaptureEscShortcut()
    } catch (error) {
      console.error('[main] captureWindow capture error', error)
      captureWindow?.close()
      return
    }
    if (tray) {
      updateTrayMenu()
    }
  })

  captureWindow.on('closed', () => {
    console.log('[main] captureWindow closed')
    captureWindow = null
    unregisterCaptureEscShortcut()
    if (tray) {
      updateTrayMenu()
    }
  })
}

function createEditorWindow() {
  if (editorWindow) {
    editorWindow.focus()
    return
  }

  editorWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  editorWindow.setMenuBarVisibility(false)

  if (isDev) {
    editorWindow.loadURL('http://localhost:5173/editor.html')
  } else {
    editorWindow.loadFile(path.join(__dirname, '../renderer/editor.html'))
  }

  editorWindow.on('closed', () => {
    editorWindow = null
  })
}

function createTray() {
  if (tray) return

  const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon
  tray = new Tray(trayIcon)
  const hotkeyText = config?.hotkey || 'F2'
  tray.setToolTip(`截图助手 - 按 ${hotkeyText} 开始截图`)
  updateTrayMenu()
}

function registerShortcuts() {
  globalShortcut.unregisterAll()
  if (!config) return

  if (!config.hotkey || !config.hotkey.trim()) {
    config.hotkey = 'F2'
    saveConfig()
  }

  // 开启截图入口 1：全局快捷键（再次触发则关闭截图遮罩窗口）
  const handler = () => {
    console.log('[main] global shortcut triggered', config.hotkey)
    if (isCaptureActive()) {
      captureWindow?.close()
    } else {
      createCaptureWindow()
    }
  }

  let ok = globalShortcut.register(config.hotkey, handler)
  console.log("是否注册快捷键成功", ok, config.hotkey);

  if (!ok) {
    const fallbacks = ['Alt+Shift+A', 'CommandOrControl+Shift+A']
    for (const key of fallbacks) {
      if (globalShortcut.register(key, handler)) {
        config.hotkey = key
        saveConfig()
        ok = true
        break
      }
    }
  }

  console.log('[main] registerShortcuts', config.hotkey, ok ? 'success' : 'failed')
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return config
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, patch: Partial<AppConfig>) => {
    config = { ...config, ...patch }
    saveConfig()
    registerShortcuts()
    return config
  })

  ipcMain.handle(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, async (_event, dataUrl: string) => {
    lastCaptureDataUrl = dataUrl

    const image = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(image)

    let filePath: string | null = null

    if (config.autoSaveToFile) {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      const buffer = Buffer.from(base64, 'base64')
      const dir = config.saveDir

      await fs.promises.mkdir(dir, { recursive: true })
      const filename = `screenshot-${Date.now()}.png`
      filePath = path.join(dir, filename)
      await fs.promises.writeFile(filePath, buffer)

      const record: ScreenshotRecord = {
        id: randomUUID(),
        filePath,
        createdAt: Date.now()
      }

      history.unshift(record)
      if (history.length > 100) {
        history = history.slice(0, 100)
      }
      saveHistory()
    }

    if (config.openEditorAfterCapture) {
      createEditorWindow()
      editorWindow?.webContents.send('editor:image', dataUrl)
    }

    return filePath
  })

  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () => {
    return history
  })

  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => {
    history = []
    saveHistory()
  })

  ipcMain.handle(IPC_CHANNELS.PIN_LAST, () => {
    if (!lastCaptureDataUrl) return

    const pinWindow = new BrowserWindow({
      frame: false,
      transparent: true,
      resizable: true,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: '#00000000'
    })

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
    `

    pinWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  })

  ipcMain.handle('CAPTURE_GET_SOURCES', async (_event, opts) => {
    const sources = await desktopCapturer.getSources(opts)
    // 序列化 nativeImage 为 dataURL，避免传输问题
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }))
  })
}

app.whenReady().then(() => {
  loadConfig()
  loadHistory()
  createMainWindow()
  createTray()
  registerShortcuts()
  registerIpcHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

function updateTrayMenu() {
  if (!tray) return
  const hotkeyText = config?.hotkey || 'F2'
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isCaptureActive() ? '结束截图' : '截图',
      click: () => {
        // 开启截图入口 2：托盘菜单（再次点击则关闭截图遮罩窗口）
        if (isCaptureActive()) {
          console.log('[main] tray menu click: stop capture')
          captureWindow?.close()
        } else {
          console.log('[main] tray menu click: screenshot')
          createCaptureWindow()
        }
      }
    },
    {
      label: '设置',
      click: () => {
        console.log('[main] tray menu click: settings')
        createMainWindow()
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: '退出',
      click: () => {
        console.log('[main] tray menu click: quit')
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  tray.setToolTip(
    isCaptureActive()
      ? `截图助手 - 按 ${hotkeyText} 开始截图（正在截图）`
      : `截图助手 - 按 ${hotkeyText} 开始截图`
  )
}
