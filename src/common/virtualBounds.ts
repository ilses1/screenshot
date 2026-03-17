import type { CaptureBounds } from './capture'

type HasBounds = { bounds: CaptureBounds }

export function getVirtualBounds(displays: HasBounds[]): CaptureBounds {
  if (displays.length <= 0) return { x: 0, y: 0, width: 0, height: 0 }

  const first = displays[0].bounds
  return displays.reduce(
    (acc, d) => {
      const b = d.bounds
      const x1 = Math.min(acc.x, b.x)
      const y1 = Math.min(acc.y, b.y)
      const x2 = Math.max(acc.x + acc.width, b.x + b.width)
      const y2 = Math.max(acc.y + acc.height, b.y + b.height)
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
    },
    { x: first.x, y: first.y, width: first.width, height: first.height }
  )
}

