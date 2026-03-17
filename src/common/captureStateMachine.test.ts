import { describe, expect, it } from 'vitest'
import { isCaptureStateTransitionAllowed, transitionCaptureStatePure } from './captureStateMachine'
import type { CaptureSessionState } from './capture'

describe('capture state machine', () => {
  it('允许的状态迁移', () => {
    const ok: Array<[CaptureSessionState, CaptureSessionState]> = [
      ['idle', 'masked'],
      ['masked', 'selecting'],
      ['masked', 'finishing'],
      ['masked', 'canceled'],
      ['masked', 'idle'],
      ['selecting', 'masked'],
      ['selecting', 'finishing'],
      ['selecting', 'canceled'],
      ['finishing', 'idle'],
      ['canceled', 'idle']
    ]
    for (const [from, to] of ok) {
      expect(isCaptureStateTransitionAllowed(from, to)).toBe(true)
      expect(transitionCaptureStatePure(from, to)).toBe(to)
    }
  })

  it('不允许的状态迁移', () => {
    const bad: Array<[CaptureSessionState, CaptureSessionState]> = [
      ['idle', 'selecting'],
      ['idle', 'finishing'],
      ['idle', 'canceled'],
      ['selecting', 'idle'],
      ['finishing', 'masked'],
      ['canceled', 'masked']
    ]
    for (const [from, to] of bad) {
      expect(isCaptureStateTransitionAllowed(from, to)).toBe(false)
      expect(transitionCaptureStatePure(from, to)).toBe(from)
    }
  })
})
