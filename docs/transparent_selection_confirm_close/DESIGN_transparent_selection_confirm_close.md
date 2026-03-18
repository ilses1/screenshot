# Transparent Selection + Confirm Close - Design

## Components
- **Input Controller (renderer)**: `src/renderer/pages/capture/InputControllerApp.tsx`
  - Owns selection state machine (selecting → pending-confirm).
  - Renders ✓/✕ toolbar.
  - Crops from compositeCanvas and invokes main-process save via IPC.
- **Mask (renderer)**: `src/renderer/pages/mask/MaskApp.tsx`
  - Draws dim overlay + transparent hole using `destination-out`.
- **Main (electron main process)**: `src/main/index.ts`
  - Handles `CAPTURE_SAVE_IMAGE` (writes clipboard, optional file save).
  - Handles `CAPTURE_CLOSE` (closes mask/input windows).

## Interaction Flow
```mermaid
sequenceDiagram
  participant User
  participant Input as InputWindow (InputControllerApp)
  participant Main as MainProcess
  participant Mask as MaskWindow (MaskApp)

  User->>Input: Drag to select
  Input->>Main: CAPTURE_SELECTION_UPDATE(absRect)
  Main->>Mask: CAPTURE_SELECTION_BROADCAST(absRect)
  Mask->>Mask: Draw dim + destination-out hole

  User->>Input: Click ✓
  Input->>Input: Stop pointer event propagation
  Input->>Main: CAPTURE_SAVE_IMAGE(dataUrl) (invoke)
  Main-->>Input: resolve (success) / reject (fail)
  alt success
    Input->>Main: CAPTURE_CLOSE(finishing)
  else fail
    Input->>Input: Show failure tip, keep toolbar
  end
```

## Error Handling Strategy
- **Save success**: request close immediately after IPC invoke resolves.
- **Save failure**: do not close; surface a short tip text; allow retry/cancel.

## Non-Goals
- No changes to capture image composition.
- No changes to mask rendering algorithm beyond ensuring the hole stays transparent.
