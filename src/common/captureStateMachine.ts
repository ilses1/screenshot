import type { CaptureSessionState } from './capture'

export const CAPTURE_STATE_ALLOWED: Record<CaptureSessionState, ReadonlySet<CaptureSessionState>> = {
  idle: new Set(['masked']),
  masked: new Set(['selecting', 'finishing', 'canceled', 'idle']),
  selecting: new Set(['masked', 'finishing', 'canceled']),
  finishing: new Set(['idle']),
  canceled: new Set(['idle'])
}

export function isCaptureStateTransitionAllowed(from: CaptureSessionState, to: CaptureSessionState) {
  if (from === to) return true
  return Boolean(CAPTURE_STATE_ALLOWED[from]?.has(to))
}

export function transitionCaptureStatePure(from: CaptureSessionState, to: CaptureSessionState) {
  return isCaptureStateTransitionAllowed(from, to) ? to : from
}
