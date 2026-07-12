# Electron 过渡壳冒烟验证（可选）

> **维护模式 / 计划退役**：`fangyu-desktop` 为过渡方案。  
> **推荐日常**：`dev.bat`（方隅·序）+ `install-worker.bat` / `dev-worker-tray.bat`（方隅·行）。  
> 退役门槛与勾选表见 **[扔 Electron 检查清单](ELECTRON_RETIREMENT.md)**。

## 结构

| 包 | 职责 |
|---|---|
| `fangyu-canvas` | 共享画布 + `platform` |
| `fangyu-studio` | 方隅·序 — Web 设计台 |
| `fangyu-worker` | 方隅·行 — 本机 Worker |
| `fangyu-desktop` | Electron 过渡壳（可选） |

## 开发模式

```bash
dev-clean.bat          # 若端口被旧进程占用，先清理
dev-desktop.bat
```

验证清单：

- [ ] Flow 画布可拖拽、序内预览
- [ ] 派发至行（需另开 `dev-worker.bat`）
- [ ] Agent 编排 + 资产库
- [ ] 导出 Flow / Agent

## 生产构建

```bash
npm run build:desktop
```

## 自动化

```bash
npm run test:fast -w fangyu-canvas
npm run build:studio
```
