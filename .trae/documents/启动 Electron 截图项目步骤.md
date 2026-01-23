## 启动前检查
- 在终端中切到项目目录：`cd C:\Users\wusan\Desktop\screenshot`。
- 确保已安装 Node.js，并且 npm 版本不是太旧（建议 `npm -v` ≥ 9）。

## 安装依赖
- 在项目目录执行：`npm install`
- 如果再次出现 `Cannot read properties of null (reading 'matches')`：
  - 先在任意终端执行：`npm install -g npm@latest` 升级 npm。
  - 然后重新回到项目目录：`cd C:\Users\wusan\Desktop\screenshot && npm install`。
- 本项目已在 `.npmrc` 中配置好：
  - `registry=https://registry.npmmirror.com`
  - `electron_mirror=https://npmmirror.com/mirrors/electron/`
 这些配置会让 Electron 走国内镜像下载。

## 启动开发环境
- 依赖安装完成后，在项目目录执行：`npm run dev`。
- 启动成功时终端会显示：
  - `build the electron main process successfully`
  - `build the electron preload files successfully`
  - `dev server running for the electron renderer process at: http://localhost:5173/`
- 此时会自动弹出 Electron 应用窗口，并在托盘看到图标。

## 使用验证
- 默认快捷键：按 `Alt + \`` 触发截图，拖拽选取区域后自动复制到剪贴板。
- 托盘右键 → “设置”：
  - 修改快捷键
  - 开关“自动保存到文件”、“截图后自动打开编辑器”等
- 在设置页底部可查看截图历史并点击“贴最近截图”测试贴图功能。

——
按照以上步骤在你本机执行命令即可完成项目启动；如果某一步有新的报错，把完整终端输出贴给我，我再针对性调整方案。