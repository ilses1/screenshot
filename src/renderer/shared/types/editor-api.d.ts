declare global {
  interface Window {
    editorApi: {
      saveToClipboardAndPersist: (dataUrl: string) => Promise<unknown>
      onImage: (handler: (dataUrl: string) => void) => void
    }
  }
}

export {}

