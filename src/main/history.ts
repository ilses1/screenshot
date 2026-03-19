import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { ScreenshotRecord } from '../common/types'

export function getHistoryPath() {
  const userData = app.getPath('userData')
  return path.join(userData, 'history.json')
}

export function loadHistory(): ScreenshotRecord[] {
  const historyPath = getHistoryPath()
  if (fs.existsSync(historyPath)) {
    try {
      const raw = fs.readFileSync(historyPath, 'utf-8')
      const parsed = JSON.parse(raw) as ScreenshotRecord[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function saveHistory(history: ScreenshotRecord[]) {
  const historyPath = getHistoryPath()
  fs.mkdirSync(path.dirname(historyPath), { recursive: true })
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8')
}
