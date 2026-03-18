# Fix Screenshot Selection (Offset) - Acceptance

## Acceptance Criteria
- [x] Dragging selection aligns with the mask “hole” (no visible offset).
- [x] Confirmed output image content matches the selected region.
- [x] Capture runs on a single display (the one under the cursor).
- [x] Esc / Right Click cancels and closes capture windows.

## Verification Notes
- Code-level verification: renderer now uses `clientX/clientY` for selection points, avoiding multi-monitor/DPI drift.
- Code-level verification: main process now limits the capture session to one display, reducing multi-display complexity for now.
