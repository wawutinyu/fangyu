# fangyu-flow

fangyu 的可视化画布 — React + Vite + Redux + ReactFlow。

Flow 编排画布 + Agent 编排画布，通过 `/api` 代理连接 fangyu 后端。

## 启动

```bash
# 在 fangyu 根目录一键启动（后端 + 画布）
../dev.bat

# 或单独启动画布
npm install
npm run dev    # → http://localhost:5173
```

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器（5173，/api 代理到 8000） |
| `npm run build` | 生产构建 |
| `npm run electron:dev` | Electron 桌面版 |
| `npm test` | 单元测试 |
| `npm run test:e2e` | Playwright E2E |
