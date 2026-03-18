export type CaptureBounds = { x: number; y: number; width: number; height: number }

export type DisplayMetadata = {
  id: number
  bounds: CaptureBounds
  workArea: CaptureBounds
  scaleFactor: number
  rotation: number
  isPrimary: boolean
}

export type CaptureScreenImage = {
  displayId: number
  bounds: CaptureBounds
  scaleFactor: number
  dataUrl: string
}

export type CaptureSetBackgroundPayload =
  | {
      mode?: 'single'
      sessionId: number
      dataUrl: string
      displaySize: { width: number; height: number }
      scaleFactor: number
      display?: DisplayMetadata
    }
  | {
      mode: 'multi'
      sessionId: number
      virtualBounds: CaptureBounds
      compositeScaleFactor: number
      screens: CaptureScreenImage[]
      displays?: DisplayMetadata[]
    }

export type CaptureSessionState = 'idle' | 'masked' | 'selecting' | 'finishing' | 'canceled'

export type CaptureSessionSnapshot = {
  sessionId: number
  state: CaptureSessionState
  updatedAt: number
}

export type CaptureSessionReport = {
  sessionId: number
  state: Exclude<CaptureSessionState, 'idle'>
}

export type CaptureSelectionUpdate = {
  sessionId: number
  rect: CaptureBounds | null
}

export type CaptureMaskInitPayload = {
  sessionId: number
  displayId: number
  displayBounds: CaptureBounds
  maskAlpha?: number
}

export type CaptureCloseRequest = {
  sessionId: number
  reason: Exclude<CaptureSessionState, 'idle'>
}

export const CAPTURE_ERROR_CODES = {
  ALREADY_ACTIVE: 'CAPTURE_ALREADY_ACTIVE',
  NO_DISPLAYS: 'CAPTURE_NO_DISPLAYS',
  MACOS_SCREEN_PERMISSION: 'CAPTURE_MACOS_SCREEN_PERMISSION',
  LINUX_WAYLAND_LIMITATION: 'CAPTURE_LINUX_WAYLAND_LIMITATION',
  DESKTOP_CAPTURER_FAILED: 'CAPTURE_DESKTOP_CAPTURER_FAILED',
  SOURCES_EMPTY: 'CAPTURE_SOURCES_EMPTY',
  SOURCE_MAP_FAILED: 'CAPTURE_SOURCE_MAP_FAILED',
  THUMBNAIL_EMPTY: 'CAPTURE_THUMBNAIL_EMPTY',
  WINDOW_LOAD_FAILED: 'CAPTURE_WINDOW_LOAD_FAILED',
  SAVE_FAILED: 'CAPTURE_SAVE_FAILED',
  UNKNOWN: 'CAPTURE_UNKNOWN'
} as const

export type CaptureErrorCode = (typeof CAPTURE_ERROR_CODES)[keyof typeof CAPTURE_ERROR_CODES]

export type CaptureErrorStage =
  | 'precheck'
  | 'mask-load'
  | 'input-load'
  | 'desktop-capture'
  | 'map-source'
  | 'thumbnail'
  | 'save'
  | 'cleanup'
  | 'unknown'

export type CaptureErrorPayload = {
  sessionId: number
  code: CaptureErrorCode
  stage: CaptureErrorStage
  message: string
  platform: string
  details?: Record<string, unknown>
}
