import { describe, expect, it } from 'vitest'
import { canStartCapturePure, composeMultiCaptureBackgroundPayload } from './capturePayload'
import type { CaptureScreenImage, DisplayMetadata } from './capture'

function mkDisplay(id: number, x: number, y: number, w: number, h: number, scaleFactor: number): DisplayMetadata {
  return {
    id,
    bounds: { x, y, width: w, height: h },
    workArea: { x, y, width: w, height: h },
    scaleFactor,
    rotation: 0,
    isPrimary: id === 1
  }
}

function mkScreen(display: DisplayMetadata): CaptureScreenImage {
  return {
    displayId: display.id,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
    dataUrl: `data:image/png;base64,${display.id}`
  }
}

describe('composeMultiCaptureBackgroundPayload + concurrency guard', () => {
  it('1个显示器：payload 组成正确', () => {
    const displays = [mkDisplay(1, 0, 0, 1920, 1080, 1)]
    const screens = displays.map(mkScreen)
    const payload = composeMultiCaptureBackgroundPayload({ sessionId: 100, displays, screens })
    expect(payload.mode).toBe('multi')
    expect(payload.sessionId).toBe(100)
    expect(payload.displays?.length).toBe(1)
    expect(payload.screens.length).toBe(1)
    expect(payload.virtualBounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
    expect(payload.compositeScaleFactor).toBe(1)
  })

  it('2个显示器：virtualBounds + compositeScaleFactor 正确', () => {
    const displays = [mkDisplay(1, 0, 0, 1920, 1080, 1), mkDisplay(2, 1920, 0, 2560, 1440, 1.25)]
    const screens = displays.map(mkScreen)
    const payload = composeMultiCaptureBackgroundPayload({ sessionId: 101, displays, screens })
    expect(payload.virtualBounds).toEqual({ x: 0, y: 0, width: 4480, height: 1440 })
    expect(payload.compositeScaleFactor).toBe(1.25)
    expect(payload.screens.map(s => s.displayId)).toEqual([1, 2])
  })

  it('3+个显示器：负坐标场景 payload 组成正确', () => {
    const displays = [
      mkDisplay(1, 0, 0, 1920, 1080, 1),
      mkDisplay(2, -1280, 0, 1280, 1024, 1),
      mkDisplay(3, 1920, 0, 1920, 1080, 2),
      mkDisplay(4, 0, -900, 1440, 900, 1)
    ]
    const screens = displays.map(mkScreen)
    const payload = composeMultiCaptureBackgroundPayload({ sessionId: 102, displays, screens })
    expect(payload.virtualBounds).toEqual({ x: -1280, y: -900, width: 5120, height: 1980 })
    expect(payload.compositeScaleFactor).toBe(2)
    expect(payload.displays?.map(d => d.id)).toEqual([1, 2, 3, 4])
    expect(payload.screens).toHaveLength(4)
  })

  it('并发守卫：存在活动会话时拒绝启动', () => {
    expect(
      canStartCapturePure({ isCaptureStarting: false, captureWindowsCount: 0, activeCaptureRunId: null })
    ).toBe(true)
    expect(
      canStartCapturePure({ isCaptureStarting: true, captureWindowsCount: 0, activeCaptureRunId: null })
    ).toBe(false)
    expect(
      canStartCapturePure({ isCaptureStarting: false, captureWindowsCount: 1, activeCaptureRunId: null })
    ).toBe(false)
    expect(
      canStartCapturePure({ isCaptureStarting: false, captureWindowsCount: 0, activeCaptureRunId: 123 })
    ).toBe(false)
  })
})
