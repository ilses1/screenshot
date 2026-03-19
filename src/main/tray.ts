import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import type { AppConfig } from '../common/types'

type Ref<T> = { current: T }

export function createTray(params: {
  trayRef: Ref<Tray | null>
  configRef: Ref<AppConfig>
  updateTrayMenu: () => void
}) {
  const { trayRef, configRef, updateTrayMenu } = params
  if (trayRef.current) return

  const iconPath = path.join(app.getAppPath(), 'assets', 'favicon.ico')
  const icon = nativeImage.createFromPath(iconPath)

  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon
  trayRef.current = new Tray(trayIcon)
  const hotkeyText = configRef.current?.hotkey || 'F1'
  trayRef.current.setToolTip(`截图助手 - 按 ${hotkeyText} 开始截图`)
  updateTrayMenu()
}

export function updateTrayMenu(params: {
  trayRef: Ref<Tray | null>
  configRef: Ref<AppConfig>
  isCaptureActive: () => boolean
  closeAllCaptureWindows: () => void
  createCaptureWindow: () => void
  createMainWindow: () => void
  mainWindowRef: Ref<BrowserWindow | null>
}) {
  const { trayRef, configRef, isCaptureActive, closeAllCaptureWindows, createCaptureWindow, createMainWindow, mainWindowRef } = params
  const tray = trayRef.current
  if (!tray) return
  const hotkeyText = configRef.current?.hotkey || 'F1'
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isCaptureActive() ? '结束截图' : '截图',
      click: () => {
        if (isCaptureActive()) {
          console.log('[main] tray menu click: stop capture')
          closeAllCaptureWindows()
        } else {
          console.log('[main] tray menu click: screenshot')
          createCaptureWindow()
        }
      }
    },
    {
      label: '设置',
      click: () => {
        console.log('[main] tray menu click: settings')
        createMainWindow()
        mainWindowRef.current?.show()
        mainWindowRef.current?.focus()
      }
    },
    {
      label: '退出',
      click: () => {
        console.log('[main] tray menu click: quit')
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  tray.setToolTip(
    isCaptureActive()
      ? `截图助手 - 按 ${hotkeyText} 开始截图（正在截图）`
      : `截图助手 - 按 ${hotkeyText} 开始截图`
  )
}
