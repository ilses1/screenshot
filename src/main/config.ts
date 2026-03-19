import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { AppConfig } from '../common/types'
import { clampMaskAlpha } from '../common/maskAlpha'

export function getConfigPath() {
  const userData = app.getPath('userData')
  return path.join(userData, 'config.json')
}

export function saveConfig(config: AppConfig) {
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath()
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8')
    try {
      const parsed = JSON.parse(raw)
      const rawHotkey = typeof parsed.hotkey === 'string' ? parsed.hotkey.trim() : ''
      const maskAlpha = clampMaskAlpha(parsed.maskAlpha, 0.7)
      const next: AppConfig = {
        configVersion: typeof parsed.configVersion === 'number' ? parsed.configVersion : 1,
        hotkey: rawHotkey || 'F1',
        autoSaveToFile: parsed.autoSaveToFile ?? false,
        saveDir: parsed.saveDir ?? path.join(app.getPath('pictures'), 'ElectronScreenshot'),
        openEditorAfterCapture: parsed.openEditorAfterCapture ?? true,
        maskAlpha
      }

      if ((next.configVersion ?? 1) < 4) {
        next.configVersion = 4
        saveConfig(next)
      }
      return next
    } catch {
    }
  }

  return {
    configVersion: 4,
    hotkey: 'F1',
    autoSaveToFile: false,
    saveDir: path.join(app.getPath('pictures'), 'ElectronScreenshot'),
    openEditorAfterCapture: true,
    maskAlpha: 0.7
  }
}
