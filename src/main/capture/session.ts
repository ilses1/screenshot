import type { CaptureSessionSnapshot, CaptureSessionState } from '../../common/capture'
import { isCaptureStateTransitionAllowed } from '../../common/captureStateMachine'

type Deps = {
  getCaptureWindowsCount: () => number
  broadcastCaptureSessionState: (snap: CaptureSessionSnapshot) => void
  updateMaskMouseBehavior: (state: CaptureSessionState) => void
}

export function createCaptureSessionController(deps: Deps) {
  let captureEpoch = 0
  let captureRunId = 0
  let activeCaptureRunId: number | null = null
  let captureState: CaptureSessionState = 'idle'
  let isCaptureStarting = false

  function isCaptureActive() {
    return isCaptureStarting || deps.getCaptureWindowsCount() > 0 || activeCaptureRunId !== null
  }

  function snapshotCaptureSession(): CaptureSessionSnapshot {
    return {
      sessionId: activeCaptureRunId ?? 0,
      state: captureState,
      updatedAt: Date.now()
    }
  }

  function transitionCaptureState(next: CaptureSessionState) {
    if (captureState === next) return
    if (!isCaptureStateTransitionAllowed(captureState, next)) {
      console.warn('[main] invalid capture state transition', captureState, '->', next)
      return
    }
    captureState = next
    deps.broadcastCaptureSessionState(snapshotCaptureSession())
    deps.updateMaskMouseBehavior(captureState)
  }

  function bumpEpoch() {
    captureEpoch++
    return captureEpoch
  }

  function nextRunId() {
    captureRunId++
    return captureRunId
  }

  function isSessionCurrent(epoch: number, runId: number) {
    return epoch === captureEpoch && activeCaptureRunId === runId
  }

  return {
    isCaptureActive,
    snapshotCaptureSession,
    transitionCaptureState,
    bumpEpoch,
    nextRunId,
    isSessionCurrent,
    getEpoch: () => captureEpoch,
    getActiveRunId: () => activeCaptureRunId,
    setActiveRunId: (runId: number | null) => {
      activeCaptureRunId = runId
    },
    getState: () => captureState,
    setCaptureStarting: (v: boolean) => {
      isCaptureStarting = v
    }
  }
}
