import { app, BrowserWindow, Tray, globalShortcut } from 'electron'
import type { AppConfig, ScreenshotRecord } from '../common/types'
import type { CaptureErrorPayload, CaptureSelectionUpdate, CaptureSetBackgroundPayload } from '../common/capture'
import { loadConfig, saveConfig } from './config'
import { loadHistory, saveHistory } from './history'
import { createShortcutsController } from './shortcuts'
import { createTray, updateTrayMenu as updateTrayMenuImpl } from './tray'
import { registerIpcHandlers } from './ipc'
import { createCaptureWindowsController, createCaptureWindowsUtilities } from './windows/captureWindows'
import { createEditorWindow } from './windows/editorWindow'
import { createMainWindow } from './windows/mainWindow'
import { createCaptureSessionController } from './capture/session'

type Ref<T> = { current: T }

const trayRef: Ref<Tray | null> = { current: null }
const mainWindowRef: Ref<BrowserWindow | null> = { current: null }
const editorWindowRef: Ref<BrowserWindow | null> = { current: null }
const captureWindowsRef: Ref<BrowserWindow[]> = { current: [] }
const inputWindowRef: Ref<BrowserWindow | null> = { current: null }
const captureBackgroundPayloadRef: Ref<Extract<CaptureSetBackgroundPayload, { mode: 'multi' }> | null> = { current: null }
const captureVirtualBoundsRef: Ref<{ x: number; y: number; width: number; height: number } | null> = { current: null }
const historyRef: Ref<ScreenshotRecord[]> = { current: [] }
const lastCaptureDataUrlRef: Ref<string | null> = { current: null }
const isQuittingRef: Ref<boolean> = { current: false }
const isClosingCaptureWindowsRef: Ref<boolean> = { current: false }
const configRef: Ref<AppConfig> = { current: null as unknown as AppConfig }

const isDev = !app.isPackaged
const baseDir = __dirname

function emitCaptureError(payload: Omit<CaptureErrorPayload, 'platform'>) {
  const full: CaptureErrorPayload = { ...payload, platform: process.platform }
  console.error('[capture:error]', JSON.stringify(full))
}

const utilities = createCaptureWindowsUtilities({ captureWindowsRef, inputWindowRef })

const session = createCaptureSessionController({
  getCaptureWindowsCount: () => captureWindowsRef.current.length,
  broadcastCaptureSessionState: utilities.broadcastCaptureSessionState,
  updateMaskMouseBehavior: utilities.updateMaskMouseBehavior
})

const captureCtrlRef: Ref<ReturnType<typeof createCaptureWindowsController> | null> = { current: null }

let updateTrayMenu = () => {
}

const ensureMainWindow = () => {
  createMainWindow({ isDev, baseDir, isQuittingRef, mainWindowRef })
}

const ensureEditorWindow = () => {
  createEditorWindow({ isDev, baseDir, editorWindowRef })
}

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
})

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
})

captureCtrlRef.current = captureCtrl

updateTrayMenu = () => {
  updateTrayMenuImpl({
    trayRef,
    configRef,
    isCaptureActive: () => session.isCaptureActive(),
    closeAllCaptureWindows: () => captureCtrl.closeAllCaptureWindows(),
    createCaptureWindow: () => captureCtrl.createCaptureWindow(),
    createMainWindow: () => ensureMainWindow(),
    mainWindowRef
  })
}

app.whenReady().then(() => {
  configRef.current = loadConfig()
  historyRef.current = loadHistory()
  ensureMainWindow()
  createTray({ trayRef, configRef, updateTrayMenu: () => updateTrayMenu() })
  shortcuts.registerShortcuts()
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
    transitionCaptureState: (next: any) => session.transitionCaptureState(next),
    getActiveCaptureRunId: () => session.getActiveRunId(),
    broadcastSelectionToMasks: (payload: CaptureSelectionUpdate) => utilities.broadcastSelectionToMasks(payload),
    handleCaptureSessionReport: report => captureCtrl.handleCaptureSessionReport(report),
    handleCaptureClose: req => captureCtrl.handleCaptureClose(req),
    emitCaptureError
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ensureMainWindow()
    }
  })
})

app.on('before-quit', () => {
  isQuittingRef.current = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
