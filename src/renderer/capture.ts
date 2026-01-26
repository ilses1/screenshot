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

function setCanvasSize(width: number, height: number) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}
document.addEventListener('contextmenu', e => {
  e.preventDefault()
  window.close()
})
document.addEventListener(
  'mousedown',
  e => {
    if ((e as MouseEvent).button === 2) {
      e.preventDefault()
      window.close()
    }
  },
  { capture: true }
)

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
  backgroundImage.onload = () => {
    if (tipEl) {
      tipEl.textContent = '按住左键拖动选择区域，松开完成截图，Esc/右键取消'
    }
    draw()
  }
}

function finishSelection() {
  if (!backgroundImage) return

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

canvas.addEventListener('mousedown', event => {
  if (event.button === 2) {
    window.close()
    return
  }

  isSelecting = true
  startX = event.offsetX
  startY = event.offsetY
  currentX = startX
  currentY = startY
})

canvas.addEventListener('mousemove', event => {
  if (!isSelecting) return
  currentX = event.offsetX
  currentY = event.offsetY
})

canvas.addEventListener('mouseup', () => {
  if (!isSelecting) return
  isSelecting = false
  finishSelection()
})

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    window.close()
  }
})

window.addEventListener('load', () => {
  window.focus()
})

window.addEventListener('resize', () => {
  setCanvasSize(window.innerWidth, window.innerHeight)
})

ipcRenderer.on('capture:set-background', (_event, payload) => {
  // 主进程开启截图时会发送该事件：下发屏幕背景图与显示器尺寸，用于绘制遮罩与选区
  if (!payload || typeof payload !== 'object') return
  const { dataUrl, displaySize, scaleFactor: displayScaleFactor } = payload as any
  if (typeof dataUrl !== 'string' || !displaySize) return
  setBackground(dataUrl, displaySize, displayScaleFactor)
})
