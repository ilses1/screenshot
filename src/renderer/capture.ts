declare global {
  interface Window {
    captureApi: {
      onSetBackground: (handler: (payload: any) => void) => void
      saveImageToClipboard: (dataUrl: string) => void
      saveImage: (dataUrl: string) => Promise<unknown>
    }
  }
}

console.log('capture.ts 已加载')

const canvas = document.getElementById('capture-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const tipEl = document.getElementById('capture-tip') as HTMLDivElement | null
let toolbarEl = document.getElementById('capture-toolbar') as HTMLDivElement | null
let confirmBtn = document.getElementById('capture-confirm') as HTMLButtonElement | null
let cancelBtn = document.getElementById('capture-cancel') as HTMLButtonElement | null

if (!toolbarEl) {
  toolbarEl = document.createElement('div')
  toolbarEl.id = 'capture-toolbar'
  toolbarEl.hidden = true
  toolbarEl.style.cssText =
    'position:fixed;left:0;top:0;display:flex;gap:8px;z-index:20;pointer-events:auto;user-select:none;'

  confirmBtn = document.createElement('button')
  confirmBtn.id = 'capture-confirm'
  confirmBtn.type = 'button'
  confirmBtn.setAttribute('aria-label', '确认')
  confirmBtn.textContent = '✓'
  confirmBtn.style.cssText =
    'width:36px;height:36px;border:1px solid rgba(255,255,255,0.15);border-radius:10px;background:rgba(0,0,0,0.6);color:#f9fafb;font-size:18px;line-height:1;cursor:pointer;backdrop-filter:blur(6px);'

  cancelBtn = document.createElement('button')
  cancelBtn.id = 'capture-cancel'
  cancelBtn.type = 'button'
  cancelBtn.setAttribute('aria-label', '取消')
  cancelBtn.textContent = '✕'
  cancelBtn.style.cssText =
    'width:36px;height:36px;border:1px solid rgba(255,255,255,0.15);border-radius:10px;background:rgba(0,0,0,0.6);color:#f9fafb;font-size:18px;line-height:1;cursor:pointer;backdrop-filter:blur(6px);'

  toolbarEl.append(confirmBtn, cancelBtn)
  document.body.appendChild(toolbarEl)
}

let backgroundImage: HTMLImageElement | null = null
let scaleFactor = 1
let isSelecting = false
let isPendingConfirm = false
let isFinishing = false
let startX = 0
let startY = 0
let currentX = 0
let currentY = 0

function setToolbarVisible(visible: boolean) {
  if (!toolbarEl) return
  toolbarEl.hidden = !visible
  toolbarEl.style.display = visible ? 'flex' : 'none'
  if (visible && isPendingConfirm) {
    positionToolbarToSelection()
  }
}

function setCanvasSize(width: number, height: number) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

function onContextMenu(e: Event) {
  console.log('触发 contextmenu 事件，关闭截图窗口')
  e.preventDefault()
  window.close()
}

function onDocumentMouseDown(e: MouseEvent) {
  console.log('触发文档 mousedown 事件，按键：', e.button)
  if (e.button === 2) {
    e.preventDefault()
    window.close()
  }
}

document.addEventListener('contextmenu', onContextMenu)
document.addEventListener('mousedown', onDocumentMouseDown, { capture: true })

function getSelectionRect() {
  const x = Math.min(startX, currentX)
  const y = Math.min(startY, currentY)
  const width = Math.abs(currentX - startX)
  const height = Math.abs(currentY - startY)
  return { x, y, width, height }
}

function draw() {
  if (!backgroundImage) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height)

  if (isSelecting || isPendingConfirm) {
    const { x, y, width, height } = getSelectionRect()

    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.rect(0, 0, canvas.width, canvas.height)
    ctx.rect(x, y, width, height)
    ctx.fill('evenodd')
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 0.5, y + 0.5, width, height)
    ctx.restore()

    if (tipEl) {
      tipEl.textContent = isPendingConfirm
        ? `区域：${Math.round(width)} × ${Math.round(height)}（点击✓确认，Esc/右键取消）`
        : `区域：${Math.round(width)} × ${Math.round(height)}（Esc/右键取消）`
    }
  }

  requestAnimationFrame(draw)
}

function setBackground(dataUrl: string, displaySize: { width: number; height: number }, displayScaleFactor: number) {
  scaleFactor = typeof displayScaleFactor === 'number' && Number.isFinite(displayScaleFactor) ? displayScaleFactor : 1
  const width =
    displaySize && typeof displaySize.width === 'number' && Number.isFinite(displaySize.width)
      ? displaySize.width
      : window.innerWidth
  const height =
    displaySize && typeof displaySize.height === 'number' && Number.isFinite(displaySize.height)
      ? displaySize.height
      : window.innerHeight
  setCanvasSize(width, height)

  backgroundImage = new Image()
  backgroundImage.src = dataUrl
  backgroundImage.onload = onBackgroundLoaded
}

function onBackgroundLoaded() {
  if (tipEl) {
    tipEl.textContent = '按住左键拖动选择区域，松开后点击✓确认，Esc/右键取消'
  }
  setToolbarVisible(false)
  draw()
}

function finishSelection() {
  if (isFinishing) return
  isFinishing = true
  if (!backgroundImage) {
    window.close()
    return
  }

  const { x, y, width, height } = getSelectionRect()
  if (width < 5 || height < 5) {
    isFinishing = false
    isPendingConfirm = false
    setToolbarVisible(false)
    if (tipEl) {
      tipEl.textContent = '按住左键拖动选择区域，松开后点击✓确认，Esc/右键取消'
    }
    return
  }

  const sx = Math.round(x * scaleFactor)
  const sy = Math.round(y * scaleFactor)
  const sw = Math.round(width * scaleFactor)
  const sh = Math.round(height * scaleFactor)

  const output = document.createElement('canvas')
  output.width = sw
  output.height = sh
  const octx = output.getContext('2d')!
  octx.drawImage(backgroundImage, sx, sy, sw, sh, 0, 0, sw, sh)

  const dataUrl = output.toDataURL('image/png')
  window.captureApi.saveImageToClipboard(dataUrl)
  window.captureApi.saveImage(dataUrl).catch(err => {
    console.error('save image failed', err)
  })

  window.close()
}

type ActiveInput = 'pointer' | 'mouse' | null
let activeInput: ActiveInput = null
let activePointerId: number | null = null
let isGlobalPointerListening = false
let isGlobalMouseListening = false

function positionToolbarToSelection() {
  if (!toolbarEl) return
  const { x, y, width, height } = getSelectionRect()
  if (width <= 0 || height <= 0) return

  const canvasRect = canvas.getBoundingClientRect()
  const scaleX = canvas.width ? canvasRect.width / canvas.width : 1
  const scaleY = canvas.height ? canvasRect.height / canvas.height : 1

  const left = canvasRect.left + x * scaleX
  const top = canvasRect.top + y * scaleY
  const right = left + width * scaleX
  const bottom = top + height * scaleY

  const toolbarRect = toolbarEl.getBoundingClientRect()
  const toolbarWidth = toolbarRect.width || 80
  const toolbarHeight = toolbarRect.height || 36

  const viewportPadding = 12
  const offset = 8

  let targetLeft = right - toolbarWidth
  let targetTop = bottom + offset

  if (targetTop + toolbarHeight > window.innerHeight - viewportPadding) {
    targetTop = top - toolbarHeight - offset
  }

  targetLeft = Math.max(viewportPadding, Math.min(window.innerWidth - viewportPadding - toolbarWidth, targetLeft))
  targetTop = Math.max(viewportPadding, Math.min(window.innerHeight - viewportPadding - toolbarHeight, targetTop))

  toolbarEl.style.right = 'auto'
  toolbarEl.style.bottom = 'auto'
  toolbarEl.style.left = `${Math.round(targetLeft)}px`
  toolbarEl.style.top = `${Math.round(targetTop)}px`
}

function attachGlobalMouseListeners() {
  if (isGlobalMouseListening) return
  isGlobalMouseListening = true
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function detachGlobalMouseListeners() {
  if (!isGlobalMouseListening) return
  isGlobalMouseListening = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function attachGlobalPointerListeners() {
  if (isGlobalPointerListening) return
  isGlobalPointerListening = true
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp, { passive: false })
  window.addEventListener('pointercancel', onPointerCancel, { passive: false })
}

function detachGlobalPointerListeners() {
  if (!isGlobalPointerListening) return
  isGlobalPointerListening = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}

function getCanvasPoint(event: { clientX: number; clientY: number }) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = rect.width ? canvas.width / rect.width : 1
  const scaleY = rect.height ? canvas.height / rect.height : 1
  const x = (event.clientX - rect.left) * scaleX
  const y = (event.clientY - rect.top) * scaleY
  const clampedX = Math.max(0, Math.min(canvas.width, x))
  const clampedY = Math.max(0, Math.min(canvas.height, y))
  return { x: clampedX, y: clampedY }
}

function onMouseDown(event: MouseEvent) {
  console.log('触发画布 mouse 按下事件，按键：', event.button, '位置：', event.clientX, event.clientY)
  if (activeInput === 'pointer') return
  if (event.button === 2) {
    window.close()
    return
  }
  if (event.button !== 0) return

  event.preventDefault()
  isPendingConfirm = false
  setToolbarVisible(false)
  activeInput = 'mouse'
  isSelecting = true
  attachGlobalMouseListeners()

  const p = getCanvasPoint(event)
  startX = p.x
  startY = p.y
  currentX = startX
  currentY = startY
}

function onMouseMove(event: MouseEvent) {
  console.log('触发画布 mouse 移动事件，位置：', event.clientX, event.clientY)
  if (activeInput !== 'mouse') return
  if (!isSelecting) return
  const p = getCanvasPoint(event)
  currentX = p.x
  currentY = p.y
}

function onMouseUp(_event: MouseEvent) {
  console.log('触发画布 mouse 抬起事件，结束框选')
  if (activeInput !== 'mouse') return
  endSelection()
}

function onPointerDown(event: PointerEvent) {
  console.log('触发画布 pointer 按下事件，按键：', event.button, '位置：', event.clientX, event.clientY)
  if (event.button === 2) {
    window.close()
    return
  }
  if (event.button !== 0) return

  event.preventDefault()
  isPendingConfirm = false
  setToolbarVisible(false)
  activeInput = 'pointer'
  activePointerId = event.pointerId
  try {
    canvas.setPointerCapture(event.pointerId)
  } catch { }

  isSelecting = true
  attachGlobalPointerListeners()
  const p = getCanvasPoint(event)
  startX = p.x
  startY = p.y
  currentX = startX
  currentY = startY
}

function onPointerMove(event: PointerEvent) {
  console.log('触发画布 pointer 移动事件，位置：', event.clientX, event.clientY)
  if (activeInput !== 'pointer') return
  if (!isSelecting) return
  if (activePointerId !== null && event.pointerId !== activePointerId) return
  event.preventDefault()
  const p = getCanvasPoint(event)
  currentX = p.x
  currentY = p.y
}

function endSelection() {
  if (!isSelecting) return
  isSelecting = false
  activeInput = null
  activePointerId = null
  detachGlobalPointerListeners()
  detachGlobalMouseListeners()
  const { width, height } = getSelectionRect()
  if (width < 5 || height < 5) {
    isPendingConfirm = false
    setToolbarVisible(false)
    if (tipEl) {
      tipEl.textContent = '按住左键拖动选择区域，松开后点击✓确认，Esc/右键取消'
    }
    return
  }
  isPendingConfirm = true
  setToolbarVisible(true)
  positionToolbarToSelection()
}

function onPointerUp(event: PointerEvent) {
  console.log('触发画布 pointer 抬起事件')
  if (activeInput !== 'pointer') return
  if (activePointerId !== null && event.pointerId === activePointerId) {
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch { }
  }
  endSelection()
}

function onPointerCancel(event: PointerEvent) {
  console.log('触发画布 pointer 取消事件，关闭截图窗口')
  if (activeInput !== 'pointer') return
  if (activePointerId !== null && event.pointerId === activePointerId) {
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch { }
  }
  detachGlobalPointerListeners()
  activeInput = null
  detachGlobalMouseListeners()
  window.close()
}

canvas.addEventListener('mousedown', onMouseDown)
canvas.addEventListener('pointerdown', onPointerDown)
canvas.addEventListener('pointermove', onPointerMove)
canvas.addEventListener('pointerup', onPointerUp)
canvas.addEventListener('pointercancel', onPointerCancel)

function onKeyDown(event: KeyboardEvent) {
  console.log('触发键盘按下事件，按键：', event.key)
  if (event.key === 'Escape') {
    window.close()
  }
}
window.addEventListener('keydown', onKeyDown)

function onWindowLoad() {
  console.log('触发窗口 load 事件，窗口获取焦点')
  window.focus()
}
window.addEventListener('load', onWindowLoad)

function onWindowResize() {
  console.log('触发窗口 resize 事件，新尺寸：', window.innerWidth, window.innerHeight)
  setCanvasSize(window.innerWidth, window.innerHeight)
  if (isPendingConfirm) {
    positionToolbarToSelection()
  }
}
window.addEventListener('resize', onWindowResize)

function onCaptureSetBackground(payload: unknown) {
  console.log('收到主进程下发截图背景数据事件，payload：', payload)
  if (!payload || typeof payload !== 'object') return
  const { dataUrl, displaySize, scaleFactor: displayScaleFactor } = payload as any
  if (typeof dataUrl !== 'string' || !displaySize) return
  setBackground(dataUrl, displaySize, displayScaleFactor)
}
window.captureApi.onSetBackground(onCaptureSetBackground)

function onConfirmClick() {
  if (!isPendingConfirm) return
  setToolbarVisible(false)
  finishSelection()
}

function onCancelClick() {
  window.close()
}

confirmBtn?.addEventListener('click', onConfirmClick)
cancelBtn?.addEventListener('click', onCancelClick)
