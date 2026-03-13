type Tool = 'pen' | 'rect' | 'arrow' | 'text'

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
  | { type: 'arrow'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'text'; x: number; y: number; text: string }

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
  ctx.fillStyle = '#f97316'

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
    } else if (stroke.type === 'arrow') {
      const headLength = 10
      const dx = stroke.x2 - stroke.x1
      const dy = stroke.y2 - stroke.y1
      const angle = Math.atan2(dy, dx)
      ctx.beginPath()
      ctx.moveTo(stroke.x1, stroke.y1)
      ctx.lineTo(stroke.x2, stroke.y2)
      ctx.moveTo(
        stroke.x2 - headLength * Math.cos(angle - Math.PI / 6),
        stroke.y2 - headLength * Math.sin(angle - Math.PI / 6)
      )
      ctx.lineTo(stroke.x2, stroke.y2)
      ctx.lineTo(
        stroke.x2 - headLength * Math.cos(angle + Math.PI / 6),
        stroke.y2 - headLength * Math.sin(angle + Math.PI / 6)
      )
      ctx.stroke()
    } else if (stroke.type === 'text') {
      ctx.fillText(stroke.text, stroke.x, stroke.y)
    }
  }
}

function addTextAt(x: number, y: number) {
  const text = window.prompt('输入文字')?.trim()
  if (!text) return
  strokes.push({ type: 'text', x, y, text })
  redraw()
}

function startDrawing(x: number, y: number) {
  if (tool === 'text') {
    addTextAt(x, y)
    return
  }

  drawing = true
  lastX = x
  lastY = y

  if (tool === 'pen') {
    strokes.push({ type: 'pen', points: [{ x, y }] })
  } else if (tool === 'rect') {
    strokes.push({ type: 'rect', x, y, w: 0, h: 0 })
  } else if (tool === 'arrow') {
    strokes.push({ type: 'arrow', x1: x, y1: y, x2: x, y2: y })
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
  } else if (stroke.type === 'arrow') {
    stroke.x2 = x
    stroke.y2 = y
  }

  lastX = x
  lastY = y
  redraw()
}

function endDrawing() {
  drawing = false
}

function getCanvasPoint(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  return { x, y }
}

function onCanvasMouseDown(event: MouseEvent) {
  const { x, y } = getCanvasPoint(event)
  startDrawing(x, y)
}

function onCanvasMouseMove(event: MouseEvent) {
  const { x, y } = getCanvasPoint(event)

  if (drawing) continueDrawing(x, y)

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

bindCanvasEvents()

