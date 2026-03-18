# Fix Screenshot Selection (Offset) - Design

## Architecture (Single-Display Mode)
Keep the existing multi-window roles, but restrict the capture session to a single `Display`:
- **Mask Window**: rendered for the selected display only; shows dim overlay + selection hole
- **Input Window**: covers the selected display bounds; computes selection rect using viewport-relative coordinates
- **Main Process**: chooses target display (nearest to cursor), captures that display’s image, forwards selection rect

## Coordinate Contract
- Input window selection rect is in **window local coordinates** (DIP / CSS px).
- Absolute rect is computed as `abs = displayBoundsOrigin + localRect`.
- Crop is computed in **pixel space** by multiplying `localRect` by `display.scaleFactor`.

## Flow Diagram
```mermaid
graph TD
  A[User Presses F1] --> B[Main: choose display nearest cursor]
  B --> C[Create Mask Window for that display]
  C --> D[Enter selecting mode: create Input Window (same bounds)]
  D --> E[Input: pointer events -> localRect via clientX/clientY]
  E --> F[Main: forward absRect to mask for hole drawing]
  B --> G[Main: desktopCapturer capture single display]
  G --> H[Renderer: build compositeCanvas (single screen)]
  H --> I[Confirm: crop compositeCanvas using localRect * scaleFactor]
```

## Risk / Non-Goals
- Multi-display spanning selection is intentionally disabled in this phase.
- Mixed-DPI multi-monitor correctness is deferred until multi-display is reintroduced.
