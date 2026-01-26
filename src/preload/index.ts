import { clipboard, contextBridge, ipcRenderer, nativeImage } from 'electron'

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong',
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: any) => ipcRenderer.invoke('settings:update', patch),
  getHistory: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  pinLast: () => ipcRenderer.invoke('pin:last')
})

contextBridge.exposeInMainWorld('captureApi', {
  onSetBackground: (handler: (payload: any) => void) => {
    ipcRenderer.on('capture:set-background', (_event, payload) => {
      handler(payload)
    })
  },
  saveImageToClipboard: (dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(image)
  },
  saveImage: (dataUrl: string) => ipcRenderer.invoke('capture:save-image', dataUrl)
})

contextBridge.exposeInMainWorld('editorApi', {
  saveToClipboardAndPersist: (dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(image)
    return ipcRenderer.invoke('capture:save-image', dataUrl)
  },
  onImage: (handler: (dataUrl: string) => void) => {
    ipcRenderer.on('editor:image', (_event, dataUrl: string) => {
      handler(dataUrl)
    })
  }
})
