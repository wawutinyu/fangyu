# fangyu-flow

fangyu 的可视化画布 — React + Vite + Redux + ReactFlow。

## 启动

```bash
# 根目录一键启动
../dev.bat

# 或单独启动
npm install && npm run dev    # → http://localhost:5173
```

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器（/api 代理到 8000） |
| `npm run test:fast` | 快速单测（排除 parity subprocess） |
| `npm run test:slow` | export↔engine parity（~2min） |
| `npm test` | 全量单测 |
| `npm run electron:dev` | Electron 桌面版 |
| `npm run build` | 生产构建 |

## 功能

- **Flow 编排**：28 节点、本地模拟（localExecutor 与引擎对齐）、宪法扫描 warn/deny
- **Agent 编排**：A2A Agent 部署、技能绑定 Flow、链式协作 Chat
- **宪法**：设置 → 宪法 → 策略模板 / warn·deny 编辑
- **违宪 UI**：模拟运行结果弹窗 + Flow 聊天 ViolationPanel

## 相关文档

- [用户手册](../docs/USER_GUIDE.md)
- [项目评估](../docs/PROJECT_ASSESSMENT.md)
- [根目录 README](../README.md)
- [跨机器 A2A](../docs/A2A_REMOTE.md)
- [Electron 冒烟](../docs/ELECTRON_SMOKE.md)
