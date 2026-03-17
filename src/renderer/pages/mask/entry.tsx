import React from 'react'
import { createRoot } from 'react-dom/client'
import { MaskApp } from './MaskApp'

const container = document.getElementById('app')
if (!container) {
  throw new Error('mask root element not found')
}

createRoot(container).render(
  <React.StrictMode>
    <MaskApp />
  </React.StrictMode>
)

