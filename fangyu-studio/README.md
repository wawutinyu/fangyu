# 方隅·序（fangyu-studio）

**序** — 编排、治理、发布。Web 管理与设计台，加载 [fangyu-canvas](../fangyu-canvas) 画布。

> 真干活在 **方隅·行**（[`fangyu-worker`](../fangyu-worker)）：`install-worker.bat` / `dev-worker-tray.bat`。  
> Electron 过渡壳 [`fangyu-desktop`](../fangyu-desktop) 计划退役 — [检查清单](../docs/ELECTRON_RETIREMENT.md)。

## 启动

```bash
# 仓库根目录 npm install 一次（workspaces 共用）
../dev.bat

# 或根目录
npm run dev
```

需后端：`py -m fangyu --server`（`dev.bat` 会自动启动）。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器（/api 代理到 8000） |
| `npm run build` | 生产构建 |
| `npm run build:desktop` | 桌面过渡壳用静态构建 |
| `npm run test:e2e` | Playwright E2E |

## 工程结构

```
fangyu-canvas/   ← 共享画布
fangyu-studio/   ← 本包：方隅·序
fangyu-worker/   ← 方隅·行（真执行）
fangyu-desktop/  ← Electron 过渡（计划退役）
```
