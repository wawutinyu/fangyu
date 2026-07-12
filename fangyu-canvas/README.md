# fangyu-canvas

fangyu **共享画布** — Flow / Agent 组件、Redux、工具函数、`platform` 运行时抽象。

与交付层解耦：

| 包 | 产品 | 职责 |
|---|---|---|
| **fangyu-canvas**（本包） | — | 全部 UI 与业务逻辑 |
| **fangyu-studio** | 方隅·序 | Web 管理与设计 |
| **fangyu-worker** | 方隅·行 | 本机 Worker（托盘 / Node 守护进程） |
| **fangyu-desktop** | — | Electron 过渡壳（计划退役） |

## 开发

本包不单独启动浏览器，请用：

```bash
# 仓库根目录
dev.bat                 # 方隅·序
dev-worker-tray.bat     # 方隅·行（推荐）
# install-worker.bat    # 首次：快捷方式
```

过渡壳（可选）：`dev-desktop.bat` — 见 [扔 Electron 检查清单](../docs/ELECTRON_RETIREMENT.md)。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm test` | 单元测试 |
| `npm run test:fast` | 快速单测 |
| `npm run export:seed-agents` | 导出种子 Agent 到 `data/assets/` |
