# 截图遮罩与确认工具栏 Spec

## Why
当前截图交互为“拖拽选区后立即结束”，难以在结束前确认选区是否合适；同时未选中区域的遮罩对比度不够，选中区域的视觉边界不够清晰。需要提升选区确认感与工具面板一致性，让用户在确认后再结束。

## What Changes
- 未选中区域的遮罩颜色加深，提升聚焦感
- 选中区域不再叠加颜色（保持原画面），只保留边框/辅助线
- 拖拽完成选区后不立即结束，改为显示右下角工具栏：
  - 点击“对钩确认”才结束并进入后续流程
  - 仍支持 `Esc/右键` 取消
- 不引入新依赖，使用现有 `capture.html + capture.ts` 的 Canvas 渲染能力实现

## Impact
- Affected specs: 截图交互（选区确认）、遮罩渲染样式
- Affected code: `src/renderer/capture.html`、`src/renderer/capture.ts`

## ADDED Requirements
### Requirement: 遮罩对比度
系统 SHALL 将未选中区域遮罩设置为更深的半透明颜色；选中区域 SHALL 不叠加遮罩色。

#### Scenario: 选区绘制中
- **WHEN** 用户按住左键拖拽绘制选区
- **THEN** 未选中区域为更深遮罩，选中区域保持原画面不变

### Requirement: 确认工具栏
系统 SHALL 在用户完成拖拽选区后，展示右下角工具栏，并要求用户确认后才结束截图选择。

#### Scenario: 选区完成后确认
- **WHEN** 用户松开鼠标完成选区
- **THEN** 选区保持显示且不结束，右下角工具栏出现
- **WHEN** 用户点击“对钩确认”
- **THEN** 才触发结束截图选择的现有流程

### Requirement: 取消行为保持
系统 SHALL 保持既有取消行为不变：`Esc` 或右键取消截图并关闭遮罩窗口。

## MODIFIED Requirements
### Requirement: 结束时机
原“松开鼠标即结束”的行为 SHALL 修改为“松开鼠标进入待确认状态，确认后结束”。

## REMOVED Requirements
无

