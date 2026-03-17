declare global {
  type CaptureBounds = { x: number; y: number; width: number; height: number }

  type CaptureSetBackgroundPayload =
    | {
        mode?: 'single'
        dataUrl: string
        displaySize: { width: number; height: number }
        scaleFactor: number
      }
    | {
        mode: 'multi'
        virtualBounds: CaptureBounds
        compositeScaleFactor: number
        screens: Array<{
          displayId: number
          bounds: CaptureBounds
          scaleFactor: number
          dataUrl: string
        }>
      }

  interface Window {
    captureApi: {
      onSetBackground: (handler: (payload: CaptureSetBackgroundPayload) => void) => void
      saveImageToClipboard: (dataUrl: string) => void
      saveImage: (dataUrl: string) => Promise<unknown>
    }
  }
}

export {}
