import { BrowserWindow, desktopCapturer, screen, systemPreferences } from 'electron'
import path from 'node:path'
import type { AppConfig } from '../../common/types'
import { IPC_CHANNELS } from '../../common/ipcChannels'
import { CAPTURE_ERROR_CODES } from '../../common/capture'
import type { CaptureCloseRequest, CaptureErrorPayload, CaptureSelectionUpdate, CaptureSessionSnapshot, CaptureSessionState, CaptureSetBackgroundPayload, DisplayMetadata } from '../../common/capture'
import { clampMaskAlpha } from '../../common/maskAlpha'
import { composeMultiCaptureBackgroundPayload } from '../../common/capturePayload'
import { populateMultiCaptureScreens } from '../capture/background'

type Ref<T> = { current: T }

export function createCaptureWindowsUtilities(params: {
  captureWindowsRef: Ref<BrowserWindow[]>
  inputWindowRef: Ref<BrowserWindow | null>
}) {
  const { captureWindowsRef, inputWindowRef } = params

  function broadcastCaptureSessionState(snap: CaptureSessionSnapshot) {
    for (const win of captureWindowsRef.current) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.CAPTURE_SESSION_STATE, snap)
        }
      } catch {
      }
    }
  }

  function updateMaskMouseBehavior(state: CaptureSessionState) {
    for (const win of captureWindowsRef.current) {
      try {
        if (win.isDestroyed()) continue
        if ((win as any).__captureRole !== 'mask') continue
        win.setIgnoreMouseEvents(true, { forward: true })
      } catch {
      }
    }
    const input = inputWindowRef.current
    if (input && !input.isDestroyed()) {
      try {
        if (state === 'selecting') {
          input.setIgnoreMouseEvents(false)
        } else {
          input.setIgnoreMouseEvents(true, { forward: true })
        }
      } catch {
      }
    }
  }

  function broadcastSelectionToMasks(payload: CaptureSelectionUpdate) {
    for (const win of captureWindowsRef.current) {
      try {
        if (win.isDestroyed()) continue
        if ((win as any).__captureRole !== 'mask') continue
        win.webContents.send(IPC_CHANNELS.CAPTURE_SELECTION_BROADCAST, payload)
      } catch {
      }
    }
  }

  return {
    broadcastCaptureSessionState,
    updateMaskMouseBehavior,
    broadcastSelectionToMasks
  }
}

export function createCaptureWindowsController(params: {
  isDev: boolean
  baseDir: string
  configRef: Ref<AppConfig>
  trayRef: Ref<Electron.Tray | null>
  captureWindowsRef: Ref<BrowserWindow[]>
  inputWindowRef: Ref<BrowserWindow | null>
  captureBackgroundPayloadRef: Ref<Extract<CaptureSetBackgroundPayload, { mode: 'multi' }> | null>
  captureVirtualBoundsRef: Ref<{ x: number; y: number; width: number; height: number } | null>
  isClosingCaptureWindowsRef: Ref<boolean>
  session: {
    isCaptureActive: () => boolean
    snapshotCaptureSession: () => CaptureSessionSnapshot
    transitionCaptureState: (next: CaptureSessionState) => void
    bumpEpoch: () => number
    nextRunId: () => number
    isSessionCurrent: (epoch: number, runId: number) => boolean
    getActiveRunId: () => number | null
    setActiveRunId: (runId: number | null) => void
    getState: () => CaptureSessionState
    setCaptureStarting: (v: boolean) => void
  }
  shortcuts: {
    registerCaptureEscShortcut: () => void
    unregisterCaptureEscShortcut: () => void
    registerCaptureEnterShortcut: () => void
    unregisterCaptureEnterShortcut: () => void
  }
  updateTrayMenu: () => void
  emitCaptureError: (payload: Omit<CaptureErrorPayload, 'platform'>) => void
  utilities: ReturnType<typeof createCaptureWindowsUtilities>
}) {
  const { isDev, baseDir, configRef, trayRef, captureWindowsRef, inputWindowRef, captureBackgroundPayloadRef, captureVirtualBoundsRef, isClosingCaptureWindowsRef, session, shortcuts, updateTrayMenu, emitCaptureError, utilities } = params

  function closeAllCaptureWindows(reason: Exclude<CaptureSessionState, 'idle'> = 'canceled') {
    session.bumpEpoch()
    session.setCaptureStarting(false)
    shortcuts.unregisterCaptureEnterShortcut()
    captureBackgroundPayloadRef.current = null
    captureVirtualBoundsRef.current = null
    inputWindowRef.current = null
    if (reason === 'finishing') {
      session.transitionCaptureState('finishing')
    } else if (reason === 'canceled') {
      session.transitionCaptureState('canceled')
    }
    if (captureWindowsRef.current.length <= 0) {
      shortcuts.unregisterCaptureEscShortcut()
      shortcuts.unregisterCaptureEnterShortcut()
      session.setActiveRunId(null)
      session.transitionCaptureState('idle')
      if (trayRef.current) {
        updateTrayMenu()
      }
      return
    }
    if (isClosingCaptureWindowsRef.current) return
    isClosingCaptureWindowsRef.current = true
    for (const win of captureWindowsRef.current) {
      try {
        if (!win.isDestroyed()) {
          win.close()
        }
      } catch {
      }
    }
  }

  function enterSelectingMode() {
    const sessionId = session.getActiveRunId() ?? 0
    if (!sessionId) return
    if (inputWindowRef.current && !inputWindowRef.current.isDestroyed()) return
    const vb = captureVirtualBoundsRef.current
    if (!vb) return

    session.transitionCaptureState('selecting')
    shortcuts.registerCaptureEnterShortcut()

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
        preload: path.join(baseDir, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    ;(win as any).__captureRole = 'input'
    inputWindowRef.current = win
    win.setMenuBarVisibility(false)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setAlwaysOnTop(true, 'screen-saver')
    captureWindowsRef.current.push(win)
    utilities.updateMaskMouseBehavior(session.getState())

    win.on('close', e => {
      if (isClosingCaptureWindowsRef.current) return
      e.preventDefault()
      closeAllCaptureWindows('canceled')
    })

    win.on('closed', () => {
      captureWindowsRef.current = captureWindowsRef.current.filter(w => w !== win)
      if (inputWindowRef.current === win) inputWindowRef.current = null
      if (captureWindowsRef.current.length <= 0) {
        console.log('[main] captureWindow(s) closed')
        isClosingCaptureWindowsRef.current = false
        session.setCaptureStarting(false)
        session.setActiveRunId(null)
        inputWindowRef.current = null
        captureBackgroundPayloadRef.current = null
        captureVirtualBoundsRef.current = null
        if (session.getState() === 'masked' || session.getState() === 'selecting') {
          session.transitionCaptureState('canceled')
        }
        session.transitionCaptureState('idle')
        shortcuts.unregisterCaptureEscShortcut()
        shortcuts.unregisterCaptureEnterShortcut()
        if (trayRef.current) updateTrayMenu()
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
      if (captureBackgroundPayloadRef.current && captureBackgroundPayloadRef.current.sessionId === sessionId) {
        try {
          win.webContents.send('capture:set-background', captureBackgroundPayloadRef.current)
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
      utilities.updateMaskMouseBehavior(session.getState())
      utilities.broadcastCaptureSessionState(session.snapshotCaptureSession())
    })

    if (isDev) {
      win.loadURL('http://localhost:5173/capture.html')
    } else {
      win.loadFile(path.join(baseDir, '../renderer/capture.html'))
    }
  }

  function createCaptureWindow() {
    if (session.isCaptureActive()) {
      console.log('[main] captureWindow already exists')
      emitCaptureError({
        sessionId: session.getActiveRunId() ?? 0,
        code: CAPTURE_ERROR_CODES.ALREADY_ACTIVE,
        stage: 'precheck',
        message: 'capture session already active'
      })
      return
    }

    const allDisplays = screen.getAllDisplays()
    if (allDisplays.length <= 0) {
      console.error('[main] no displays found')
      emitCaptureError({
        sessionId: 0,
        code: CAPTURE_ERROR_CODES.NO_DISPLAYS,
        stage: 'precheck',
        message: 'no displays found'
      })
      return
    }

    const targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const displays = [targetDisplay]

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

    const epoch = session.bumpEpoch()
    const sessionId = session.nextRunId()
    session.setActiveRunId(sessionId)
    session.setCaptureStarting(true)
    session.transitionCaptureState('masked')
    shortcuts.registerCaptureEscShortcut()
    if (trayRef.current) {
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

    const screensPayload = composeMultiCaptureBackgroundPayload({ sessionId, displays: displayMetas, screens: [] })
    captureVirtualBoundsRef.current = screensPayload.virtualBounds
    captureBackgroundPayloadRef.current = null

    isClosingCaptureWindowsRef.current = false
    captureWindowsRef.current = []
    inputWindowRef.current = null

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
          preload: path.join(baseDir, '../preload/index.cjs'),
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      ;(win as any).__captureRole = 'mask'
      win.setMenuBarVisibility(false)
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      win.setAlwaysOnTop(true, 'screen-saver')
      captureWindowsRef.current.push(win)

      win.on('close', e => {
        if (isClosingCaptureWindowsRef.current) return
        e.preventDefault()
        closeAllCaptureWindows('canceled')
      })

      win.on('closed', () => {
        captureWindowsRef.current = captureWindowsRef.current.filter(w => w !== win)
        if (captureWindowsRef.current.length <= 0) {
          console.log('[main] captureWindow(s) closed')
          isClosingCaptureWindowsRef.current = false
          session.setCaptureStarting(false)
          session.setActiveRunId(null)
          inputWindowRef.current = null
          captureBackgroundPayloadRef.current = null
          captureVirtualBoundsRef.current = null
          if (session.getState() === 'masked' || session.getState() === 'selecting') {
            session.transitionCaptureState('canceled')
          }
          session.transitionCaptureState('idle')
          shortcuts.unregisterCaptureEscShortcut()
          shortcuts.unregisterCaptureEnterShortcut()
          if (trayRef.current) updateTrayMenu()
        }
      })

      win.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('[main] maskWindow did-fail-load', errorCode, errorDescription)
        emitCaptureError({
          sessionId,
          code: CAPTURE_ERROR_CODES.WINDOW_LOAD_FAILED,
          stage: 'mask-load',
          message: 'mask window failed to load',
          details: { errorCode, errorDescription, displayId: display.id }
        })
        closeAllCaptureWindows('canceled')
      })

      win.webContents.once('did-finish-load', () => {
        try {
          const maskAlpha = clampMaskAlpha(configRef.current?.maskAlpha, 0.7)
          win.webContents.send(IPC_CHANNELS.CAPTURE_MASK_INIT, {
            sessionId,
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
        utilities.updateMaskMouseBehavior(session.getState())
        utilities.broadcastCaptureSessionState(session.snapshotCaptureSession())
      })

      if (isDev) {
        win.loadURL('http://localhost:5173/mask.html')
      } else {
        win.loadFile(path.join(baseDir, '../renderer/mask.html'))
      }
    }

    captureBackgroundPayloadRef.current = screensPayload
    enterSelectingMode()

    void (async () => {
      try {
        await populateMultiCaptureScreens({
          epoch,
          sessionId,
          displays,
          allDisplays,
          screensPayload,
          isSessionCurrent: session.isSessionCurrent,
          desktopCapturer,
          emitCaptureError
        })
      } catch (error) {
        console.error('[main] capture background error', error)
        emitCaptureError({
          sessionId,
          code: CAPTURE_ERROR_CODES.UNKNOWN,
          stage: 'unknown',
          message: 'capture background error',
          details: { error: String(error) }
        })
        closeAllCaptureWindows('canceled')
        shortcuts.unregisterCaptureEscShortcut()
        return
      }

      if (!session.isSessionCurrent(epoch, sessionId)) return
      session.setCaptureStarting(false)
      captureBackgroundPayloadRef.current = screensPayload

      const currentInput = inputWindowRef.current as BrowserWindow | null
      if (currentInput && !currentInput.isDestroyed()) {
        try {
          currentInput.webContents.send('capture:set-background', screensPayload)
        } catch {
        }
      }

      if (trayRef.current) updateTrayMenu()
    })()
  }

  function handleCaptureSessionReport(report: any) {
    if (!report || typeof report !== 'object') return
    if (typeof report.sessionId !== 'number') return
    if (report.sessionId !== session.getActiveRunId()) return

    if (report.state === 'masked') session.transitionCaptureState('masked')
    else if (report.state === 'selecting') session.transitionCaptureState('selecting')
    else if (report.state === 'finishing') session.transitionCaptureState('finishing')
    else if (report.state === 'canceled') session.transitionCaptureState('canceled')
  }

  function handleCaptureClose(req: CaptureCloseRequest) {
    if (!req || typeof req !== 'object') return
    if (typeof req.sessionId !== 'number') return
    if (req.sessionId !== session.getActiveRunId()) return
    const reason = req.reason === 'finishing' ? 'finishing' : 'canceled'
    closeAllCaptureWindows(reason)
  }

  return {
    createCaptureWindow,
    enterSelectingMode,
    closeAllCaptureWindows,
    handleCaptureSessionReport,
    handleCaptureClose
  }
}
