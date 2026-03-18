# Transparent Selection + Confirm Close

## Project Context
The project is an Electron-based screenshot application using a multi-window capture flow:
- **Mask Windows**: render dimmed overlay and a transparent “hole” for the selected region
- **Input Window**: transparent overlay that receives pointer events and shows ✓/✕ toolbar
- **Main Process**: creates windows, performs desktopCapturer calls, handles save/close IPC

## Original Requirement
1. During selection, the selected region should be **transparent** (showing the underlying desktop through the mask).
2. Clicking **✓** should confirm the selection and trigger screenshot saving reliably.
3. After the screenshot is **successfully saved**, close the mask/overlay windows.

## Scope / Boundary
- In scope:
  - Ensure the mask “hole” remains transparent while selecting.
  - Fix pointer event handling so clicking ✓/✕ does not accidentally restart selection.
  - Close capture windows only after save succeeds (IPC invoke resolves).
- Out of scope:
  - Adding new editor features.
  - Changing capture hotkeys.
  - Reworking multi-display capture composition logic.

## Notes / Hypothesis
- The mask window already uses canvas `destination-out` to “cut” a transparent hole.
- The ✓/✕ buttons live inside a full-screen pointer surface; without stopping event propagation, clicking ✓ can trigger the root `onPointerDown`, which clears the pending-confirm state and makes ✓ a no-op.
