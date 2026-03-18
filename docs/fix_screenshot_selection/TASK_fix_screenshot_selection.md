# Fix Screenshot Selection (Offset) - Task

## Atomized Tasks

### Task 1: Fix input coordinate mapping
- **Input**: `src/renderer/pages/capture/InputControllerApp.tsx`
- **Action**: Replace `screenX/screenY - window.screenX/screenY` with `clientX/clientY`.
- **Output**: Selection rect and mask hole align with cursor drag.

### Task 2: Downgrade to single-display capture
- **Input**: `src/main/index.ts`
- **Action**: Choose target display by cursor position and only create capture windows / capture background for that display.
- **Constraints**: Keep screen source mapping using the full display list to avoid wrong source selection.
- **Output**: Capture works on the display under cursor; multi-display spanning is disabled.

### Task 3: Manual verification
- **Input**: Running app
- **Action**: Trigger capture, drag-select, confirm, compare output with expected area.
- **Output**: Verified alignment and output correctness.
