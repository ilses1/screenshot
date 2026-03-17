import { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain, desktopCapturer, screen, clipboard, systemPreferences } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AppConfig, ScreenshotRecord } from '../common/types'
import { IPC_CHANNELS } from '../common/ipcChannels'
import { CAPTURE_ERROR_CODES } from '../common/capture'
import type { CaptureCloseRequest, CaptureErrorPayload, CaptureSelectionUpdate, CaptureSessionReport, CaptureSessionSnapshot, CaptureSessionState, CaptureSetBackgroundPayload, DisplayMetadata } from '../common/capture'
import { clampMaskAlpha } from '../common/maskAlpha'
import { composeMultiCaptureBackgroundPayload } from '../common/capturePayload'
import { isCaptureStateTransitionAllowed } from '../common/captureStateMachine'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let captureWindows: BrowserWindow[] = []
let inputWindow: BrowserWindow | null = null
let editorWindow: BrowserWindow | null = null
let captureEscShortcutRegistered = false
let captureEnterShortcutRegistered = false
let isQuitting = false
let isClosingCaptureWindows = false
let isCaptureStarting = false
let captureEpoch = 0
let captureRunId = 0
let activeCaptureRunId: number | null = null
let captureState: CaptureSessionState = 'idle'
let captureBackgroundPayload: Extract<CaptureSetBackgroundPayload, { mode: 'multi' }> | null = null
let captureVirtualBounds: { x: number; y: number; width: number; height: number } | null = null

let history: ScreenshotRecord[] = []
let lastCaptureDataUrl: string | null = null

const isDev = !app.isPackaged

let config: AppConfig
function isCaptureActive() {
  return isCaptureStarting || captureWindows.length > 0 || activeCaptureRunId !== null
}

function emitCaptureError(payload: Omit<CaptureErrorPayload, 'platform'>) {
  const full: CaptureErrorPayload = { ...payload, platform: process.platform }
  console.error('[capture:error]', JSON.stringify(full))
}

function snapshotCaptureSession(): CaptureSessionSnapshot {
  return {
    sessionId: activeCaptureRunId ?? 0,
    state: captureState,
    updatedAt: Date.now()
  }
}

function broadcastCaptureSessionState() {
  const snap = snapshotCaptureSession()
  for (const win of captureWindows) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.CAPTURE_SESSION_STATE, snap)
      }
    } catch {
    }
  }
}

function updateMaskMouseBehavior() {
  for (const win of captureWindows) {
    try {
      if (win.isDestroyed()) continue
      if ((win as any).__captureRole !== 'mask') continue
      win.setIgnoreMouseEvents(true, { forward: true })
    } catch {
    }
  }
  if (inputWindow && !inputWindow.isDestroyed()) {
    try {
      if (captureState === 'selecting') {
        inputWindow.setIgnoreMouseEvents(false)
      } else {
        inputWindow.setIgnoreMouseEvents(true, { forward: true })
      }
    } catch {
    }
  }
}

function transitionCaptureState(next: CaptureSessionState) {
  if (captureState === next) return
  if (!isCaptureStateTransitionAllowed(captureState, next)) {
    console.warn('[main] invalid capture state transition', captureState, '->', next)
    return
  }
  captureState = next
  broadcastCaptureSessionState()
  updateMaskMouseBehavior()
}

function isSessionCurrent(epoch: number, runId: number) {
  return epoch === captureEpoch && activeCaptureRunId === runId
}

function parseScreenNumber(name: string) {
  const m = name.match(/(\d+)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function pickScreenSourceForDisplay(
  sources: Electron.DesktopCapturerSource[],
  targetDisplay: Electron.Display,
  displays: Electron.Display[]
) {
  const displayId = String(targetDisplay.id)
  const byDisplayId = sources.find(s => String((s as any).display_id ?? '') === displayId)
  if (byDisplayId) return byDisplayId

  const sortedDisplays = [...displays].sort((a, b) => (a.bounds.x - b.bounds.x) || (a.bounds.y - b.bounds.y))
  const targetIndex = sortedDisplays.findIndex(d => d.id === targetDisplay.id)

  const numberedSources = sources
    .map(s => ({ s, n: parseScreenNumber(s.name) }))
    .filter((x): x is { s: Electron.DesktopCapturerSource; n: number } => typeof x.n === 'number')
    .sort((a, b) => a.n - b.n)

  if (targetIndex >= 0 && targetIndex < numberedSources.length) {
    return numberedSources[targetIndex].s
  }

  if (sources.length === 1) return sources[0]
  return null
}

function registerCaptureEscShortcut() {
  if (captureEscShortcutRegistered) return
  const ok = globalShortcut.register('Esc', () => {
    if (isCaptureActive()) {
      closeAllCaptureWindows()
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

function registerCaptureEnterShortcut() {
  if (captureEnterShortcutRegistered) return
  const ok = globalShortcut.register('Enter', () => {
    const sessionId = activeCaptureRunId ?? 0
    if (!sessionId) return
    if (!inputWindow || inputWindow.isDestroyed()) return
    try {
      inputWindow.webContents.send(IPC_CHANNELS.CAPTURE_CONFIRM_REQUEST, { sessionId })
    } catch {
    }
  })
  if (ok) captureEnterShortcutRegistered = true
}

function unregisterCaptureEnterShortcut() {
  if (!captureEnterShortcutRegistered) return
  globalShortcut.unregister('Enter')
  captureEnterShortcutRegistered = false
}

function closeAllCaptureWindows(reason: Exclude<CaptureSessionState, 'idle'> = 'canceled') {
  captureEpoch++
  isCaptureStarting = false
  unregisterCaptureEnterShortcut()
  captureBackgroundPayload = null
  captureVirtualBounds = null
  inputWindow = null
  if (reason === 'finishing') {
    transitionCaptureState('finishing')
  } else if (reason === 'canceled') {
    transitionCaptureState('canceled')
  }
  if (captureWindows.length <= 0) {
    unregisterCaptureEscShortcut()
    unregisterCaptureEnterShortcut()
    activeCaptureRunId = null
    transitionCaptureState('idle')
    if (tray) {
      updateTrayMenu()
    }
    return
  }
  if (isClosingCaptureWindows) return
  isClosingCaptureWindows = true
  for (const win of captureWindows) {
    try {
      if (!win.isDestroyed()) {
        win.close()
      }
    } catch {
    }
  }
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
      const previousHotkey = typeof parsed.hotkey === 'string' ? parsed.hotkey : ''
      const maskAlpha = clampMaskAlpha(parsed.maskAlpha, 0.7)
      config = {
        configVersion: typeof parsed.configVersion === 'number' ? parsed.configVersion : 1,
        hotkey: 'F1',
        autoSaveToFile: parsed.autoSaveToFile ?? false,
        saveDir:
          parsed.saveDir ??
          path.join(app.getPath('pictures'), 'ElectronScreenshot'),
        openEditorAfterCapture: parsed.openEditorAfterCapture ?? true,
        maskAlpha
      }

      if ((config.configVersion ?? 1) < 3) {
        config.configVersion = 3
        saveConfig()
      } else if (previousHotkey.trim() !== 'F1') {
        saveConfig()
      }
      return
    } catch {
    }
  }

  config = {
    configVersion: 3,
    hotkey: 'F1',
    autoSaveToFile: false,
    saveDir: path.join(app.getPath('pictures'), 'ElectronScreenshot'),
    openEditorAfterCapture: true,
    maskAlpha: 0.7
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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.on('close', e => {
    if (isQuitting) return
    e.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
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
  if (isCaptureActive()) {
    console.log('[main] captureWindow already exists')
    emitCaptureError({
      sessionId: activeCaptureRunId ?? 0,
      code: CAPTURE_ERROR_CODES.ALREADY_ACTIVE,
      stage: 'precheck',
      message: 'capture session already active'
    })
    return
  }

  const displays = screen.getAllDisplays()
  if (displays.length <= 0) {
    console.error('[main] no displays found')
    emitCaptureError({
      sessionId: 0,
      code: CAPTURE_ERROR_CODES.NO_DISPLAYS,
      stage: 'precheck',
      message: 'no displays found'
    })
    return
  }

  if (process.platform === 'darwin') {
    try {
      const status = systemPreferences.getMediaAccessStatus('screen')
      if (status !== 'granted') {
        emitCaptureError({
          sessionId: 0,
          code: CAPTURE_ERROR_CODES.MACOS_SCREEN_PERMISSION,
          stage: 'precheck',
          message: `screen permission not granted: ${status}`,
          details: { status }
        })
        return
      }
    } catch (error) {
      emitCaptureError({
        sessionId: 0,
        code: CAPTURE_ERROR_CODES.MACOS_SCREEN_PERMISSION,
        stage: 'precheck',
        message: 'failed to read macOS screen permission status',
        details: { error: String(error) }
      })
    }
  }

  if (process.platform === 'linux') {
    const sessionType = process.env.XDG_SESSION_TYPE
    if (typeof sessionType === 'string' && sessionType.toLowerCase() === 'wayland') {
      emitCaptureError({
        sessionId: 0,
        code: CAPTURE_ERROR_CODES.LINUX_WAYLAND_LIMITATION,
        stage: 'precheck',
        message: 'running under Wayland may limit screen capture',
        details: { sessionType }
      })
    }
  }

  const epoch = ++captureEpoch
  const session = ++captureRunId
  activeCaptureRunId = session
  isCaptureStarting = true
  transitionCaptureState('masked')
  registerCaptureEscShortcut()
  if (tray) {
    updateTrayMenu()
  }

  console.log('[main] creating capture mask windows')

  const primaryDisplay = screen.getPrimaryDisplay()
  const displayMetas: DisplayMetadata[] = displays.map(d => ({
    id: d.id,
    bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
    workArea: { x: d.workArea.x, y: d.workArea.y, width: d.workArea.width, height: d.workArea.height },
    scaleFactor: d.scaleFactor,
    rotation: d.rotation,
    isPrimary: d.id === primaryDisplay.id
  }))

  const screensPayload = composeMultiCaptureBackgroundPayload({ sessionId: session, displays: displayMetas, screens: [] })
  captureVirtualBounds = screensPayload.virtualBounds
  captureBackgroundPayload = null

  isClosingCaptureWindows = false
  captureWindows = []
  inputWindow = null

  for (const display of displays) {
    const expectedBounds = { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height }
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
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    ;(win as any).__captureRole = 'mask'
    win.setMenuBarVisibility(false)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setAlwaysOnTop(true, 'screen-saver')
    captureWindows.push(win)

    win.on('close', e => {
      if (isClosingCaptureWindows) return
      e.preventDefault()
      closeAllCaptureWindows('canceled')
    })

    win.on('closed', () => {
      captureWindows = captureWindows.filter(w => w !== win)
      if (captureWindows.length <= 0) {
        console.log('[main] captureWindow(s) closed')
        isClosingCaptureWindows = false
        isCaptureStarting = false
        activeCaptureRunId = null
        inputWindow = null
        captureBackgroundPayload = null
        captureVirtualBounds = null
        if (captureState === 'masked' || captureState === 'selecting') {
          transitionCaptureState('canceled')
        }
        transitionCaptureState('idle')
        unregisterCaptureEscShortcut()
        unregisterCaptureEnterShortcut()
        if (tray) updateTrayMenu()
      }
    })

    win.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error('[main] maskWindow did-fail-load', errorCode, errorDescription)
      emitCaptureError({
        sessionId: session,
        code: CAPTURE_ERROR_CODES.WINDOW_LOAD_FAILED,
        stage: 'mask-load',
        message: 'mask window failed to load',
        details: { errorCode, errorDescription, displayId: display.id }
      })
      closeAllCaptureWindows('canceled')
    })

    win.webContents.once('did-finish-load', () => {
      try {
        const maskAlpha = clampMaskAlpha(config?.maskAlpha, 0.7)
        win.webContents.send(IPC_CHANNELS.CAPTURE_MASK_INIT, {
          sessionId: session,
          displayId: display.id,
          displayBounds: expectedBounds,
          maskAlpha
        })
      } catch {
      }
      win.showInactive()
      try {
        const actual = win.getBounds()
        if (
          actual.x !== expectedBounds.x ||
          actual.y !== expectedBounds.y ||
          actual.width !== expectedBounds.width ||
          actual.height !== expectedBounds.height
        ) {
          console.warn('[main] mask bounds mismatch', { displayId: display.id, expectedBounds, actual, scaleFactor: display.scaleFactor })
          win.setBounds(expectedBounds, false)
        }
      } catch {
      }
      updateMaskMouseBehavior()
      broadcastCaptureSessionState()
    })

    if (isDev) {
      win.loadURL('http://localhost:5173/mask.html')
    } else {
      win.loadFile(path.join(__dirname, '../renderer/mask.html'))
    }
  }

  captureBackgroundPayload = screensPayload

  void (async () => {
    try {
      for (const display of displays) {
        if (!isSessionCurrent(epoch, session)) return
        const thumbnailSize = {
          width: Math.round(display.bounds.width * display.scaleFactor),
          height: Math.round(display.bounds.height * display.scaleFactor)
        }
        let sources: Electron.DesktopCapturerSource[]
        try {
          sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
        } catch (error) {
          emitCaptureError({
            sessionId: session,
            code: CAPTURE_ERROR_CODES.DESKTOP_CAPTURER_FAILED,
            stage: 'desktop-capture',
            message: 'desktopCapturer.getSources failed',
            details: { displayId: display.id, error: String(error) }
          })
          throw error
        }
        if (!isSessionCurrent(epoch, session)) return

        if (!sources || sources.length <= 0) {
          emitCaptureError({
            sessionId: session,
            code: CAPTURE_ERROR_CODES.SOURCES_EMPTY,
            stage: 'desktop-capture',
            message: 'desktopCapturer returned empty sources',
            details: { displayId: display.id }
          })
          throw new Error(`empty sources displayId=${display.id}`)
        }

        const source = pickScreenSourceForDisplay(sources, display, displays)
        if (!source) {
          emitCaptureError({
            sessionId: session,
            code: CAPTURE_ERROR_CODES.SOURCE_MAP_FAILED,
            stage: 'map-source',
            message: 'cannot map screen source for display',
            details: { displayId: display.id, sources: sources.map(s => ({ id: s.id, name: s.name, display_id: (s as any).display_id })) }
          })
          throw new Error(`cannot map screen source displayId=${display.id}`)
        }
        const image = source.thumbnail
        if (image.isEmpty()) {
          emitCaptureError({
            sessionId: session,
            code: CAPTURE_ERROR_CODES.THUMBNAIL_EMPTY,
            stage: 'thumbnail',
            message: 'screen thumbnail is empty',
            details: { displayId: display.id, sourceId: source.id, sourceName: source.name }
          })
          throw new Error(`empty thumbnail displayId=${display.id}`)
        }

        screensPayload.screens.push({
          displayId: display.id,
          bounds: { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height },
          scaleFactor: display.scaleFactor,
          dataUrl: image.toDataURL()
        })
      }
    } catch (error) {
      console.error('[main] capture background error', error)
      emitCaptureError({
        sessionId: session,
        code: CAPTURE_ERROR_CODES.UNKNOWN,
        stage: 'unknown',
        message: 'capture background error',
        details: { error: String(error) }
      })
      closeAllCaptureWindows('canceled')
      unregisterCaptureEscShortcut()
      return
    }

    if (!isSessionCurrent(epoch, session)) return
    isCaptureStarting = false
    captureBackgroundPayload = screensPayload

    const currentInput = inputWindow as BrowserWindow | null
    if (currentInput && !currentInput.isDestroyed()) {
      try {
        currentInput.webContents.send('capture:set-background', screensPayload)
      } catch {
      }
    }

    if (tray) updateTrayMenu()
  })()
}

function enterSelectingMode() {
  const sessionId = activeCaptureRunId ?? 0
  if (!sessionId) return
  if (inputWindow && !inputWindow.isDestroyed()) return
  const vb = captureVirtualBounds
  if (!vb) return

  transitionCaptureState('selecting')
  registerCaptureEnterShortcut()

  const expectedBounds = { x: vb.x, y: vb.y, width: vb.width, height: vb.height }
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
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  ;(win as any).__captureRole = 'input'
  inputWindow = win
  win.setMenuBarVisibility(false)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  captureWindows.push(win)
  updateMaskMouseBehavior()

  win.on('close', e => {
    if (isClosingCaptureWindows) return
    e.preventDefault()
    closeAllCaptureWindows('canceled')
  })

  win.on('closed', () => {
    captureWindows = captureWindows.filter(w => w !== win)
    if (inputWindow === win) inputWindow = null
    if (captureWindows.length <= 0) {
      console.log('[main] captureWindow(s) closed')
      isClosingCaptureWindows = false
      isCaptureStarting = false
      activeCaptureRunId = null
      inputWindow = null
      captureBackgroundPayload = null
      captureVirtualBounds = null
      if (captureState === 'masked' || captureState === 'selecting') {
        transitionCaptureState('canceled')
      }
      transitionCaptureState('idle')
      unregisterCaptureEscShortcut()
      unregisterCaptureEnterShortcut()
      if (tray) updateTrayMenu()
    }
  })

  win.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[main] inputWindow did-fail-load', errorCode, errorDescription)
    emitCaptureError({
      sessionId,
      code: CAPTURE_ERROR_CODES.WINDOW_LOAD_FAILED,
      stage: 'input-load',
      message: 'input window failed to load',
      details: { errorCode, errorDescription }
    })
    closeAllCaptureWindows('canceled')
  })

  win.webContents.once('did-finish-load', () => {
    if (captureBackgroundPayload && captureBackgroundPayload.sessionId === sessionId) {
      try {
        win.webContents.send('capture:set-background', captureBackgroundPayload)
      } catch {
      }
    }
    win.showInactive()
    try {
      const actual = win.getBounds()
      if (
        actual.x !== expectedBounds.x ||
        actual.y !== expectedBounds.y ||
        actual.width !== expectedBounds.width ||
        actual.height !== expectedBounds.height
      ) {
        console.warn('[main] input bounds mismatch', { expectedBounds, actual })
        win.setBounds(expectedBounds, false)
      }
    } catch {
    }
    updateMaskMouseBehavior()
    broadcastCaptureSessionState()
  })

  if (isDev) {
    win.loadURL('http://localhost:5173/capture.html')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/capture.html'))
  }
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

  const iconPath = path.join(app.getAppPath(), 'assets', 'favicon.ico')
  const icon = nativeImage.createFromPath(iconPath)

  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon
  tray = new Tray(trayIcon)
  const hotkeyText = 'F1'
  tray.setToolTip(`截图助手 - 按 ${hotkeyText} 开始截图`)
  updateTrayMenu()
}

function registerShortcuts() {
  globalShortcut.unregisterAll()
  if (!config) return

  if (config.hotkey !== 'F1') {
    config.hotkey = 'F1'
    saveConfig()
  }

  const handler = () => {
    console.log('[main] global shortcut triggered', config.hotkey)
    if (!isCaptureActive()) {
      createCaptureWindow()
      return
    }
    if (captureState === 'masked') {
      enterSelectingMode()
      return
    }
    closeAllCaptureWindows()
  }

  const requestedHotkey = 'F1'
  let ok = globalShortcut.register(requestedHotkey, handler)
  console.log('是否注册快捷键成功', ok, requestedHotkey)

  console.log('[main] registerShortcuts', config.hotkey, ok ? 'success' : 'failed')
  if (tray) {
    updateTrayMenu()
  }
  if (!ok && tray) {
    tray.displayBalloon({
      title: '快捷键注册失败',
      content: `无法注册截图快捷键：${requestedHotkey}。请检查系统是否占用该按键，或以管理员权限运行。`
    })
  }
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return config
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, patch: Partial<AppConfig>) => {
    const { hotkey: _hotkey, ...rest } = patch
    const maskAlpha = clampMaskAlpha((rest as any).maskAlpha, config.maskAlpha)
    config = { ...config, ...rest, hotkey: 'F1', maskAlpha }
    saveConfig()
    registerShortcuts()
    return config
  })

  ipcMain.handle(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, async (_event, dataUrl: string) => {
    if (isCaptureActive()) {
      transitionCaptureState('finishing')
    }
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

  ipcMain.on(IPC_CHANNELS.CAPTURE_SESSION_REPORT, (_event, report: CaptureSessionReport) => {
    if (!report || typeof report !== 'object') return
    if (typeof report.sessionId !== 'number') return
    if (report.sessionId !== activeCaptureRunId) return

    if (report.state === 'masked') transitionCaptureState('masked')
    else if (report.state === 'selecting') transitionCaptureState('selecting')
    else if (report.state === 'finishing') transitionCaptureState('finishing')
    else if (report.state === 'canceled') transitionCaptureState('canceled')
  })

  ipcMain.on(IPC_CHANNELS.CAPTURE_SELECTION_UPDATE, (_event, payload: CaptureSelectionUpdate) => {
    if (!payload || typeof payload !== 'object') return
    if (typeof payload.sessionId !== 'number') return
    if (payload.sessionId !== activeCaptureRunId) return
    for (const win of captureWindows) {
      try {
        if (win.isDestroyed()) continue
        if ((win as any).__captureRole !== 'mask') continue
        win.webContents.send(IPC_CHANNELS.CAPTURE_SELECTION_BROADCAST, payload)
      } catch {
      }
    }
  })

  ipcMain.on(IPC_CHANNELS.CAPTURE_CLOSE, (_event, req: CaptureCloseRequest) => {
    if (!req || typeof req !== 'object') return
    if (typeof req.sessionId !== 'number') return
    if (req.sessionId !== activeCaptureRunId) return
    const reason = req.reason === 'finishing' ? 'finishing' : 'canceled'
    closeAllCaptureWindows(reason)
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

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

function updateTrayMenu() {
  if (!tray) return
  const hotkeyText = 'F1'
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isCaptureActive() ? '结束截图' : '截图',
      click: () => {
        if (isCaptureActive()) {
          console.log('[main] tray menu click: stop capture')
          closeAllCaptureWindows()
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
