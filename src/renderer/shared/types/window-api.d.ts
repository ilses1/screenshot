import type { AppConfig, ScreenshotRecord } from '../../../common/types'

declare global {
  interface Window {
    api: {
      ping: () => string
      getSettings: () => Promise<AppConfig>
      updateSettings: (patch: Partial<AppConfig>) => Promise<AppConfig>
      getHistory: () => Promise<ScreenshotRecord[]>
      clearHistory: () => Promise<void>
      pinLast: () => Promise<void>
    }
  }
}

export {}

