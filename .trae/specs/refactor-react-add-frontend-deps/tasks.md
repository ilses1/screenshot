# Tasks

* [x] Task 1: 评估并选定可引入的 Snow Shot 前端依赖

  * [x] 从 Snow Shot 依赖中按“本项目可用/短期收益”筛选清单

  * [x] 明确本次不引入的依赖及原因（Electron/Tauri、图形渲染、AI 等）

* [x] Task 2: 在 electron-vite 渲染进程接入 React 基础设施

  * [x] 添加 React 相关依赖与 Vite React 插件

  * [x] 调整渲染入口以支持 TSX（保持多页面入口结构）

  * [x] 确保 TypeScript 对 JSX/TSX 配置可用

* [x] Task 3: 将设置页与历史列表重构为 React + antd

  * [x] 实现设置表单（快捷键、自动保存、保存目录、打开编辑器）

  * [x] 实现历史列表（刷新、清空、贴最近截图）

  * [x] 使用 dayjs 格式化历史时间

* [x] Task 4: 兼容性验证与回归检查

  * [x] index/capture/editor 三个入口均可正常打开

  * [x] 核对 IPC 调用与旧版一致（不新增破坏性接口）

# Task Dependencies

* Task 2 depends on Task 1

* Task 3 depends on Task 2

* Task 4 depends on Task 3

