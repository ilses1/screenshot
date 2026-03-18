# Fix Screenshot Selection (Offset) - Consensus

## Requirement Description
- Selection rectangle/overlay must align with the real pointer drag area (no offset).
- Temporarily support only single-display capture to avoid current multi-display issues.

## Root Cause
In the input layer, selection coordinates were computed via:
`rel = event.screenX/screenY - window.screenX/window.screenY`.
Under Windows multi-monitor and/or DPI scaling, this mapping can be inconsistent, causing the mask hole and final crop to drift relative to the cursor.

## Technical Implementation
- **Renderer**: `src/renderer/pages/capture/InputControllerApp.tsx`
  - Compute selection point using `clientX/clientY` (viewport-relative inside the full-window overlay).
- **Main Process**: `src/main/index.ts`
  - When starting capture, select only one `Display` (the one nearest to cursor) and build the capture payload for that display only.
  - Still keep the source-mapping fallback using the full display list to avoid picking the wrong screen source.

## Acceptance Criteria
1. Dragging selection aligns with the visual hole on the same screen (no offset).
2. Confirmed output image content matches the selected area.
3. Capture only affects the display under the cursor (no spanning / no multi-display).
4. Esc/RightClick cancels as before.
