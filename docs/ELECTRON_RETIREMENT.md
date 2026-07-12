# 扔 Electron 检查清单

> 目标：用 **方隅·行**（`fangyu-worker`）完全替代 `fangyu-desktop`，再删除该包。  
> 日常推荐：`dev.bat`（序）+ `dev-worker-tray.bat` / 安装脚本（行）。

## 退役门槛（全部勾选后才删包）

### A. 行可交付（无 Electron）

- [x] **A1** Node 守护进程：注册 / 心跳 / 轮询 / shell·run_flow·文件·Adapter
- [x] **A2** Windows 托盘 MVP（`dev-worker-tray.bat`），不依赖 Electron / Rust
- [x] **A3** 一键安装脚本：`install-worker.bat`（依赖检查 + 桌面快捷方式 `Fangyu-Worker.lnk`）
- [ ] **A4** 原生安装包（Tauri / MSI）— *可选升级；A3 可作为正式过渡交付*
- [ ] **A5** 未参与开发的同事：按 README 10 分钟内装上行并看到托盘

### B. 序 → 行主链路稳定

- [x] **B1** 画布「派发至行」+ 发布快照 + Worker 选择
- [x] **B2** 版本历史可「派发行」
- [x] **B3** 方隅·行面板：舰队 / 任务事件 / MQTT·Adapter 快测
- [x] **B4** `py scripts/worker_happy_path.py --spawn-worker` 本机全绿
- [ ] **B5** 团队连续 **4 周**日常只用序+行，无人依赖 `dev-desktop.bat`

### C. 文档与入口清理

- [x] **C1** 根 README 以序+行为主入口；Electron 标为可选过渡
- [x] **C2** `fangyu-canvas` / `fangyu-studio` README 不再把 desktop 写成「行」
- [x] **C3** `USER_GUIDE` 默认路径改为托盘 Worker；Electron 挪到附录
- [ ] **C4** CI / `package.json` workspaces 移除 `fangyu-desktop`（删包时一并做）

### D. 删包动作（门槛满足后一次做完）

- [ ] **D1** 删除 `fangyu-desktop/`、`dev-desktop.bat`、`docs/ELECTRON_SMOKE.md`
- [ ] **D2** 根 `package.json` 去掉 desktop workspace 与 `dev:desktop` / `build:desktop`
- [ ] **D3** 全局搜索清理 `fangyu-desktop` / `dev-desktop` 引用
- [ ] **D4** 提交：`chore: retire fangyu-desktop (Electron)`

## 当前判定

| 项 | 结论 |
|----|------|
| 能否日常不用 Electron？ | **可以**（序 Web + 行托盘） |
| 能否现在删 `fangyu-desktop`？ | **不建议** — 缺 A5（外人安装验收）与 B5（4 周观察） |
| A4 Tauri 是否阻塞退役？ | **否** — A3 安装脚本可作正式过渡；Tauri 为体验升级 |

## 建议节奏

1. **本周**：用 `install-worker.bat` + Happy Path 做一次「外人视角」验收（A5）
2. **起算 4 周**：默认禁止 `dev-desktop.bat`（B5）
3. **并行可选**：Rust 就绪后再做 A4
4. **B5 到期**：执行 D1–D4

## 相关文档

- [Electron 冒烟（过渡）](ELECTRON_SMOKE.md)
- [方隅·行 README](../fangyu-worker/README.md)
- [L1 路线图](L1_ROADMAP.md)
