import React from 'react'
import { createRoot } from 'react-dom/client'
import { MaskApp } from './MaskApp'

declare global {
  interface Window {
    __maskInitSeq?: number
    __maskInitPayload?: unknown
    __maskSelectionSeq?: number
    __maskSelectionPayload?: unknown
  }
}

function publishMaskInit(payload: unknown) {
  const seq = (window.__maskInitSeq ?? 0) + 1
  window.__maskInitSeq = seq
  window.__maskInitPayload = payload
  window.dispatchEvent(new CustomEvent('mask:init', { detail: { seq, payload } }))
}

function publishMaskSelection(payload: unknown) {
  const seq = (window.__maskSelectionSeq ?? 0) + 1
  window.__maskSelectionSeq = seq
  window.__maskSelectionPayload = payload
  window.dispatchEvent(new CustomEvent('mask:selection', { detail: { seq, payload } }))
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
