import { describe, expect, it } from 'vitest'
import { getVirtualBounds } from './virtualBounds'

describe('getVirtualBounds', () => {
  it('1个显示器', () => {
    const vb = getVirtualBounds([{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }])
    expect(vb).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('2个显示器横向拼接', () => {
    const vb = getVirtualBounds([
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }
    ])
    expect(vb).toEqual({ x: 0, y: 0, width: 3840, height: 1080 })
  })

  it('3个显示器含负坐标', () => {
    const vb = getVirtualBounds([
      { bounds: { x: -1280, y: 0, width: 1280, height: 1024 } },
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { bounds: { x: 0, y: -900, width: 1440, height: 900 } }
    ])
    expect(vb).toEqual({ x: -1280, y: -900, width: 3200, height: 1980 })
  })
})
