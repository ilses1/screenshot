import React from 'react'
import { createRoot } from 'react-dom/client'
import { CaptureApp } from './CaptureApp'

const container = document.getElementById('app')

if (!container) {
  throw new Error('capture root element not found')
}

createRoot(container).render(
  <React.StrictMode>
    <CaptureApp />
  </React.StrictMode>
)

