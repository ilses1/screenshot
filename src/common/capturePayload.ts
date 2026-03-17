import type { CaptureScreenImage, CaptureSetBackgroundPayload, DisplayMetadata } from './capture'
import { getVirtualBounds } from './virtualBounds'

export function computeCompositeScaleFactor(displays: { scaleFactor: number }[]) {
  const factors = displays.map(d => d.scaleFactor).filter(n => Number.isFinite(n))
  return Math.max(1, ...factors)
}

export function composeMultiCaptureBackgroundPayload(params: {
  sessionId: number
  displays: DisplayMetadata[]
  screens: CaptureScreenImage[]
}): Extract<CaptureSetBackgroundPayload, { mode: 'multi' }> {
  const { sessionId, displays, screens } = params
  return {
    mode: 'multi',
    sessionId,
    virtualBounds: getVirtualBounds(displays),
    compositeScaleFactor: computeCompositeScaleFactor(displays),
    screens,
    displays
  }
}

export type CaptureConcurrencySnapshot = {
  isCaptureStarting: boolean
  captureWindowsCount: number
  activeCaptureRunId: number | null
}

export function isCaptureActivePure(snapshot: CaptureConcurrencySnapshot) {
  return snapshot.isCaptureStarting || snapshot.captureWindowsCount > 0 || snapshot.activeCaptureRunId !== null
}

export function canStartCapturePure(snapshot: CaptureConcurrencySnapshot) {
  return !isCaptureActivePure(snapshot)
}
