import { describe, expect, it } from 'vitest'
import { clampMaskAlpha } from './maskAlpha'

describe('clampMaskAlpha', () => {
  it('区间裁剪', () => {
    expect(clampMaskAlpha(0.5)).toBe(0.6)
    expect(clampMaskAlpha(0.6)).toBe(0.6)
    expect(clampMaskAlpha(0.7)).toBe(0.7)
    expect(clampMaskAlpha(0.8)).toBe(0.8)
    expect(clampMaskAlpha(0.9)).toBe(0.8)
  })

  it('非法值回退并裁剪', () => {
    expect(clampMaskAlpha(NaN, 0.75)).toBe(0.75)
    expect(clampMaskAlpha(Infinity, 0.75)).toBe(0.75)
    expect(clampMaskAlpha(undefined, 0.75)).toBe(0.75)
    expect(clampMaskAlpha(null, 0.75)).toBe(0.75)
    expect(clampMaskAlpha('0.7', 0.75)).toBe(0.75)
    expect(clampMaskAlpha(undefined, 0.9)).toBe(0.8)
    expect(clampMaskAlpha(undefined, 0.5)).toBe(0.6)
  })
})
