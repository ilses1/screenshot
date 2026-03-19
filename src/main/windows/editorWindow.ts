import { BrowserWindow } from 'electron'
import path from 'node:path'

type Ref<T> = { current: T }

export function createEditorWindow(params: {
  isDev: boolean
  baseDir: string
  editorWindowRef: Ref<BrowserWindow | null>
}) {
  const { isDev, baseDir, editorWindowRef } = params
  if (editorWindowRef.current) {
    editorWindowRef.current.focus()
    return
  }

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    webPreferences: {
      preload: path.join(baseDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  editorWindowRef.current = win
  win.setMenuBarVisibility(false)

  if (isDev) {
    win.loadURL('http://localhost:5173/editor.html')
  } else {
    win.loadFile(path.join(baseDir, '../renderer/editor.html'))
  }

  win.on('closed', () => {
    editorWindowRef.current = null
  })
}
