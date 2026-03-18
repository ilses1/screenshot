# Transparent Selection + Confirm Close - Final

## Delivered
- 框选区域保持“挖洞透明”展示（由 mask 窗口 canvas 负责）。
- 点击 ✓/✕ 不再被根节点指针事件误触发为“重新开始框选”。
- ✓ 确认后等待保存成功再关闭遮罩；保存失败时保留遮罩并提示可重试/取消。

## Key Changes
- `InputControllerApp`：
  - 工具栏点击事件与框选指针事件隔离。
  - 保存流程改为 `await saveImage` 成功后再请求关闭。
- `CAPTURE_SAVE_IMAGE`：
  - 主进程仅在保存成功后才切换到 `finishing`，失败会抛出并上报 capture:error。

## Files
- src/renderer/pages/capture/InputControllerApp.tsx
- src/main/index.ts
- src/common/capture.ts
