# 截图页交互优化计划（待确认态 + 工具栏）

## 目标

- 松开鼠标后不结束截图：结束框选后进入“待确认”状态，仅在点击“✓确认”后才执行裁剪/保存并关闭窗口。
- 右下角出现工具栏：在进入“待确认”状态时展示确认/取消按钮（固定右下角或按需调整位置）。

## 现状核对（基于当前代码）

- 源码已具备“待确认态 + 工具栏”逻辑：
  - 结束框选：`onMouseUp/onPointerUp -> endSelection()`，选区满足阈值后 `isPendingConfirm=true` 并 `setToolbarVisible(true)`。
  - 真正结束截图：仅在 `onConfirmClick -> finishSelection()` 内执行保存与 `window.close()`。
  - 页面已包含 `#capture-toolbar`（初始 `hidden`）。
- 你现在看到的“松开完成截图 + 没有工具栏”，更像是运行了构建产物：
  - `out/renderer/capture.html` 当前没有工具栏，提示文本仍是“松开完成截图”，说明 renderer build 产物未更新。
  - `pnpm start`（preview）会加载 `out/renderer/capture.html`，而 `pnpm dev` 会走 `http://localhost:5173/capture.html`（直接使用 `src/renderer/capture.html`）。

## 实施步骤

1. **统一确认目标运行模式**
   - 若你在用 `pnpm dev`：继续排查“为何未进入待确认态/工具栏未显示”（通常是事件流未触发 `endSelection()` 或选区尺寸始终未过阈值）。
   - 若你在用 `pnpm start`：先把 renderer build 产物更新到包含工具栏与待确认逻辑（否则页面/脚本仍是旧版本）。

2. **保证“松开后进入待确认态”的事件链稳定**
   - 复核并增强输入事件处理，避免在某些 Electron/系统下出现「pointer/mouse 兼容事件混用导致松开事件没触发 `endSelection()`」的问题。
   - 方案优先级：
     - 优先方案：只保留 Pointer Events（mouse 也走 pointer），减少两套事件并存的分叉。
     - 保守方案：保留两套，但在“松开”时以 `isSelecting` 为准触发 `endSelection()`，降低对 `activeInput` 的依赖，避免状态卡死从而不显示工具栏。

3. **修复/强化工具栏显示**
   - 保持工具栏 DOM 来源一致（优先使用 `capture.html` 的元素；仅在缺失时动态创建）。
   - `setToolbarVisible(true)` 时确保不会被残留的 `display:none` 或 `hidden` 状态挡住；必要时改为只切 `hidden`，把 `display` 交给 CSS。
   - 如仍不出现，增加最小化诊断：在进入 `endSelection()` 的分支打印选区宽高与 `toolbarEl.hidden/style.display`，确认是否进入展示分支以及 DOM 实际状态。

4. **验证**
   - 框选后：提示文字切换到“点击✓确认”，右下角工具栏出现。
   - 点击 ✓：执行裁剪/保存并关闭截图窗口。
   - 点击 ✕ / Esc / 右键：取消并关闭截图窗口。
   - 选区过小（<5px）：不进入待确认态、不展示工具栏。

## 涉及文件

- `src/renderer/capture.html`
- `src/renderer/capture.ts`
- （如你需要在 preview/产物模式下立刻生效）`out/renderer/*` 将通过构建产物更新，而不是手工编辑。

