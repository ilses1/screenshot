export type AppConfig = {
  configVersion?: number
  hotkey: string
  autoSaveToFile: boolean
  saveDir: string
  openEditorAfterCapture: boolean
}

export type ScreenshotRecord = {
  id: string
  filePath: string
  createdAt: number
}
