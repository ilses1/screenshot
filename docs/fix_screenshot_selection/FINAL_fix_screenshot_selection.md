# Fix Screenshot Selection (Offset) - Final Report

## Summary
The selection region was offset because the input layer converted pointer coordinates using `screenX/screenY - window.screenX/screenY`, which can be inconsistent under Windows multi-monitor and DPI scaling. This incorrect local rect was then used both for mask “hole” rendering and for final crop, leading to mismatch between the drawn box and the actual capture result.

To stabilize behavior quickly, the capture session is temporarily limited to a single display (the one under the cursor) to avoid current multi-display edge cases.

## Changes Implemented
- Updated `src/renderer/pages/capture/InputControllerApp.tsx`: use `clientX/clientY` to compute selection points.
- Updated `src/main/index.ts`: select only one display (nearest cursor) for window creation and background capture, while keeping source mapping with the full display list.

## Files Modified
- `src/renderer/pages/capture/InputControllerApp.tsx`
- `src/main/index.ts`
