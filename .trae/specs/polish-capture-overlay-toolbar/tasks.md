# Tasks
- [x] Task 1: 调整截图遮罩渲染（未选中更深、选中透明）
  - [x] 更新遮罩绘制逻辑：仅对未选中区域覆盖半透明深色
  - [x] 保持选中区域仅边框/辅助线可见

- [x] Task 2: 增加“选区待确认”状态与右下角工具栏
  - [x] 松开鼠标后进入待确认状态，选区保持但不结束
  - [x] 右下角展示确认工具栏（对钩确认/取消）
  - [x] 点击确认触发原结束流程；取消保持原行为

- [x] Task 3: 回归验证
  - [x] Esc/右键取消仍可用
  - [x] 不选择区域时不显示工具栏
  - [x] capture/editor/index 入口不受影响

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
