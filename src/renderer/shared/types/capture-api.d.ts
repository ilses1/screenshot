import type {
  CaptureCloseRequest,
  CaptureMaskInitPayload,
  CaptureSelectionUpdate,
  CaptureSessionReport,
  CaptureSessionSnapshot,
  CaptureSetBackgroundPayload as _CaptureSetBackgroundPayload
} from '../../../common/capture'

declare global {
  type CaptureSetBackgroundPayload = _CaptureSetBackgroundPayload

  interface Window {
    captureApi: {
      onSetBackground: (handler: (payload: CaptureSetBackgroundPayload) => void) => void
      onSessionState: (handler: (snapshot: CaptureSessionSnapshot) => void) => void
      reportSessionState: (report: CaptureSessionReport) => void
      onMaskInit: (handler: (payload: CaptureMaskInitPayload) => void) => void
      sendSelectionRect: (payload: CaptureSelectionUpdate) => void
      onSelectionRect: (handler: (payload: CaptureSelectionUpdate) => void) => void
      onConfirmRequest: (handler: (payload: { sessionId: number }) => void) => void
      requestClose: (payload: CaptureCloseRequest) => void
      saveImageToClipboard: (dataUrl: string) => void
      saveImage: (dataUrl: string) => Promise<unknown>
    }
  }
}

export {}
