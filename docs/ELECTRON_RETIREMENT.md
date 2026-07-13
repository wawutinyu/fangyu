# 扔 Electron 检查清单（已完成）

> **2026-07-14：`fangyu-desktop` 已删除。** 日常入口为 Windows 原生（`install-native.bat` / `dev-native.bat`）或网页序 + 行托盘。

## 退役门槛（历史勾选）

### A. 行可交付（无 Electron）

- [x] **A1** Node 守护进程
- [x] **A2** Windows 托盘 MVP
- [x] **A3** `install-worker.bat`
- [x] **A4** 原生安装入口 + NSIS（`install-native.bat` / `build-native.bat`）
- [~] **A5** 外人安装验收 — *有条件通过；产品主路径已切原生*

### B. 序 → 行主链路

- [x] **B1–B4** 派发 / 历史 / 行面板 / Happy Path
- [x] **B5** 提前关闭：原生已成主入口，Electron 包已删（不等 4 周）

### C. 文档与入口

- [x] **C1–C3** README / 手册入口已改
- [x] **C4** workspaces 已移除 `fangyu-desktop`

### D. 删包

- [x] **D1** 删除 `fangyu-desktop/`、`dev-desktop.bat`、`docs/ELECTRON_SMOKE.md`
- [x] **D2** 根 `package.json` 去掉 desktop workspace 与脚本
- [x] **D3** 文档与引用清理
- [x] **D4** 提交：`chore: retire fangyu-desktop (Electron)`

## 当前判定

| 项 | 结论 |
|----|------|
| 日常入口 | **`install-native.bat` / 桌面 Fangyu** |
| Electron | **已退役** |

## 相关

- [方隅 Windows 原生](../fangyu-worker-tauri/README.md)
- [Happy Path 验收](HAPPY_PATH_ACCEPTANCE.md)
