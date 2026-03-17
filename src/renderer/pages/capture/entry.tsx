import React from 'react'
import { createRoot } from 'react-dom/client'
import { InputControllerApp } from './InputControllerApp'

declare global {
  interface Window {
    __captureBgSeq?: number
    __captureBgPayload?: CaptureSetBackgroundPayload
  }
}

function publishCaptureBackground(payload: CaptureSetBackgroundPayload) {
  const seq = (window.__captureBgSeq ?? 0) + 1
  window.__captureBgSeq = seq
  window.__captureBgPayload = payload
  window.dispatchEvent(
    new CustomEvent('capture:set-background', {
      detail: { seq, payload }
    })
  )
}

try {
  window.captureApi?.onSetBackground?.((payload: CaptureSetBackgroundPayload) => {
    publishCaptureBackground(payload)
  })
} catch {
}

const container = document.getElementById('app')

if (!container) {
  throw new Error('capture root element not found')
}

createRoot(container).render(
  <React.StrictMode>
    <InputControllerApp />
  </React.StrictMode>
)
