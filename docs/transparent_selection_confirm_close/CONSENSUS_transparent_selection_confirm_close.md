# Transparent Selection + Confirm Close - Consensus

## Requirement Description
- The selected rectangle area is visually “cut out” from the dim mask (transparent hole).
- Clicking ✓ confirms and saves the selected screenshot.
- Capture windows close only after the save operation succeeds.

## Current Behavior / Gap
- The mask already renders a transparent hole using canvas composition.
- Clicking ✓/✕ can be unreliable because the root pointer handler may treat the click as a new selection start, resetting pending-confirm state before the button `onClick` runs.
- The capture UI closes even if save fails, because close is triggered in a `finally` path.

## Technical Decision
- In the input window:
  - Prevent pointer events on ✓/✕ from bubbling to the root selection handlers.
  - Change confirm flow to `await saveImage(...)` and only request close if it resolves.
  - On error, keep the overlay and show a minimal failure tip so users can retry or cancel.

## Acceptance Criteria
1. While selecting, the mask shows a dim overlay with a transparent hole for the selected region.
2. Clicking ✓ saves the image (clipboard + optional file) and then closes all capture windows.
3. If saving fails, capture windows stay open and user can retry ✓ or cancel ✕/Esc.
4. Clicking ✓/✕ never starts a new selection.
