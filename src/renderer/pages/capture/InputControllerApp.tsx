import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load image failed'))
    img.src = dataUrl
  })
}

export function InputControllerApp() {
  const sessionIdRef = useRef(0)
  const virtualBoundsRef = useRef<Rect | null>(null)
  const scaleFactorRef = useRef(1)
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const backgroundReadyRef = useRef(false)

  const isSelectingRef = useRef(false)
  const isPendingConfirmRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const broadcastRafRef = useRef<number | null>(null)
  const lastBroadcastRectRef = useRef<Rect | null>(null)

  const startRef = useRef<Point>({ x: 0, y: 0 })
  const currentRef = useRef<Point>({ x: 0, y: 0 })

  const [tipText, setTipText] = useState('按住左键拖动选择区域，松开后点击✓确认，Esc/右键取消')
  const lastTipRef = useRef('')

  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [toolbarPos, setToolbarPos] = useState<{ left: number; top: number }>({ left: 12, top: 12 })

  const reportSessionState = useCallback((state: 'masked' | 'selecting' | 'finishing' | 'canceled') => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    try {
      window.captureApi?.reportSessionState?.({ sessionId, state } as any)
    } catch {
    }
  }, [])

  const getSelectionRect = useCallback((): Rect => {
    const start = startRef.current
    const current = currentRef.current
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const width = Math.abs(current.x - start.x)
    const height = Math.abs(current.y - start.y)
    return { x, y, width, height }
  }, [])

  const getAbsRect = useCallback((rect: Rect): Rect | null => {
    const vb = virtualBoundsRef.current
    if (!vb) return null
    return { x: vb.x + rect.x, y: vb.y + rect.y, width: rect.width, height: rect.height }
  }, [])

  const sendSelectionRect = useCallback((rect: Rect | null) => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    try {
      window.captureApi?.sendSelectionRect?.({ sessionId, rect } as any)
    } catch {
    }
  }, [])

  const stopBroadcastLoop = useCallback(() => {
    if (broadcastRafRef.current !== null) {
      window.cancelAnimationFrame(broadcastRafRef.current)
      broadcastRafRef.current = null
    }
    lastBroadcastRectRef.current = null
  }, [])

  const startBroadcastLoop = useCallback(() => {
    if (broadcastRafRef.current !== null) return
    const tick = () => {
      if (!isSelectingRef.current) {
        broadcastRafRef.current = null
        lastBroadcastRectRef.current = null
        return
      }
      const rect = getSelectionRect()
      const abs = getAbsRect(rect)
      if (abs) {
        const last = lastBroadcastRectRef.current
        if (!last || last.x !== abs.x || last.y !== abs.y || last.width !== abs.width || last.height !== abs.height) {
          lastBroadcastRectRef.current = abs
          sendSelectionRect(abs)
        }
      }
      broadcastRafRef.current = window.requestAnimationFrame(tick)
    }
    broadcastRafRef.current = window.requestAnimationFrame(tick)
  }, [getAbsRect, getSelectionRect, sendSelectionRect])

  const updateTip = useCallback((rect?: Rect) => {
    const r = rect ?? getSelectionRect()
    const next =
      isPendingConfirmRef.current
        ? `区域：${Math.round(r.width)} × ${Math.round(r.height)}（点击✓确认，Esc/右键取消）`
        : `区域：${Math.round(r.width)} × ${Math.round(r.height)}（Esc/右键取消）`
    if (lastTipRef.current !== next) {
      lastTipRef.current = next
      setTipText(next)
    }
  }, [getSelectionRect])

  const resetTip = useCallback(() => {
    const next = '按住左键拖动选择区域，松开后点击✓确认，Esc/右键取消'
    if (lastTipRef.current !== next) {
      lastTipRef.current = next
      setTipText(next)
    }
  }, [])

  const positionToolbarToSelection = useCallback(() => {
    const rect = getSelectionRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const left = rect.x
    const top = rect.y
    const right = rect.x + rect.width
    const bottom = rect.y + rect.height

    const toolbarWidth = 80
    const toolbarHeight = 36
    const viewportPadding = 12
    const offset = 8

    let targetLeft = right - toolbarWidth
    let targetTop = bottom + offset

    if (targetTop + toolbarHeight > window.innerHeight - viewportPadding) {
      targetTop = top - toolbarHeight - offset
    }

    targetLeft = clamp(targetLeft, viewportPadding, window.innerWidth - viewportPadding - toolbarWidth)
    targetTop = clamp(targetTop, viewportPadding, window.innerHeight - viewportPadding - toolbarHeight)
    setToolbarPos({ left: Math.round(targetLeft), top: Math.round(targetTop) })
  }, [getSelectionRect])

  const endSelection = useCallback(() => {
    if (!isSelectingRef.current) return
    stopBroadcastLoop()
    isSelectingRef.current = false
    activePointerIdRef.current = null

    const rect = getSelectionRect()
    if (rect.width < 5 || rect.height < 5) {
      isPendingConfirmRef.current = false
      setToolbarVisible(false)
      resetTip()
      sendSelectionRect(null)
      return
    }

    isPendingConfirmRef.current = true
    setToolbarVisible(true)
    positionToolbarToSelection()
    updateTip(rect)

    const abs = getAbsRect(rect)
    if (abs) sendSelectionRect(abs)
  }, [getAbsRect, getSelectionRect, positionToolbarToSelection, resetTip, sendSelectionRect, stopBroadcastLoop, updateTip])

  const cropAndSave = useCallback(async () => {
    if (!backgroundReadyRef.current) return
    const composite = compositeCanvasRef.current
    if (!composite) return
    const rect = getSelectionRect()
    if (rect.width < 5 || rect.height < 5) return

    const sf = scaleFactorRef.current
    const sx = Math.round(rect.x * sf)
    const sy = Math.round(rect.y * sf)
    const sw = Math.max(1, Math.round(rect.width * sf))
    const sh = Math.max(1, Math.round(rect.height * sf))

    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const octx = out.getContext('2d')
    if (!octx) return
    octx.drawImage(composite, sx, sy, sw, sh, 0, 0, sw, sh)
    const dataUrl = out.toDataURL('image/png')

    window.captureApi.saveImageToClipboard(dataUrl)
    await window.captureApi.saveImage(dataUrl).catch(() => {})
  }, [getSelectionRect])

  const onConfirm = useCallback(() => {
    if (!isPendingConfirmRef.current) return
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    if (!backgroundReadyRef.current) return
    setToolbarVisible(false)
    reportSessionState('finishing')
    void cropAndSave().finally(() => {
      try {
        window.captureApi?.requestClose?.({ sessionId, reason: 'finishing' } as any)
      } catch {
      }
    })
  }, [cropAndSave, reportSessionState])

  const onCancel = useCallback(() => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    stopBroadcastLoop()
    isSelectingRef.current = false
    reportSessionState('canceled')
    try {
      sendSelectionRect(null)
      window.captureApi?.requestClose?.({ sessionId, reason: 'canceled' } as any)
    } catch {
    }
  }, [reportSessionState, sendSelectionRect, stopBroadcastLoop])

  const getPoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    return { x: clamp(event.clientX, 0, window.innerWidth), y: clamp(event.clientY, 0, window.innerHeight) }
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.button !== 0) return
    event.preventDefault()

    isPendingConfirmRef.current = false
    setToolbarVisible(false)
    isSelectingRef.current = true
    activePointerIdRef.current = event.pointerId

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
    }

    const p = getPoint(event)
    startRef.current = p
    currentRef.current = p
    reportSessionState('selecting')
    startBroadcastLoop()

    const rect = getSelectionRect()
    const abs = getAbsRect(rect)
    if (abs) sendSelectionRect(abs)
  }, [getAbsRect, getPoint, getSelectionRect, onCancel, reportSessionState, sendSelectionRect, startBroadcastLoop])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingRef.current) return
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return
    event.preventDefault()
    currentRef.current = getPoint(event)
    const rect = getSelectionRect()
    updateTip(rect)
    const abs = getAbsRect(rect)
    if (abs) sendSelectionRect(abs)
  }, [getAbsRect, getPoint, getSelectionRect, sendSelectionRect, updateTip])

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingRef.current) return
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
    }
    endSelection()
  }, [endSelection])

  const onPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingRef.current) return
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
    }
    stopBroadcastLoop()
    onCancel()
  }, [onCancel, stopBroadcastLoop])

  const onContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    onCancel()
  }, [onCancel])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
      if (event.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, onConfirm])

  useEffect(() => {
    const onConfirmReq = (payload: any) => {
      const sessionId = typeof payload?.sessionId === 'number' ? payload.sessionId : 0
      if (!sessionId || sessionId !== sessionIdRef.current) return
      onConfirm()
    }
    try {
      window.captureApi?.onConfirmRequest?.(onConfirmReq)
    } catch {
    }
  }, [onConfirm])

  useEffect(() => {
    const applyPayload = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const mode = (payload as any).mode
      const sessionId = typeof (payload as any).sessionId === 'number' ? ((payload as any).sessionId as number) : 0
      if (sessionId) sessionIdRef.current = sessionId

      if (mode !== 'multi') return
      const vb = (payload as any).virtualBounds
      const sf = (payload as any).compositeScaleFactor
      const screens = (payload as any).screens
      if (!vb || !screens || !Array.isArray(screens)) return
      if (typeof vb.x !== 'number' || typeof vb.y !== 'number' || typeof vb.width !== 'number' || typeof vb.height !== 'number') return
      virtualBoundsRef.current = { x: vb.x, y: vb.y, width: vb.width, height: vb.height }
      scaleFactorRef.current = typeof sf === 'number' && Number.isFinite(sf) && sf > 0 ? sf : 1

      if (screens.length <= 0) {
        backgroundReadyRef.current = false
        compositeCanvasRef.current = null
        const next = '正在准备截图...'
        if (lastTipRef.current !== next) {
          lastTipRef.current = next
          setTipText(next)
        }
        return
      }

      backgroundReadyRef.current = false
      void (async () => {
        try {
          const canvas = document.createElement('canvas')
          const sff = scaleFactorRef.current
          canvas.width = Math.max(1, Math.round(vb.width * sff))
          canvas.height = Math.max(1, Math.round(vb.height * sff))
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          for (const s of screens) {
            const dataUrl = s?.dataUrl
            if (typeof dataUrl !== 'string' || !dataUrl) continue
            const b = s?.bounds
            if (!b || typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.width !== 'number' || typeof b.height !== 'number') continue
            const img = await loadImage(dataUrl)
            const dx = Math.round((b.x - vb.x) * sff)
            const dy = Math.round((b.y - vb.y) * sff)
            const dw = Math.round(b.width * sff)
            const dh = Math.round(b.height * sff)
            ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh)
          }

          compositeCanvasRef.current = canvas
          backgroundReadyRef.current = true
          resetTip()
        } catch {
        }
      })()
    }

    const syncFromBufferedPayload = () => {
      const seq = typeof (window as any).__captureBgSeq === 'number' ? ((window as any).__captureBgSeq as number) : 0
      const payload = (window as any).__captureBgPayload as unknown
      const last = (window as any).__captureBgLastSeq as number | undefined
      if (seq && seq !== last) {
        ;(window as any).__captureBgLastSeq = seq
        applyPayload(payload)
      }
    }

    const onBufferedEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { payload?: unknown } | undefined
      applyPayload(detail?.payload)
    }

    syncFromBufferedPayload()
    window.addEventListener('capture:set-background', onBufferedEvent as EventListener)
    syncFromBufferedPayload()
    return () => window.removeEventListener('capture:set-background', onBufferedEvent as EventListener)
  }, [resetTip])

  useEffect(() => {
    return () => {
      try {
        stopBroadcastLoop()
        sendSelectionRect(null)
      } catch {
      }
    }
  }, [sendSelectionRect, stopBroadcastLoop])

  const rootStyle = useMemo<React.CSSProperties>(() => {
    return { position: 'fixed', inset: 0, background: 'transparent', outline: 'none' }
  }, [])

  const tipStyle = useMemo<React.CSSProperties>(() => {
    return {
      position: 'fixed',
      top: 12,
      left: 12,
      padding: '6px 10px',
      background: 'rgba(0, 0, 0, 0.6)',
      color: '#f9fafb',
      fontSize: 12,
      borderRadius: 4,
      zIndex: 10,
      pointerEvents: 'none',
      userSelect: 'none'
    }
  }, [])

  const toolbarStyle = useMemo<React.CSSProperties>(() => {
    return {
      position: 'fixed',
      left: toolbarPos.left,
      top: toolbarPos.top,
      display: toolbarVisible ? 'flex' : 'none',
      gap: 8,
      zIndex: 20,
      pointerEvents: 'auto',
      userSelect: 'none'
    }
  }, [toolbarPos.left, toolbarPos.top, toolbarVisible])

  const buttonStyle = useMemo<React.CSSProperties>(() => {
    return {
      width: 36,
      height: 36,
      border: '1px solid rgba(255, 255, 255, 0.15)',
      borderRadius: 10,
      background: 'rgba(0, 0, 0, 0.6)',
      color: '#f9fafb',
      fontSize: 18,
      lineHeight: 1,
      cursor: 'pointer',
      backdropFilter: 'blur(6px)'
    }
  }, [])

  return (
    <div
      style={rootStyle}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div style={tipStyle}>{tipText}</div>
      <div style={toolbarStyle}>
        <button type="button" aria-label="确认" style={buttonStyle} onClick={onConfirm}>
          ✓
        </button>
        <button type="button" aria-label="取消" style={buttonStyle} onClick={onCancel}>
          ✕
        </button>
      </div>
    </div>
  )
}
