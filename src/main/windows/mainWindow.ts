import { BrowserWindow } from 'electron'
import path from 'node:path'

type Ref<T> = { current: T }

export function createMainWindow(params: {
  isDev: boolean
  baseDir: string
  isQuittingRef: Ref<boolean>
  mainWindowRef: Ref<BrowserWindow | null>
}) {
  const { isDev, baseDir, isQuittingRef, mainWindowRef } = params
  if (mainWindowRef.current) return

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(baseDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindowRef.current = win
  win.setMenuBarVisibility(false)
  win.on('close', e => {
    if (isQuittingRef.current) return
    e.preventDefault()
    mainWindowRef.current?.hide()
  })
  win.on('closed', () => {
    mainWindowRef.current = null
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(baseDir, '../renderer/index.html'))
  }

  win.webContents.once('did-finish-load', () => {
    console.log('[main] settings window loaded')
  })
}
