import type { CaptureErrorPayload, CaptureSetBackgroundPayload } from '../../common/capture'
import { CAPTURE_ERROR_CODES } from '../../common/capture'

function parseScreenNumber(name: string) {
  const m = name.match(/(\d+)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function pickScreenSourceForDisplay(
  sources: Electron.DesktopCapturerSource[],
  targetDisplay: Electron.Display,
  displays: Electron.Display[]
) {
  const displayId = String(targetDisplay.id)
  const byDisplayId = sources.find(s => String((s as any).display_id ?? '') === displayId)
  if (byDisplayId) return byDisplayId

  const sortedDisplays = [...displays].sort((a, b) => (a.bounds.x - b.bounds.x) || (a.bounds.y - b.bounds.y))
  const targetIndex = sortedDisplays.findIndex(d => d.id === targetDisplay.id)

  const numberedSources = sources
    .map(s => ({ s, n: parseScreenNumber(s.name) }))
    .filter((x): x is { s: Electron.DesktopCapturerSource; n: number } => typeof x.n === 'number')
    .sort((a, b) => a.n - b.n)

  if (targetIndex >= 0 && targetIndex < numberedSources.length) {
    return numberedSources[targetIndex].s
  }

  if (sources.length === 1) return sources[0]
  return null
}

export async function populateMultiCaptureScreens(params: {
  epoch: number
  sessionId: number
  displays: Electron.Display[]
  allDisplays: Electron.Display[]
  screensPayload: Extract<CaptureSetBackgroundPayload, { mode: 'multi' }>
  isSessionCurrent: (epoch: number, runId: number) => boolean
  desktopCapturer: Electron.DesktopCapturer
  emitCaptureError: (payload: Omit<CaptureErrorPayload, 'platform'>) => void
}) {
  const { epoch, sessionId, displays, allDisplays, screensPayload, isSessionCurrent, desktopCapturer, emitCaptureError } = params
  for (const display of displays) {
    if (!isSessionCurrent(epoch, sessionId)) return
    const thumbnailSize = {
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor)
    }
    let sources: Electron.DesktopCapturerSource[]
    try {
      sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
    } catch (error) {
      emitCaptureError({
        sessionId,
        code: CAPTURE_ERROR_CODES.DESKTOP_CAPTURER_FAILED,
        stage: 'desktop-capture',
        message: 'desktopCapturer.getSources failed',
        details: { displayId: display.id, error: String(error) }
      })
      throw error
    }
    if (!isSessionCurrent(epoch, sessionId)) return

    if (!sources || sources.length <= 0) {
      emitCaptureError({
        sessionId,
        code: CAPTURE_ERROR_CODES.SOURCES_EMPTY,
        stage: 'desktop-capture',
        message: 'desktopCapturer returned empty sources',
        details: { displayId: display.id }
      })
      throw new Error(`empty sources displayId=${display.id}`)
    }

    const source = pickScreenSourceForDisplay(sources, display, allDisplays)
    if (!source) {
      emitCaptureError({
        sessionId,
        code: CAPTURE_ERROR_CODES.SOURCE_MAP_FAILED,
        stage: 'map-source',
        message: 'cannot map screen source for display',
        details: { displayId: display.id, sources: sources.map(s => ({ id: s.id, name: s.name, display_id: (s as any).display_id })) }
      })
      throw new Error(`cannot map screen source displayId=${display.id}`)
    }
    const image = source.thumbnail
    if (image.isEmpty()) {
      emitCaptureError({
        sessionId,
        code: CAPTURE_ERROR_CODES.THUMBNAIL_EMPTY,
        stage: 'thumbnail',
        message: 'screen thumbnail is empty',
        details: { displayId: display.id, sourceId: source.id, sourceName: source.name }
      })
      throw new Error(`empty thumbnail displayId=${display.id}`)
    }

    screensPayload.screens.push({
      displayId: display.id,
      bounds: { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height },
      scaleFactor: display.scaleFactor,
      dataUrl: image.toDataURL()
    })
  }
}
