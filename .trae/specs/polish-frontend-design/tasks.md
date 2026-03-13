# Tasks
- [x] Task 1: 梳理设置页的视觉方向与设计令牌
  - [x] 明确页面层级（标题区/设置区/历史区）与信息密度目标
  - [x] 确定主题色、背景、间距、圆角、阴影等基础规范（不新增依赖）

- [x] Task 2: 优化设置表单的布局与反馈
  - [x] 调整字段分组与控件排列（更紧凑但可读）
  - [x] 统一 loading/disabled 策略与成功/失败提示

- [x] Task 3: 优化历史列表呈现
  - [x] 调整列宽与溢出策略，改善路径可读性与复制可发现性
  - [x] 优化空状态与加载态体验

- [x] Task 4: 回归验证（仅 index 生效）
  - [x] 确认不改动 window.api 接口与 IPC 通道
  - [x] 确认 capture/editor 入口无视觉与逻辑回归

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2
- Task 4 depends on Task 3
