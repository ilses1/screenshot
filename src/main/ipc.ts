import { BrowserWindow, clipboard, desktopCapturer, ipcMain, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AppConfig, ScreenshotRecord } from '../common/types'
import { IPC_CHANNELS } from '../common/ipcChannels'
import { CAPTURE_ERROR_CODES } from '../common/capture'
import type { CaptureCloseRequest, CaptureErrorPayload, CaptureSelectionUpdate, CaptureSessionReport } from '../common/capture'
import { clampMaskAlpha } from '../common/maskAlpha'

type Ref<T> = { current: T }

export function registerIpcHandlers(params: {
  configRef: Ref<AppConfig>
  historyRef: Ref<ScreenshotRecord[]>
  lastCaptureDataUrlRef: Ref<string | null>
  saveConfig: (config: AppConfig) => void
  saveHistory: (history: ScreenshotRecord[]) => void
  shortcuts: {
    registerShortcuts: (allowFallbackToF1?: boolean) => void
    getRegisteredScreenshotHotkey: () => string | null
  }
  createEditorWindow: () => void
  editorWindowRef: Ref<BrowserWindow | null>
  isCaptureActive: () => boolean
  transitionCaptureState: (next: any) => void
  getActiveCaptureRunId: () => number | null
  broadcastSelectionToMasks: (payload: CaptureSelectionUpdate) => void
  handleCaptureSessionReport: (report: CaptureSessionReport) => void
  handleCaptureClose: (req: CaptureCloseRequest) => void
  emitCaptureError: (payload: Omit<CaptureErrorPayload, 'platform'>) => void
}) {
  const { configRef, historyRef, lastCaptureDataUrlRef, saveConfig, saveHistory, shortcuts, createEditorWindow, editorWindowRef, isCaptureActive, transitionCaptureState, getActiveCaptureRunId, broadcastSelectionToMasks, handleCaptureSessionReport, handleCaptureClose, emitCaptureError } = params

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return configRef.current
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, patch: Partial<AppConfig>) => {
    const prev = configRef.current
    const requestedHotkey = typeof patch.hotkey === 'string' ? patch.hotkey.trim() : null
    if (requestedHotkey !== null && requestedHotkey.length === 0) {
      throw new Error('截图快捷键不能为空')
    }

    const { hotkey: _hotkey, ...rest } = patch
    const maskAlpha = clampMaskAlpha((rest as any).maskAlpha, configRef.current.maskAlpha)
    configRef.current = {
      ...configRef.current,
      ...rest,
      hotkey: requestedHotkey ?? configRef.current.hotkey,
      maskAlpha
    }

    saveConfig(configRef.current)
    shortcuts.registerShortcuts(false)

    if (shortcuts.getRegisteredScreenshotHotkey() === null) {
      configRef.current = prev
      saveConfig(configRef.current)
      shortcuts.registerShortcuts(false)
      throw new Error('快捷键注册失败，可能已被系统占用')
    }

    return configRef.current
  })

  ipcMain.handle(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, async (_event, dataUrl: string) => {
    let filePath: string | null = null
    try {
      lastCaptureDataUrlRef.current = dataUrl

      const image = nativeImage.createFromDataURL(dataUrl)
      clipboard.writeImage(image)

      if (configRef.current.autoSaveToFile) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
        const buffer = Buffer.from(base64, 'base64')
        const dir = configRef.current.saveDir

        await fs.promises.mkdir(dir, { recursive: true })
        const filename = `screenshot-${Date.now()}.png`
        filePath = path.join(dir, filename)
        await fs.promises.writeFile(filePath, buffer)

        const record: ScreenshotRecord = {
          id: randomUUID(),
          filePath,
          createdAt: Date.now()
        }

        historyRef.current.unshift(record)
        if (historyRef.current.length > 100) {
          historyRef.current = historyRef.current.slice(0, 100)
        }
        saveHistory(historyRef.current)
      }

      if (configRef.current.openEditorAfterCapture) {
        createEditorWindow()
        editorWindowRef.current?.webContents.send('editor:image', dataUrl)
      }

      if (isCaptureActive()) {
        transitionCaptureState('finishing')
      }

      return filePath
    } catch (error) {
      emitCaptureError({
        sessionId: getActiveCaptureRunId() ?? 0,
        code: CAPTURE_ERROR_CODES.SAVE_FAILED,
        stage: 'save',
        message: 'save image failed',
        details: { error: String(error) }
      })
      throw error
    }
  })

  ipcMain.on(IPC_CHANNELS.CAPTURE_SESSION_REPORT, (_event, report: CaptureSessionReport) => {
    handleCaptureSessionReport(report)
  })

  ipcMain.on(IPC_CHANNELS.CAPTURE_SELECTION_UPDATE, (_event, payload: CaptureSelectionUpdate) => {
    if (!payload || typeof payload !== 'object') return
    if (typeof payload.sessionId !== 'number') return
    if (payload.sessionId !== getActiveCaptureRunId()) return
    broadcastSelectionToMasks(payload)
  })

  ipcMain.on(IPC_CHANNELS.CAPTURE_CLOSE, (_event, req: CaptureCloseRequest) => {
    handleCaptureClose(req)
  })

  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () => {
    return historyRef.current
  })

  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => {
    historyRef.current = []
    saveHistory(historyRef.current)
  })

  ipcMain.handle(IPC_CHANNELS.PIN_LAST, () => {
    if (!lastCaptureDataUrlRef.current) return

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
          <img src="${lastCaptureDataUrlRef.current}" />
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
