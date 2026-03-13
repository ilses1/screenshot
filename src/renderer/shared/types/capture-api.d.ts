declare global {
  interface Window {
    captureApi: {
      onSetBackground: (handler: (payload: any) => void) => void
      saveImageToClipboard: (dataUrl: string) => void
      saveImage: (dataUrl: string) => Promise<unknown>
    }
  }
}

export {}

