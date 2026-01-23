import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong',
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: any) => ipcRenderer.invoke('settings:update', patch),
  getHistory: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  pinLast: () => ipcRenderer.invoke('pin:last')
})
