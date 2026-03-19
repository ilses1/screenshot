export type Point = { x: number; y: number }

export type Rect = { x: number; y: number; width: number; height: number }

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const w = x2 - x1
  const h = y2 - y1
  if (w <= 0 || h <= 0) return null
  return { x: x1, y: y1, width: w, height: h }
}

export function roundRectSize(width: number, height: number) {
  return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) }
}
