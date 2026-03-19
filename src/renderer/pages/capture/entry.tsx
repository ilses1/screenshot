import React from 'react'
import { createRoot } from 'react-dom/client'
import { InputControllerApp } from './InputControllerApp'
import { publishBufferedEvent } from '../../shared/utils/bufferedEvent'

declare global {
  interface Window {
    __captureBgSeq?: number
    __captureBgPayload?: CaptureSetBackgroundPayload
  }
}

function publishCaptureBackground(payload: CaptureSetBackgroundPayload) {
  publishBufferedEvent(
    { eventName: 'capture:set-background', seqKey: '__captureBgSeq', payloadKey: '__captureBgPayload' },
    payload
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
