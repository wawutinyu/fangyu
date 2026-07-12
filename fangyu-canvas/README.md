# fangyu-canvas

fangyu **共享画布** — Flow / Agent 组件、Redux、工具函数、`platform` 运行时抽象。

与交付层解耦：

| 包 | 产品 | 职责 |
|---|---|---|
| **fangyu-canvas**（本包） | — | 全部 UI 与业务逻辑 |
| **fangyu-studio** | 方隅·序 | Web 管理与设计 |
| **fangyu-worker** | 方隅·行 | 原生 Worker（开发中） |
| **fangyu-desktop** | 方隅·行 | Electron 过渡壳 |

## 开发

本包不单独启动浏览器，请用：

```bash
cd ../fangyu-studio && npm run dev   # 方隅·序
cd ../fangyu-desktop && npm run dev  # 方隅·行（过渡）
```

## 脚本

| 命令 | 说明 |
|------|------|
| `npm test` | 单元测试 |
| `npm run test:fast` | 快速单测 |
| `npm run export:seed-agents` | 导出种子 Agent 到 `data/assets/` |
