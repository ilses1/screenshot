import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { clampMaskAlpha } from '../../../common/maskAlpha'

type Rect = { x: number; y: number; width: number; height: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const w = x2 - x1
  const h = y2 - y1
  if (w <= 0 || h <= 0) return null
  return { x: x1, y: y1, width: w, height: h }
}

export function MaskApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)

  const sessionIdRef = useRef(0)
  const displayBoundsRef = useRef<Rect | null>(null)
  const selectionAbsRef = useRef<Rect | null>(null)
  const maskAlphaRef = useRef(0.7)

  const setCanvasSize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = Math.max(1, Math.round(window.innerWidth))
    const h = Math.max(1, Math.round(window.innerHeight))
    canvas.width = w
    canvas.height = h
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    ctxRef.current = canvas.getContext('2d')
    setCanvasSize()
    window.addEventListener('resize', setCanvasSize)
    return () => window.removeEventListener('resize', setCanvasSize)
  }, [setCanvasSize])

  useEffect(() => {
    const applyInit = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const sessionId = typeof (payload as any).sessionId === 'number' ? ((payload as any).sessionId as number) : 0
      const b = (payload as any).displayBounds
      if (!sessionId || !b) return
      if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.width !== 'number' || typeof b.height !== 'number') return
      sessionIdRef.current = sessionId
      displayBoundsRef.current = { x: b.x, y: b.y, width: b.width, height: b.height }
      maskAlphaRef.current = clampMaskAlpha((payload as any).maskAlpha, 0.7)
    }

    const applyRect = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const sessionId = typeof (payload as any).sessionId === 'number' ? ((payload as any).sessionId as number) : 0
      if (!sessionId || sessionId !== sessionIdRef.current) return
      const r = (payload as any).rect
      if (!r) {
        selectionAbsRef.current = null
        return
      }
      if (typeof r.x !== 'number' || typeof r.y !== 'number' || typeof r.width !== 'number' || typeof r.height !== 'number') return
      selectionAbsRef.current = { x: r.x, y: r.y, width: r.width, height: r.height }
    }

    let lastInitSeq = 0
    let lastSelectionSeq = 0

    const syncFromBuffered = () => {
      const initSeq = typeof window.__maskInitSeq === 'number' ? window.__maskInitSeq : 0
      if (initSeq && initSeq !== lastInitSeq) {
        lastInitSeq = initSeq
        applyInit(window.__maskInitPayload)
      }

      const selectionSeq = typeof window.__maskSelectionSeq === 'number' ? window.__maskSelectionSeq : 0
      if (selectionSeq && selectionSeq !== lastSelectionSeq) {
        lastSelectionSeq = selectionSeq
        applyRect(window.__maskSelectionPayload)
      }
    }

    const onInitEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { payload?: unknown } | undefined
      applyInit(detail?.payload)
    }

    const onSelectionEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { payload?: unknown } | undefined
      applyRect(detail?.payload)
    }

    syncFromBuffered()
    window.addEventListener('mask:init', onInitEvent as EventListener)
    window.addEventListener('mask:selection', onSelectionEvent as EventListener)
    syncFromBuffered()
    return () => {
      window.removeEventListener('mask:init', onInitEvent as EventListener)
      window.removeEventListener('mask:selection', onSelectionEvent as EventListener)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = `rgba(0,0,0,${maskAlphaRef.current})`
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const bounds = displayBoundsRef.current
        const abs = selectionAbsRef.current
        if (bounds && abs) {
          const hit = intersect(abs, bounds)
          if (hit) {
            const local = { x: hit.x - bounds.x, y: hit.y - bounds.y, width: hit.width, height: hit.height }
            const x = clamp(local.x, 0, canvas.width)
            const y = clamp(local.y, 0, canvas.height)
            const w = clamp(local.width, 0, canvas.width - x)
            const h = clamp(local.height, 0, canvas.height - y)

            if (w > 0 && h > 0) {
              ctx.save()
              ctx.globalCompositeOperation = 'destination-out'
              ctx.fillRect(x, y, w, h)
              ctx.restore()

              ctx.save()
              ctx.strokeStyle = '#3b82f6'
              ctx.lineWidth = 2
              ctx.strokeRect(x + 0.5, y + 0.5, w, h)
              ctx.restore()

              const labelText = `${Math.round(abs.width)} × ${Math.round(abs.height)}`
              ctx.save()
              ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
              ctx.textBaseline = 'alphabetic'
              const paddingX = 6
              const paddingY = 4
              const metrics = ctx.measureText(labelText)
              const boxW = Math.ceil(metrics.width + paddingX * 2)
              const boxH = Math.ceil(12 + paddingY * 2)
              let boxX = clamp(x, 0, canvas.width - boxW)
              let boxY = y - boxH - 8
              if (boxY < 0) boxY = y + 8
              boxY = clamp(boxY, 0, canvas.height - boxH)
              ctx.fillStyle = 'rgba(15, 23, 42, 0.86)'
              ctx.fillRect(boxX, boxY, boxW, boxH)
              ctx.fillStyle = '#f9fafb'
              ctx.fillText(labelText, boxX + paddingX, boxY + boxH - paddingY - 2)
              ctx.restore()
            }
          }
        }
      }
      raf = window.requestAnimationFrame(draw)
    }
    raf = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(raf)
  }, [])

  const canvasStyle = useMemo<React.CSSProperties>(() => {
    return { display: 'block' }
  }, [])

  return <canvas ref={canvasRef} style={canvasStyle} />
}
