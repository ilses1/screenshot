import { clipboard, nativeImage, ipcRenderer } from 'electron'

const canvas = document.getElementById('capture-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const tipEl = document.getElementById('capture-tip') as HTMLDivElement | null

let backgroundImage: HTMLImageElement | null = null
let scaleFactor = 1
let isSelecting = false
let startX = 0
let startY = 0
let currentX = 0
let currentY = 0

/**
 * 设置截图画布的像素尺寸与 CSS 展示尺寸。
 * - canvas.width/height：用于实际绘制的像素尺寸
 * - canvas.style.width/height：用于页面布局的展示尺寸
 */
function setCanvasSize(width: number, height: number) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

/**
 * 右键/菜单键：关闭截图窗口（等同取消）。
 */
function onContextMenu(e: Event) {
  e.preventDefault()
  window.close()
}

/**
 * 捕获阶段拦截右键按下，避免页面或控件抢占右键事件。
 */
function onDocumentMouseDown(e: MouseEvent) {
  if (e.button === 2) {
    e.preventDefault()
    window.close()
  }
}

document.addEventListener('contextmenu', onContextMenu)
document.addEventListener('mousedown', onDocumentMouseDown, { capture: true })

/**
 * 获取当前选区（将起点与终点归一化为左上角 + 宽高）。
 */
function getSelectionRect() {
  const x = Math.min(startX, currentX)
  const y = Math.min(startY, currentY)
  const width = Math.abs(currentX - startX)
  const height = Math.abs(currentY - startY)
  return { x, y, width, height }
}

/**
 * 绘制循环：背景图 + 半透明遮罩 + 选区边框/提示。
 */
function draw() {
  if (!backgroundImage) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height)

  if (isSelecting) {
    const { x, y, width, height } = getSelectionRect()

    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.clearRect(x, y, width, height)
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 0.5, y + 0.5, width, height)
    ctx.restore()

    if (tipEl) {
      tipEl.textContent = `区域：${Math.round(width)} × ${Math.round(height)}（Esc/右键取消）`
    }
  }

  requestAnimationFrame(draw)
}

/**
 * 设置背景截图与尺寸/缩放信息。
 * displaySize：显示器逻辑尺寸（CSS 像素）
 * displayScaleFactor：系统缩放（用于裁剪时把逻辑坐标换算到物理像素）
 */
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

/**
 * 背景图加载完成后启动绘制循环并更新提示文案。
 */
function onBackgroundLoaded() {
  if (tipEl) {
    tipEl.textContent = '按住左键拖动选择区域，松开完成截图，Esc/右键取消'
  }
  draw()
}

/**
 * 结束选区并将裁剪结果写入剪贴板；同时按配置决定是否落盘/打开编辑器。
 */
function finishSelection() {
  if (!backgroundImage) {
    window.close()
    return
  }

  const { x, y, width, height } = getSelectionRect()
  if (width < 5 || height < 5) {
    window.close()
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
  const image = nativeImage.createFromDataURL(dataUrl)
  clipboard.writeImage(image)

  ipcRenderer.invoke('capture:save-image', dataUrl).catch(err => {
    console.error('save image failed', err)
  })

  window.close()
}

type ActiveInput = 'pointer' | 'mouse' | null
let activeInput: ActiveInput = null
let activePointerId: number | null = null
let isGlobalPointerListening = false
let isGlobalMouseListening = false

/**
 * 兜底：在拖动期间把 mousemove/mouseup 绑定到 window，避免移出画布时丢失 mouseup。
 */
function attachGlobalMouseListeners() {
  if (isGlobalMouseListening) return
  isGlobalMouseListening = true
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

/**
 * 解除兜底的全局鼠标监听，避免退出后残留监听器。
 */
function detachGlobalMouseListeners() {
  if (!isGlobalMouseListening) return
  isGlobalMouseListening = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

/**
 * 兜底：在拖动期间把 move/up/cancel 同时绑定到 window，避免 setPointerCapture 失败时丢事件。
 */
function attachGlobalPointerListeners() {
  if (isGlobalPointerListening) return
  isGlobalPointerListening = true
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp, { passive: false })
  window.addEventListener('pointercancel', onPointerCancel, { passive: false })
}

/**
 * 解除兜底的全局指针监听，避免退出后残留监听器。
 */
function detachGlobalPointerListeners() {
  if (!isGlobalPointerListening) return
  isGlobalPointerListening = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}

/**
 * 将指针事件的 client 坐标换算为画布坐标，并夹紧到画布范围内。
 * 需要同时考虑 canvas 像素尺寸与 DOM 展示尺寸不一致（高 DPI/缩放）的问题。
 */
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

/**
 * mouse 兜底：开始框选（用于 Pointer Events 不可用/不触发的环境）。
 */
function onMouseDown(event: MouseEvent) {
  if (activeInput === 'pointer') return
  if (event.button === 2) {
    window.close()
    return
  }
  if (event.button !== 0) return

  event.preventDefault()
  activeInput = 'mouse'
  isSelecting = true
  attachGlobalMouseListeners()

  const p = getCanvasPoint(event)
  startX = p.x
  startY = p.y
  currentX = startX
  currentY = startY
}

/**
 * mouse 兜底：更新框选。
 */
function onMouseMove(event: MouseEvent) {
  if (activeInput !== 'mouse') return
  if (!isSelecting) return
  const p = getCanvasPoint(event)
  currentX = p.x
  currentY = p.y
}

/**
 * mouse 兜底：结束框选。
 */
function onMouseUp(_event: MouseEvent) {
  if (activeInput !== 'mouse') return
  endSelection()
}

/**
 * 开始框选：记录起点并捕获指针，保证指针移出 canvas 仍能收到 up/cancel。
 */
function onPointerDown(event: PointerEvent) {
  if (event.button === 2) {
    window.close()
    return
  }
  if (event.button !== 0) return

  event.preventDefault()
  activeInput = 'pointer'
  activePointerId = event.pointerId
  try {
    canvas.setPointerCapture(event.pointerId)
  } catch {}

  isSelecting = true
  attachGlobalPointerListeners()
  const p = getCanvasPoint(event)
  startX = p.x
  startY = p.y
  currentX = startX
  currentY = startY
}

/**
 * 更新框选：根据当前指针位置更新终点坐标。
 */
function onPointerMove(event: PointerEvent) {
  if (activeInput !== 'pointer') return
  if (!isSelecting) return
  if (activePointerId !== null && event.pointerId !== activePointerId) return
  event.preventDefault()
  const p = getCanvasPoint(event)
  currentX = p.x
  currentY = p.y
}

/**
 * 结束框选：停止框选状态并触发裁剪保存。
 */
function endSelection() {
  if (!isSelecting) return
  isSelecting = false
  activeInput = null
  activePointerId = null
  detachGlobalPointerListeners()
  detachGlobalMouseListeners()
  finishSelection()
}

/**
 * 指针抬起：释放捕获并结束框选。
 */
function onPointerUp(event: PointerEvent) {
  if (activeInput !== 'pointer') return
  if (activePointerId !== null && event.pointerId === activePointerId) {
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch {}
  }
  endSelection()
}

/**
 * 指针被系统取消（例如窗口失焦/触控中断）：释放捕获并退出。
 */
function onPointerCancel(event: PointerEvent) {
  if (activeInput !== 'pointer') return
  if (activePointerId !== null && event.pointerId === activePointerId) {
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch {}
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

/**
 * 键盘操作：Esc 取消截图。
 */
function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    window.close()
  }
}
window.addEventListener('keydown', onKeyDown)

/**
 * 窗口加载后主动获取焦点，便于立即响应键盘操作。
 */
function onWindowLoad() {
  window.focus()
}
window.addEventListener('load', onWindowLoad)

/**
 * 兜底 resize：窗口尺寸变化时同步画布尺寸。
 */
function onWindowResize() {
  setCanvasSize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', onWindowResize)

/**
 * 主进程开启截图后下发屏幕背景图与显示器尺寸，用于绘制遮罩与选区。
 */
function onCaptureSetBackground(_event: unknown, payload: unknown) {
  // 主进程开启截图时会发送该事件：下发屏幕背景图与显示器尺寸，用于绘制遮罩与选区
  if (!payload || typeof payload !== 'object') return
  const { dataUrl, displaySize, scaleFactor: displayScaleFactor } = payload as any
  if (typeof dataUrl !== 'string' || !displaySize) return
  setBackground(dataUrl, displaySize, displayScaleFactor)
}
ipcRenderer.on('capture:set-background', onCaptureSetBackground)
