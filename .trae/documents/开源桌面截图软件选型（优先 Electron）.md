## Electron 优先（开源）

- Kap（macOS，Electron）：https://github.com/wulkano/kap

## 非 Electron 但成熟（开源）

- Flameshot（跨平台）：https://github.com/flameshot-org/flameshot
- ShareX（Windows）：https://github.com/ShareX/ShareX
- Greenshot（Windows 为主）：https://github.com/greenshot/greenshot
- ksnip（跨平台）：https://github.com/ksnip/ksnip

## 下一步（你确认后我再继续）

1. 根据你的系统（Windows/macOS/Linux）和必需功能（滚动截图/录屏/OCR/贴图置顶/上传）做对比表。
2. 针对“必须 Electron”的情况，给出可行架构：Electron 壳 + 各平台原生截图能力（Windows DXGI/GDI、macOS ScreenCaptureKit/CG、Linux X11/Wayland）及可复用模块建议。

## 我需要你选一下（选项即可）

- 目标系统：Windows / macOS / Linux / 全平台？
- 必需功能：滚动截图？录屏？OCR？贴图置顶？标注？上传？
