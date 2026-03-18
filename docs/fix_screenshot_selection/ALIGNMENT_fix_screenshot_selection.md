# Fix Screenshot Selection (Offset)

## Project Context
The project is an Electron-based screenshot application using a multi-window capture flow:
- **Mask Windows**: render dimmed overlay and the “hole” for selected region
- **Input Window**: transparent overlay that receives pointer events and computes selection rect
- **Main Process**: creates windows, performs desktopCapturer calls, relays IPC

## Original Requirement
1. Screenshot selection rectangle is visually offset from the actual selected area; fix it.
2. Multi-display capture currently has issues; temporarily downgrade to single-display capture first.

## Scope / Boundary
- In scope:
  - Fix pointer coordinate mapping so the mask “hole” matches cursor drag.
  - Make capture run on a single display (the one under the cursor) while keeping the existing renderer payload contract.
- Out of scope (for this task):
  - Restore full multi-display spanning selection.
  - High-fidelity DPI/per-display scaleFactor correctness across mixed-DPI multi-monitor setups.

## Key Hypothesis
The offset is caused by using `screenX/screenY` and `window.screenX/window.screenY` to compute “relative” pointer positions in the input window; this can drift under Windows multi-monitor and DPI scaling. Using `clientX/clientY` inside the full-window overlay is stable.
