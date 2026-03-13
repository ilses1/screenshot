import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function roundRectSize(width: number, height: number) {
  return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) }
}

export function CaptureApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)

  const backgroundImageRef = useRef<HTMLImageElement | null>(null)
  const scaleFactorRef = useRef(1)

  const isSelectingRef = useRef(false)
  const isPendingConfirmRef = useRef(false)
  const isFinishingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)

  const startRef = useRef<Point>({ x: 0, y: 0 })
  const currentRef = useRef<Point>({ x: 0, y: 0 })

  const [tipText, setTipText] = useState('按住左键拖动选择区域，松开后点击✓确认，Esc/右键取消')
  const lastTipRef = useRef<string>('')

  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [toolbarPos, setToolbarPos] = useState<{ left: number; top: number }>({ left: 12, top: 12 })

  const getSelectionRect = useCallback((): Rect => {
    const start = startRef.current
    const current = currentRef.current
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const width = Math.abs(current.x - start.x)
    const height = Math.abs(current.y - start.y)
    return { x, y, width, height }
  }, [])

  const setCanvasSize = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = roundRectSize(width, height)
    canvas.width = w
    canvas.height = h
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
  }, [])

  const getCanvasPoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width ? canvas.width / rect.width : 1
    const scaleY = rect.height ? canvas.height / rect.height : 1
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    return { x: clamp(x, 0, canvas.width), y: clamp(y, 0, canvas.height) }
  }, [])

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
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = getSelectionRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const canvasRect = canvas.getBoundingClientRect()
    const scaleX = canvas.width ? canvasRect.width / canvas.width : 1
    const scaleY = canvas.height ? canvasRect.height / canvas.height : 1

    const left = canvasRect.left + rect.x * scaleX
    const top = canvasRect.top + rect.y * scaleY
    const right = left + rect.width * scaleX
    const bottom = top + rect.height * scaleY

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
    isSelectingRef.current = false
    activePointerIdRef.current = null

    const rect = getSelectionRect()
    if (rect.width < 5 || rect.height < 5) {
      isPendingConfirmRef.current = false
      setToolbarVisible(false)
      resetTip()
      return
    }

    isPendingConfirmRef.current = true
    setToolbarVisible(true)
    positionToolbarToSelection()
    updateTip(rect)
  }, [getSelectionRect, positionToolbarToSelection, resetTip, updateTip])

  const finishSelection = useCallback(() => {
    if (isFinishingRef.current) return
    isFinishingRef.current = true

    const img = backgroundImageRef.current
    if (!img) {
      window.close()
      return
    }

    const rect = getSelectionRect()
    if (rect.width < 5 || rect.height < 5) {
      isFinishingRef.current = false
      isPendingConfirmRef.current = false
      setToolbarVisible(false)
      resetTip()
      return
    }

    const scaleFactor = scaleFactorRef.current
    const sx = Math.round(rect.x * scaleFactor)
    const sy = Math.round(rect.y * scaleFactor)
    const sw = Math.round(rect.width * scaleFactor)
    const sh = Math.round(rect.height * scaleFactor)

    const output = document.createElement('canvas')
    output.width = sw
    output.height = sh
    const octx = output.getContext('2d')
    if (!octx) {
      isFinishingRef.current = false
      window.close()
      return
    }
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    const dataUrl = output.toDataURL('image/png')

    window.captureApi.saveImageToClipboard(dataUrl)
    void window.captureApi.saveImage(dataUrl).catch(err => {
      console.error('save image failed', err)
    })

    window.close()
  }, [getSelectionRect, resetTip])

  const onConfirm = useCallback(() => {
    if (!isPendingConfirmRef.current) return
    setToolbarVisible(false)
    finishSelection()
  }, [finishSelection])

  const onCancel = useCallback(() => {
    window.close()
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 2) {
      window.close()
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
    } catch { }

    const p = getCanvasPoint(event)
    startRef.current = p
    currentRef.current = p
  }, [getCanvasPoint])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSelectingRef.current) return
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return
    event.preventDefault()
    currentRef.current = getCanvasPoint(event)
    updateTip()
  }, [getCanvasPoint, updateTip])

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSelectingRef.current) return
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch { }
    endSelection()
  }, [endSelection])

  const onPointerCancel = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSelectingRef.current) return
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch { }
    window.close()
  }, [])

  const onContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    window.close()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    ctxRef.current = canvas.getContext('2d')
  }, [])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      const img = backgroundImageRef.current
      if (canvas && ctx && img) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        if (isSelectingRef.current || isPendingConfirmRef.current) {
          const rect = getSelectionRect()
          ctx.save()
          ctx.fillStyle = 'rgba(0,0,0,0.55)'
          ctx.beginPath()
          ctx.rect(0, 0, canvas.width, canvas.height)
          ctx.rect(rect.x, rect.y, rect.width, rect.height)
          ctx.fill('evenodd')
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 2
          ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height)
          ctx.restore()
        }
      }
      raf = window.requestAnimationFrame(draw)
    }
    raf = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(raf)
  }, [getSelectionRect])

  useEffect(() => {
    window.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.close()
      }
    }
    const onResize = () => {
      setCanvasSize(window.innerWidth, window.innerHeight)
      if (isPendingConfirmRef.current) {
        positionToolbarToSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [positionToolbarToSelection, setCanvasSize])

  useEffect(() => {
    window.captureApi.onSetBackground(payload => {
      if (!payload || typeof payload !== 'object') return
      const { dataUrl, displaySize, scaleFactor } = payload as any
      if (typeof dataUrl !== 'string' || !displaySize) return

      scaleFactorRef.current =
        typeof scaleFactor === 'number' && Number.isFinite(scaleFactor) ? scaleFactor : 1

      const width =
        displaySize && typeof displaySize.width === 'number' && Number.isFinite(displaySize.width)
          ? displaySize.width
          : window.innerWidth
      const height =
        displaySize && typeof displaySize.height === 'number' && Number.isFinite(displaySize.height)
          ? displaySize.height
          : window.innerHeight

      setCanvasSize(width, height)

      const img = new Image()
      img.src = dataUrl
      img.onload = () => {
        backgroundImageRef.current = img
        isPendingConfirmRef.current = false
        setToolbarVisible(false)
        resetTip()
      }
    })
  }, [resetTip, setCanvasSize])

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
    <>
      <div style={tipStyle}>{tipText}</div>
      <div style={toolbarStyle}>
        <button type="button" aria-label="确认" style={buttonStyle} onClick={onConfirm}>
          ✓
        </button>
        <button type="button" aria-label="取消" style={buttonStyle} onClick={onCancel}>
          ✕
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </>
  )
}

