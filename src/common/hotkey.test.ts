import { describe, expect, it } from 'vitest'
import { toAcceleratorFromKeydownLike } from './hotkey'

describe('toAcceleratorFromKeydownLike', () => {
  it('组合键转换（Windows）', () => {
    expect(
      toAcceleratorFromKeydownLike(
        { key: 'a', ctrlKey: true, shiftKey: true },
        'win'
      )
    ).toBe('Ctrl+Shift+A')
  })

  it('组合键转换（macOS）', () => {
    expect(
      toAcceleratorFromKeydownLike(
        { key: 'a', altKey: true, metaKey: true },
        'mac'
      )
    ).toBe('Option+Command+A')
  })

  it('仅修饰键不产生结果', () => {
    expect(toAcceleratorFromKeydownLike({ key: 'Shift', shiftKey: true }, 'win')).toBeNull()
    expect(toAcceleratorFromKeydownLike({ key: 'Control', ctrlKey: true }, 'win')).toBeNull()
  })

  it('无修饰键的普通键不产生结果', () => {
    expect(toAcceleratorFromKeydownLike({ key: 'a' }, 'win')).toBeNull()
    expect(toAcceleratorFromKeydownLike({ key: 'Enter' }, 'win')).toBeNull()
  })

  it('功能键允许单键', () => {
    expect(toAcceleratorFromKeydownLike({ key: 'F1' }, 'win')).toBe('F1')
    expect(toAcceleratorFromKeydownLike({ key: 'f12' }, 'win')).toBe('F12')
  })

  it('方向键映射', () => {
    expect(toAcceleratorFromKeydownLike({ key: 'ArrowUp', ctrlKey: true }, 'win')).toBe('Ctrl+Up')
  })
})

