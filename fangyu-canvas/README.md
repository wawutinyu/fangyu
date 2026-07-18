# fangyu-canvas

fangyu **共享画布** — Flow / Agent 组件、Redux、工具函数、`platform` 运行时抽象。

与交付层解耦：

| 包 | 产品 | 职责 |
|---|---|---|
| **fangyu-canvas**（本包） | — | 全部 UI 与业务逻辑 |
| **fangyu-studio** | 方隅·序 | Web 管理与设计 |
| **fangyu-worker** | 方隅·行 | 本机 Worker（托盘 / Node 守护进程） |
| **fangyu-worker-tauri** | Windows 原生 | 序 UI 1:1 + API + Worker |

## 开发

本包不单独启动浏览器，请用仓库根目录：

```bash
# macOS
./dev.sh
./scripts/mac-smoke.sh

# Windows
install-native.bat      # 推荐：原生
dev.bat                 # 仅网页序
```

连线规则见 [`docs/FLOW_CONNECTION_RULES.md`](../docs/FLOW_CONNECTION_RULES.md)。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm test` | 单元测试 |
| `npm run test:fast` | 快速单测 |
| `npm run export:seed-agents` | 导出种子 Agent 到 `data/assets/` |
