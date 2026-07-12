# 方隅·行（fangyu-worker）

本机 Worker 守护进程 — **真干活**：shell 命令、Flow 执行（经本机 Python API）。

> 长期形态为原生 App（Tauri / WinUI）；当前为 **Node 守护进程 MVP**，不依赖 Electron。

## 启动

```bash
# 1. 序 API 已运行
py -m fangyu --server

# 2. 根目录安装依赖后

# 方式 A — 控制台守护进程
npm run dev:worker

# 方式 B — Windows 系统托盘（推荐，无需 Electron）
dev-worker-tray.bat
# 或 npm run dev:tray
```

托盘菜单：打开方隅·序、重启 Worker、退出。双击托盘图标打开序。

可选参数：

```bash
node fangyu-worker/src/cli.mjs --api-base http://127.0.0.1:8000 --name my-pc
```

## 能力

| 任务类型 | 说明 |
|----------|------|
| `shell` | 本机执行命令（带 deny 策略 + 审计事件） |
| `run_flow` | 调用 `/api/v1/flow/run` 在本机跑 Flow |
| `read_file` | 读取工作区文件（`FANGYU_WORKSPACE`，默认 cwd） |
| `write_file` | 写入工作区文件 |
| `adapter_invoke` | 经序 API 调用 Adapter（`ingest` / `emit`） |

Shell 执行会回传审计事件到序：`shell_start` / `shell_done` / `shell_blocked` 等，可在 **方隅·行** 面板查看。

- 任务持久化在 `data/workers.db`（API 重启不丢 pending 任务）
- Worker 身份保存在 `data/worker-local.json`（重启复用同一 worker_id）

Worker 向序注册、心跳、轮询任务；在 **方隅·序** 画布点 **「派发至行」** 即可下发 `run_flow`。

派发时会：
1. 将画布快照保存为「发布 …」历史记录
2. 在工具栏选择目标 Worker（多个在线时）
3. 下发 `run_flow` 任务（含 `snapshot_id` 与画布提示词）

## 原生壳路线图

| 阶段 | 形态 | 状态 |
|------|------|------|
| MVP | PowerShell 托盘 + Node 守护进程 | ✅ 当前 |
| P1 | Tauri 2 托盘 + 安装包 | ⏸ 暂缓（需 Rust，可后装） |

## Shell 安全策略

默认 **deny 模式**：拦截明显危险命令（`rm -rf`、`format`、`del /s` 等）。

```bash
# 开发时可放开（不推荐生产）
set FANGYU_SHELL_POLICY=open

# 严格白名单模式
set FANGYU_SHELL_POLICY=allowlist
# 并配置 data/worker-shell-policy.json（见 worker-shell-policy.example.json）
```

## 后续

- Tauri 原生壳 + Windows 安装包（Rust 就绪后再做）
- Bundle 常驻 daemon（MQTT 触发 → 自动派发行）
