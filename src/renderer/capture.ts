import { desktopCapturer, screen, clipboard, nativeImage, ipcRenderer } from 'electron'

const canvas = document.getElementById('capture-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let backgroundImage: HTMLImageElement | null = null
let isSelecting = false
let startX = 0
let startY = 0
let currentX = 0
let currentY = 0
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
  }

  requestAnimationFrame(draw)
}

async function captureScreen() {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.size
  const { scaleFactor } = display

  console.log('[capture] primary display', {
    size: display.size,
    bounds: display.bounds,
    scaleFactor
  })

  canvas.width = width
  canvas.height = height

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * scaleFactor), height: Math.round(height * scaleFactor) }
  })

  if (!sources.length) {
    console.error('[capture] no screen sources found')
    throw new Error('no screen sources')
  }

  const primarySource = sources[0]
  const image = primarySource.thumbnail

  if (image.isEmpty()) {
    console.error('[capture] primary source thumbnail is empty')
    throw new Error('empty thumbnail')
  }

  const buffer = image.toPNG()
  const url = `data:image/png;base64,${buffer.toString('base64')}`

  backgroundImage = new Image()
  backgroundImage.src = url
  backgroundImage.onload = () => {
    console.log('[capture] background image loaded')
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

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const octx = output.getContext('2d')!
  octx.drawImage(backgroundImage, x, y, width, height, 0, 0, width, height)

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

captureScreen().catch(error => {
  console.error('captureScreen error', error)
  window.close()
})
