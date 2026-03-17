import { clipboard, contextBridge, ipcRenderer, nativeImage } from 'electron'
import { IPC_CHANNELS } from '../common/ipcChannels'
import type { CaptureCloseRequest, CaptureMaskInitPayload, CaptureSelectionUpdate, CaptureSessionReport, CaptureSessionSnapshot, CaptureSetBackgroundPayload } from '../common/capture'

console.log('预加载脚本已加载，clipboard 是否存在：', !!clipboard)

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong',
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (patch: any) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, patch),
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),
  pinLast: () => ipcRenderer.invoke(IPC_CHANNELS.PIN_LAST)
})

contextBridge.exposeInMainWorld('captureApi', {
  onSetBackground: (handler: (payload: CaptureSetBackgroundPayload) => void) => {
    ipcRenderer.on('capture:set-background', (_event, payload) => {
      handler(payload)
    })
  },
  onSessionState: (handler: (snapshot: CaptureSessionSnapshot) => void) => {
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_SESSION_STATE, (_event, snapshot: CaptureSessionSnapshot) => {
      handler(snapshot)
    })
  },
  reportSessionState: (report: CaptureSessionReport) => {
    ipcRenderer.send(IPC_CHANNELS.CAPTURE_SESSION_REPORT, report)
  },
  onMaskInit: (handler: (payload: CaptureMaskInitPayload) => void) => {
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_MASK_INIT, (_event, payload: CaptureMaskInitPayload) => {
      handler(payload)
    })
  },
  sendSelectionRect: (payload: CaptureSelectionUpdate) => {
    ipcRenderer.send(IPC_CHANNELS.CAPTURE_SELECTION_UPDATE, payload)
  },
  onSelectionRect: (handler: (payload: CaptureSelectionUpdate) => void) => {
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_SELECTION_BROADCAST, (_event, payload: CaptureSelectionUpdate) => {
      handler(payload)
    })
  },
  onConfirmRequest: (handler: (payload: { sessionId: number }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_CONFIRM_REQUEST, (_event, payload: { sessionId: number }) => {
      handler(payload)
    })
  },
  requestClose: (payload: CaptureCloseRequest) => {
    ipcRenderer.send(IPC_CHANNELS.CAPTURE_CLOSE, payload)
  },
  saveImageToClipboard: (dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (!clipboard || typeof clipboard.writeImage !== 'function') {
      console.error('剪贴板对象不可用，无法写入图片')
      return
    }
    clipboard.writeImage(image)
  },
  saveImage: (dataUrl: string) => ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, dataUrl)
})

contextBridge.exposeInMainWorld('editorApi', {
  saveToClipboardAndPersist: (dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (!clipboard || typeof clipboard.writeImage !== 'function') {
      console.error('剪贴板对象不可用，无法写入图片')
    } else {
      clipboard.writeImage(image)
    }
    return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SAVE_IMAGE, dataUrl)
  },
  onImage: (handler: (dataUrl: string) => void) => {
    ipcRenderer.on('editor:image', (_event, dataUrl: string) => {
      handler(dataUrl)
    })
  }
})
