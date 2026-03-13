# React 重构与依赖对齐 Spec

## Why
当前渲染进程 UI 使用字符串模板与手写 DOM 操作，扩展与维护成本较高。引入 React 组件化并参考 Snow Shot 的前端依赖选型，有利于后续 UI 迭代与功能扩展。

## What Changes
- 在当前 Electron + electron-vite 项目中接入 React（TSX 入口、Vite React 插件等），替换渲染进程的手写 DOM 渲染方式。
- 对照 Snow Shot 的 `package.json` 依赖清单，分析依赖用途，并仅挑选“可在本项目落地且短期能产生价值”的依赖加入当前项目：
  - **React 基础**：`react`、`react-dom`（渲染进程 UI 框架）
  - **UI 组件**：`antd`、`@ant-design/icons`（用于设置页/历史列表的表单、按钮、列表等）
  - **时间处理**：`dayjs`（历史列表时间格式化）
  - **快捷键输入辅助（可选）**：`react-hotkeys-hook`（用于“录入快捷键”类交互；全局快捷键注册仍在主进程完成）
  - **滚动容器（可选）**：`react-scrollbars-custom`（历史列表较长时的滚动体验）
  - **通用工具（可选）**：`es-toolkit`（小型工具函数；仅在确有需求时引入）
- 明确不引入或不在本次范围内使用的 Snow Shot 依赖（示例）：
  - `@tauri-apps/*` 与 `tauri-plugin-*`（本项目为 Electron，不适用）
  - `pixi.js`、`pixi-filters`、`@tweenjs/tween.js`（图形渲染/动画需求不匹配当前范围）
  - `openai`、`react-intl`、`react-markdown`、`remark-*`、`rehype-katex`（当前设置页/截图流程不需要）
  - `@tanstack/react-router`（当前为多入口页面，未计划合并为单页路由）
- 将“设置页 + 历史列表”（`src/renderer/index.html` 对应入口）重构为 React 组件，实现与现有 `window.api` IPC 能力一致的交互。
- `capture` / `editor` 两个渲染入口在本次作为兼容目标：优先保证不被破坏；是否进一步 React 化作为后续增量任务处理。

## 依赖用途分类（Snow Shot）
- **应用框架/运行时**：`react`、`react-dom`（组件化 UI）；`@tanstack/react-router`（路由，适用于单页应用）；`styled-jsx`（组件内样式方案）。
- **UI/表单体系**：`antd`、`@ant-design/icons`（基础 UI）；`@ant-design/pro-components`、`@ant-design/pro-form`（更高层的业务组件/表单封装）；`@ant-design/x`（实验性/扩展组件）；`@ant-design/v5-patch-for-react-19`（为 React 19 兼容做的补丁）。
- **桌面端能力（Tauri 专用）**：`@tauri-apps/api`、`@tauri-apps/plugin-*`、`tauri-plugin-*`（系统能力/窗口状态/全局快捷键/文件系统等；仅适用于 Tauri 技术栈）。
- **图形渲染/画布编辑**：`@mg-chao/excalidraw`（画布编辑器）；`pixi.js`、`pixi-filters`（WebGL/2D 渲染及滤镜）；`@tweenjs/tween.js`（补间动画）。
- **内容渲染（Markdown/代码/数学）**：`react-markdown`、`remark-gfm`、`remark-math`、`rehype-katex`（Markdown + 数学公式）；`react-syntax-highlighter`（代码高亮）；`github-markdown-css`（Markdown 样式）。
- **快捷键/调度/交互小工具**：`react-hotkeys-hook`（React 侧快捷键监听）；`raf-schd`（基于 requestAnimationFrame 的节流）；`use-interval`（Interval Hook）。
- **时间/工具库/环境识别**：`dayjs`（时间处理）；`es-toolkit`（工具函数集合）；`platform`（UA/平台识别）；`url-join`（拼接 URL）；`js-base64`（Base64 编解码）；`compare-versions`（版本比较）；`color`（颜色处理）；`flatbush`（空间索引，适用于大量点/区域检索）。
- **图像导出/压缩**：`html-to-image`（DOM 转图片，适合导出 UI）；`turbo-png`（PNG 压缩/优化）。
- **AI/网络能力**：`openai`（对接 OpenAI API；与业务强绑定，按需引入）。
- **工程化/构建（devDependencies）**：`@rsbuild/*`、`@rsdoctor/*`、`@rsbuild/plugin-node-polyfill`（Rspack/Rsbuild 构建链、分析与 Node polyfill）；`@tanstack/router-plugin`（路由编译期插件）；`@swc/plugin-styled-jsx`（styled-jsx 编译支持）。
- **代码质量与协作（devDependencies）**：`@biomejs/biome`（格式化/Lint）；`husky`、`lint-staged`（Git hooks）；`@commitlint/*`（提交信息规范）；`cross-env`（跨平台环境变量）；`rimraf`（跨平台删除）；`@types/*`、`typescript`（类型与编译）。

## 最终选型
本项目保持 Electron + electron-vite 既有构建链不变，仅引入“能直接支撑渲染进程从手写 DOM 迁移到 React + 组件库”的最小依赖集合，并显式排除所有 Tauri 专用依赖（`@tauri-apps/*`、`tauri-plugin-*`）。
- **dependencies（渲染进程运行时必需）**：`react`、`react-dom`、`antd`、`@ant-design/icons`、`dayjs`
- **devDependencies（仅开发/构建期需要）**：`@vitejs/plugin-react`、`@types/react`、`@types/react-dom`
- **暂不引入（保留为可选项，确有需求再加）**：`react-hotkeys-hook`（仅用于快捷键录入场景）、`react-scrollbars-custom`（列表滚动体验）、`es-toolkit`（工具函数；避免过早引入造成依赖漂移）

## Impact
- Affected specs: 渲染进程 UI 框架、依赖选型与页面组织方式
- Affected code: `package.json`、`electron.vite.config.mts`、`src/renderer/*`（入口与 UI 实现）、可能涉及 `tsconfig.json`

## ADDED Requirements
### Requirement: React 设置页
系统 SHALL 提供一个基于 React 的设置页与历史列表页面，并保持与现有功能一致。

#### Scenario: 读取设置成功
- **WHEN** 页面加载
- **THEN** 通过 `window.api.getSettings()` 拉取设置并回填到表单控件

#### Scenario: 保存设置成功
- **WHEN** 用户修改设置并点击“保存”
- **THEN** 调用 `window.api.updateSettings(patch)` 保存，并在界面上展示成功提示

#### Scenario: 刷新历史列表
- **WHEN** 用户点击“刷新”
- **THEN** 调用 `window.api.getHistory()` 并渲染历史列表（包含时间与文件路径）

#### Scenario: 清空历史列表
- **WHEN** 用户点击“清空历史”
- **THEN** 调用 `window.api.clearHistory()`，随后刷新列表

#### Scenario: 贴最近截图
- **WHEN** 用户点击“贴最近截图”
- **THEN** 调用 `window.api.pinLast()`

### Requirement: 依赖引入边界
系统 SHALL 仅引入在 Electron 渲染进程可用、且对当前 UI 重构有直接收益的 Snow Shot 依赖；不应引入 Tauri 专用依赖作为运行时依赖。

## MODIFIED Requirements
### Requirement: 现有设置功能
设置项（快捷键、自动保存、保存目录、截图后打开编辑器）与历史功能在 React 重构后 SHALL 行为保持一致。

## REMOVED Requirements
无
