declare global {
  interface Window {
    editorApi: {
      saveToClipboardAndPersist: (dataUrl: string) => Promise<unknown>
      onImage: (handler: (dataUrl: string) => void) => void
    }
  }
}

type Tool = 'pen' | 'rect'

const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const toolbar = document.getElementById('toolbar')!
const undoButton = document.getElementById('undo-button') as HTMLButtonElement
const finishButton = document.getElementById('finish-button') as HTMLButtonElement
const ocrButton = document.getElementById('ocr-button') as HTMLButtonElement
const uploadButton = document.getElementById('upload-button') as HTMLButtonElement
const colorDisplay = document.getElementById('color-display') as HTMLSpanElement

let backgroundImage: HTMLImageElement | null = null
let tool: Tool = 'pen'
let drawing = false
let lastX = 0
let lastY = 0

type Stroke =
  | { type: 'pen'; points: { x: number; y: number }[] }
  | { type: 'rect'; x: number; y: number; w: number; h: number }

const strokes: Stroke[] = []

function resizeCanvasToImage() {
  if (!backgroundImage) return

  const maxWidth = window.innerWidth - 40
  const maxHeight = window.innerHeight - 80

  let width = backgroundImage.width
  let height = backgroundImage.height

  const scale = Math.min(maxWidth / width, maxHeight / height, 1)
  width *= scale
  height *= scale

  canvas.width = width
  canvas.height = height
}

function redraw() {
  if (!backgroundImage) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height)

  ctx.lineWidth = 2
  ctx.strokeStyle = '#f97316'

  for (const stroke of strokes) {
    if (stroke.type === 'pen') {
      ctx.beginPath()
      stroke.points.forEach((p, index) => {
        if (index === 0) {
          ctx.moveTo(p.x, p.y)
        } else {
          ctx.lineTo(p.x, p.y)
        }
      })
      ctx.stroke()
    } else if (stroke.type === 'rect') {
      ctx.strokeRect(stroke.x, stroke.y, stroke.w, stroke.h)
    }
  }
}

function startDrawing(x: number, y: number) {
  drawing = true
  lastX = x
  lastY = y

  if (tool === 'pen') {
    strokes.push({ type: 'pen', points: [{ x, y }] })
  } else if (tool === 'rect') {
    strokes.push({ type: 'rect', x, y, w: 0, h: 0 })
  }
}

function continueDrawing(x: number, y: number) {
  if (!drawing) return
  const stroke = strokes[strokes.length - 1]
  if (!stroke) return

  if (stroke.type === 'pen') {
    stroke.points.push({ x, y })
  } else if (stroke.type === 'rect') {
    stroke.w = x - stroke.x
    stroke.h = y - stroke.y
  }

  lastX = x
  lastY = y
  redraw()
}

function endDrawing() {
  drawing = false
}

function onCanvasMouseDown(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  startDrawing(x, y)
}

function onCanvasMouseMove(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  if (drawing) {
    continueDrawing(x, y)
  }

  if (x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) {
    const data = ctx.getImageData(x, y, 1, 1).data
    const [r, g, b] = data
    const hex =
      '#' +
      [r, g, b]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('')
    colorDisplay.textContent = `颜色：${hex} (${r}, ${g}, ${b})`
  }
}

function onCanvasMouseUp() {
  endDrawing()
}

function bindCanvasEvents() {
  canvas.addEventListener('mousedown', onCanvasMouseDown)
  canvas.addEventListener('mousemove', onCanvasMouseMove)
  canvas.addEventListener('mouseup', onCanvasMouseUp)
  canvas.addEventListener('mouseleave', onCanvasMouseUp)
}

toolbar.addEventListener('click', event => {
  const target = event.target as HTMLElement
  const value = target.getAttribute('data-tool') as Tool | null
  if (!value) return
  tool = value
})

undoButton.addEventListener('click', () => {
  strokes.pop()
  redraw()
})

finishButton.addEventListener('click', () => {
  if (!backgroundImage) return
  const dataUrl = canvas.toDataURL('image/png')
  window.editorApi.saveToClipboardAndPersist(dataUrl).catch(() => {})
  window.close()
})

ocrButton.addEventListener('click', () => {
  console.log('OCR 功能预留：可在此处接入第三方 OCR 服务')
})

uploadButton.addEventListener('click', () => {
  console.log('图床上传功能预留：可在此处接入图床或自定义接口')
})

window.editorApi.onImage((dataUrl: string) => {
  backgroundImage = new Image()
  backgroundImage.src = dataUrl
  backgroundImage.onload = () => {
    resizeCanvasToImage()
    redraw()
  }
})

window.addEventListener('resize', () => {
  if (!backgroundImage) return
  resizeCanvasToImage()
  redraw()
})
