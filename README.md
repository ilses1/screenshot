# electron-screenshot

[简体中文](README.zh-CN.md)

An Electron-based screenshot tool that lives in the system tray. Trigger capture with a global hotkey, drag to select a region, then confirm to copy to clipboard and optionally save to file / open the editor.

## Features

- Tray app: quick actions for “Screenshot”, “Settings”, and “Quit”
- Global hotkey capture (default: `F1`), configurable from the Settings page
- Region selection: drag to select, click `✓` or press `Enter` to confirm, press `Esc` or right click to cancel
- Copy to clipboard on confirm
- Optional auto-save PNG files and keep a local history list (path copy supported)
- Optional auto-open editor after capture
- Adjustable mask opacity (`maskAlpha`)
- “Pin last screenshot” (always-on-top, draggable/resizable image window)

## Install (Download from Releases)

Releases currently provide a Windows installer only.

1. Open the GitHub Releases page and choose the latest version.
2. Download the `.exe` installer (usually named `Electron Screenshot Setup *.exe`).
3. Run the installer (you may need to allow Windows SmartScreen).
4. After installation, the app stays in the system tray:
   - Press `F1` to start a capture (default hotkey)
   - Use tray menu → “Settings” to change hotkey / save directory, etc.

Tip:
- If the global hotkey can’t be registered, try another combo or run as Administrator.

## Prerequisites

- Node.js (recommended: latest LTS)
- pnpm (see `package.json#packageManager`)

## Install

```bash
pnpm install
```

## Commands

```bash
pnpm dev
pnpm build
pnpm start
pnpm dist
pnpm test
```

- `pnpm dev`: start development mode (loads renderer from Vite dev server).
- `pnpm build`: build to `out/` for production preview / packaging.
- `pnpm start`: preview the built output (run `pnpm build` first).
- `pnpm dist`: create installers via electron-builder (run `pnpm build` first).
- `pnpm test`: run Vitest.

## Configuration

Open the tray menu → “Settings”.

- Screenshot hotkey (`hotkey`)
  - Default: `F1`
  - Click the input to record a new hotkey, then click “Save settings” to apply.
  - Supported: function keys (`F1`–`F24`) or modifier combos (e.g. `Ctrl+Shift+A`).
  - If registration fails (occupied / not allowed), the save will be rejected and the previous hotkey is kept.
- Auto save to file (`autoSaveToFile`)
  - When enabled, the capture is written as a PNG file and recorded in the history list.
- Save directory (`saveDir`)
  - Only used when auto-save is enabled.
  - Default value is the platform Pictures directory + `ElectronScreenshot` (if not set).
- Open editor after capture (`openEditorAfterCapture`)
  - When enabled, the editor window opens and loads the captured image automatically.
- Mask opacity (`maskAlpha`)
  - Range: `0.60`–`0.80`
  - Default: `0.70`

## Usage

1. Run the app and keep it in the tray.
2. Trigger capture:
   - Press the hotkey (default `F1`), or
   - Click “Screenshot” from the tray menu.
3. Drag with the left mouse button to select an area.
4. Release the mouse, then:
   - Confirm: click `✓` or press `Enter`
   - Cancel: press `Esc` or right click
5. After confirming:
   - The image is copied to clipboard
   - Optional behaviors apply based on Settings (auto-save / open editor)

## Roadmap

- [ ] Friendlier error messages when saving fails (clipboard unavailable, permission issues, etc.)
- [ ] More obvious saving UI states (disable buttons / small loading)
- [ ] Reduce production log noise (remove unrelated console.log)
- [ ] More robust coordinate mapping for Windows mixed-DPI multi-monitor setups (with fallback strategies)
- [ ] Continued improvements for cross-display selection & virtual desktop edge cases (mixed-DPI alignment)
- [ ] macOS / Linux installers (Windows-first for now)
- [ ] Auto-update support (leveraging Release metadata)

## FAQ

### Windows: mixed-DPI multi-monitor scaling

On Windows with monitors using different scaling factors (e.g. 100% + 150%), some setups may show coordinate mismatches (selection looks correct but the final crop is offset, or capture behaves unexpectedly).

Workarounds:

- Prefer setting the same scaling factor for all monitors when possible.
- Trigger capture with the cursor on the target monitor.
- Avoid relying on cross-display selection (current capture flow is display-scoped).

### Permissions / capability hints

- macOS: grant Screen Recording permission, otherwise screen capture can fail.
- Linux (Wayland): some environments restrict capture APIs; consider X11 or a proper portal configuration.
- Windows: if the hotkey can’t be registered, try another key combo or run as Administrator.
