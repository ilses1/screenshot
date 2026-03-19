import { globalShortcut } from 'electron'
import type { AppConfig } from '../common/types'
import { IPC_CHANNELS } from '../common/ipcChannels'

type Ref<T> = { current: T }

export function createShortcutsController(params: {
  configRef: Ref<AppConfig>
  trayRef: Ref<Electron.Tray | null>
  saveConfig: (config: AppConfig) => void
  updateTrayMenu: () => void
  isCaptureActive: () => boolean
  createCaptureWindow: () => void
  enterSelectingMode: () => void
  closeAllCaptureWindows: () => void
  getCaptureState: () => string
  getActiveCaptureRunId: () => number | null
  getInputWindow: () => Electron.BrowserWindow | null
}) {
  const { configRef, trayRef, saveConfig, updateTrayMenu, isCaptureActive, createCaptureWindow, enterSelectingMode, closeAllCaptureWindows, getCaptureState, getActiveCaptureRunId, getInputWindow } = params

  let registeredScreenshotHotkey: string | null = null
  let captureEscShortcutRegistered = false
  let captureEnterShortcutRegistered = false

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
      const sessionId = getActiveCaptureRunId() ?? 0
      if (!sessionId) return
      const win = getInputWindow()
      if (!win || win.isDestroyed()) return
      try {
        win.webContents.send(IPC_CHANNELS.CAPTURE_CONFIRM_REQUEST, { sessionId })
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

  function registerShortcuts(allowFallbackToF1 = true) {
    const config = configRef.current
    if (!config) return

    const handler = () => {
      console.log('[main] global shortcut triggered', configRef.current.hotkey)
      if (!isCaptureActive()) {
        createCaptureWindow()
        return
      }
      if (getCaptureState() === 'masked') {
        enterSelectingMode()
        return
      }
      closeAllCaptureWindows()
    }

    const requestedHotkey = (config.hotkey || 'F1').trim() || 'F1'
    if (registeredScreenshotHotkey) {
      try {
        globalShortcut.unregister(registeredScreenshotHotkey)
      } catch {
      }
    }

    let ok = globalShortcut.register(requestedHotkey, handler)
    let actualHotkey = requestedHotkey
    console.log('是否注册快捷键成功', ok, requestedHotkey)

    if (!ok && allowFallbackToF1 && requestedHotkey !== 'F1') {
      try {
        ok = globalShortcut.register('F1', handler)
        if (ok) {
          configRef.current.hotkey = 'F1'
          saveConfig(configRef.current)
          actualHotkey = 'F1'
        }
      } catch {
      }
    }

    registeredScreenshotHotkey = ok ? actualHotkey : null
    console.log('[main] registerShortcuts', configRef.current.hotkey, ok ? 'success' : 'failed')
    if (trayRef.current) {
      updateTrayMenu()
    }
    if (!ok && trayRef.current) {
      trayRef.current.displayBalloon({
        title: '快捷键注册失败',
        content: `无法注册截图快捷键：${requestedHotkey}。请检查系统是否占用该按键，或以管理员权限运行。`
      })
    }
  }

  return {
    registerShortcuts,
    registerCaptureEscShortcut,
    unregisterCaptureEscShortcut,
    registerCaptureEnterShortcut,
    unregisterCaptureEnterShortcut,
    getRegisteredScreenshotHotkey: () => registeredScreenshotHotkey
  }
}
