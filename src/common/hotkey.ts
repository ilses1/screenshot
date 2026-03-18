export type KeydownLike = {
  key: string
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
}

export type HotkeyPlatform = 'mac' | 'win'

function isModifierKey(key: string) {
  return key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta'
}

function toAcceleratorKey(key: string) {
  if (!key) return null
  if (/^F\d{1,2}$/i.test(key)) return key.toUpperCase()
  if (key.length === 1) {
    const ch = key.toUpperCase()
    if (/^[A-Z0-9]$/.test(ch)) return ch
  }
  if (key === ' ') return 'Space'
  if (key === 'Escape') return 'Esc'
  if (key === 'Tab') return 'Tab'
  if (key === 'Enter') return 'Enter'
  if (key === 'Backspace') return 'Backspace'
  if (key === 'Delete') return 'Delete'
  if (key === 'Insert') return 'Insert'
  if (key === 'Home') return 'Home'
  if (key === 'End') return 'End'
  if (key === 'PageUp') return 'PageUp'
  if (key === 'PageDown') return 'PageDown'
  if (key === 'ArrowUp') return 'Up'
  if (key === 'ArrowDown') return 'Down'
  if (key === 'ArrowLeft') return 'Left'
  if (key === 'ArrowRight') return 'Right'
  if (key === 'PrintScreen') return 'PrintScreen'
  return null
}

export function toAcceleratorFromKeydownLike(e: KeydownLike, platform: HotkeyPlatform) {
  if (isModifierKey(e.key)) return null
  const mainKey = toAcceleratorKey(e.key)
  if (!mainKey) return null

  const modifiers: string[] = []
  if (e.ctrlKey) modifiers.push('Ctrl')
  if (e.altKey) modifiers.push(platform === 'mac' ? 'Option' : 'Alt')
  if (e.shiftKey) modifiers.push('Shift')
  if (e.metaKey) modifiers.push(platform === 'mac' ? 'Command' : 'Super')

  const allowSingleKey = /^F\d{1,2}$/.test(mainKey) || mainKey === 'PrintScreen'
  if (!allowSingleKey && modifiers.length === 0) return null

  return [...modifiers, mainKey].join('+')
}

