import React from 'react'
import { createRoot } from 'react-dom/client'
import { MaskApp } from './MaskApp'
import { publishBufferedEvent } from '../../shared/utils/bufferedEvent'

declare global {
  interface Window {
    __maskInitSeq?: number
    __maskInitPayload?: unknown
    __maskSelectionSeq?: number
    __maskSelectionPayload?: unknown
  }
}

function publishMaskInit(payload: unknown) {
  publishBufferedEvent({ eventName: 'mask:init', seqKey: '__maskInitSeq', payloadKey: '__maskInitPayload' }, payload)
}

function publishMaskSelection(payload: unknown) {
  publishBufferedEvent(
    { eventName: 'mask:selection', seqKey: '__maskSelectionSeq', payloadKey: '__maskSelectionPayload' },
    payload
  )
}

try {
  window.captureApi?.onMaskInit?.((payload: any) => {
    publishMaskInit(payload)
  })
  window.captureApi?.onSelectionRect?.((payload: any) => {
    publishMaskSelection(payload)
  })
} catch {
}

const container = document.getElementById('app')
if (!container) {
  throw new Error('mask root element not found')
}

createRoot(container).render(
  <React.StrictMode>
    <MaskApp />
  </React.StrictMode>
)
