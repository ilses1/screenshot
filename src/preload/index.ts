import { clipboard, contextBridge, ipcRenderer, nativeImage } from 'electron'

console.log('预加载脚本已加载，clipboard 是否存在：', !!clipboard)

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
    if (!clipboard || typeof clipboard.writeImage !== 'function') {
      console.error('剪贴板对象不可用，无法写入图片')
      return
    }
    clipboard.writeImage(image)
  },
  saveImage: (dataUrl: string) => ipcRenderer.invoke('capture:save-image', dataUrl)
})

contextBridge.exposeInMainWorld('editorApi', {
  saveToClipboardAndPersist: (dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (!clipboard || typeof clipboard.writeImage !== 'function') {
      console.error('剪贴板对象不可用，无法写入图片')
    } else {
      clipboard.writeImage(image)
    }
    return ipcRenderer.invoke('capture:save-image', dataUrl)
  },
  onImage: (handler: (dataUrl: string) => void) => {
    ipcRenderer.on('editor:image', (_event, dataUrl: string) => {
      handler(dataUrl)
    })
  }
})
