# 截图异常日志规范

## 目标
- 统一错误输出格式，便于在多屏、高 DPI、权限受限、远程桌面、录屏软件等场景下快速定位问题
- 避免输出敏感信息（不记录用户路径、屏幕内容、截图 dataUrl）

## 输出格式
- 统一前缀：`[capture:error]`
- 统一载荷：JSON 单行

字段：
- `sessionId`：截图会话 ID（0 表示尚未进入会话）
- `code`：错误码（见下方错误码表）
- `stage`：错误发生阶段（precheck/mask-load/input-load/desktop-capture/map-source/thumbnail/cleanup/unknown）
- `message`：可读错误信息
- `platform`：运行平台（win32/darwin/linux）
- `details`：可选对象，用于携带诊断字段（例如 displayId、errorCode、sessionType 等）

示例：
```json
[capture:error] {"sessionId":12,"code":"CAPTURE_DESKTOP_CAPTURER_FAILED","stage":"desktop-capture","message":"desktopCapturer.getSources failed","platform":"win32","details":{"displayId":1,"error":"Error: ..."}}
```

## 错误码表
来源：[capture.ts](file:///c:/Users/wusan/Desktop/screenshot/src/common/capture.ts#L67-L99)
- `CAPTURE_ALREADY_ACTIVE`：重复启动截图会话
- `CAPTURE_NO_DISPLAYS`：无法获取到显示器列表
- `CAPTURE_MACOS_SCREEN_PERMISSION`：macOS 屏幕录制权限缺失或无法读取权限状态
- `CAPTURE_LINUX_WAYLAND_LIMITATION`：Linux Wayland 环境可能限制抓屏能力（提示型）
- `CAPTURE_DESKTOP_CAPTURER_FAILED`：desktopCapturer.getSources 调用失败
- `CAPTURE_SOURCES_EMPTY`：desktopCapturer 返回空 sources
- `CAPTURE_SOURCE_MAP_FAILED`：sources 与 Display 映射失败
- `CAPTURE_THUMBNAIL_EMPTY`：source.thumbnail 为空
- `CAPTURE_WINDOW_LOAD_FAILED`：遮罩窗口或输入窗口页面加载失败
- `CAPTURE_UNKNOWN`：未归类异常

## 极端场景诊断建议
- macOS 权限：检查“系统设置 → 隐私与安全性 → 屏幕录制”，授予应用权限后重启应用
- Wayland：若抓屏失败或得到空白，尝试切换到 X11 或配置桌面环境的截图 portal 能力
- 录屏/远程桌面：若出现空 thumbnail，优先关注 `CAPTURE_THUMBNAIL_EMPTY` 与 `CAPTURE_DESKTOP_CAPTURER_FAILED`，并在 `details` 中查看 displayId 与 error 信息

