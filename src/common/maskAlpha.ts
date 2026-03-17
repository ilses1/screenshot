export function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function clampMaskAlpha(raw: unknown, fallback = 0.7) {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return clampNumber(n, 0.6, 0.8)
}
