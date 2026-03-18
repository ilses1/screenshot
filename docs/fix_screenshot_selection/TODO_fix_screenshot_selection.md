# Fix Screenshot Selection (Offset) - Todo

## Outstanding Items
- [ ] **手动验证**：在 Windows 多屏 + DPI 缩放场景下验证“无偏移”。
- [ ] **恢复多屏**：重新引入跨屏虚拟桌面选择，并处理混合 DPI 的 scaleFactor 对齐。
- [ ] **改进映射**：若某些环境 `desktopCapturer` 的 source 映射不稳定，考虑基于 display_id 优先 + 兜底策略增强。
