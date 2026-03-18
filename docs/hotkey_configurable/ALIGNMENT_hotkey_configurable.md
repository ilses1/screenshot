## 项目上下文分析

- 技术栈：Electron + React + Ant Design + TypeScript
- 关键模块：
  - 设置页（渲染进程）：`src/renderer/pages/settings/entry.tsx`
  - 预加载桥：`src/preload/index.ts`（`window.api.getSettings/updateSettings`）
  - 主进程：`src/main/index.ts`（`loadConfig/saveConfig/registerShortcuts`、IPC handlers）
- 当前现状：
  - 配置结构已包含 `hotkey: string`，但主进程会强制写回 `F1`，设置页也固定显示 `F1` 且不可编辑。

## 原始需求

配置页增加“修改截图快捷键”功能；期望修改快捷键时能读取用户键盘按下的按键组合，并把它保存为指定快捷键，使截图触发快捷键可配置。

## 边界确认（任务范围）

- 范围内：
  - 设置页提供快捷键编辑入口，并在编辑态捕获用户键盘输入组合，转为 Electron `globalShortcut` 可接受的 accelerator 字符串并保存。
  - 主进程读取并持久化用户设置的 `hotkey`，并据此动态注册全局截图快捷键，同时更新托盘提示文案。
  - 对失败场景（无效按键、被系统占用导致注册失败）给出可理解的提示，并避免留下不可用配置。
- 范围外：
  - 多快捷键、快捷键冲突检测（除注册失败外的全量占用扫描）。
  - 平台级按键映射的极致优化（例如所有键盘布局/IME 的差异处理）。
  - 复杂权限引导（例如 Windows 管理员权限申请流程）。

## 需求理解（对现有项目的理解）

- `globalShortcut.register(accelerator, handler)` 用于注册全局快捷键；注册失败会返回 `false`。
- 设置页通过 `window.api.updateSettings(patch)` 触发主进程写入 `config.json` 并重新注册快捷键。
- 当前实现使用 `globalShortcut.unregisterAll()` 会影响会话内 Enter/Esc 等辅助快捷键；需要避免误伤。

## 疑问澄清（智能决策与假设）

- 快捷键格式采用 Electron accelerator 字符串（例如 `Ctrl+Shift+A` / `Command+Shift+5` / `F1`），这是主进程注册所需格式。
- 录入交互采用“进入录制态 → 捕获一次按键组合 → 用户确认应用”，避免误触。
- 默认快捷键保持 `F1`；若用户设置的快捷键注册失败，将回退到旧值并提示失败原因（尽量明确但不暴露内部细节）。

