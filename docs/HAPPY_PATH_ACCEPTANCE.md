# 开发者 Happy Path 验收清单（外人视角）

> Phase 5 收口用。目标：**未参与本项目开发**的工程师，按文档 ≤1 小时完成闭环。  
> 关联：[L1 路线图](L1_ROADMAP.md) · [用户手册](USER_GUIDE.md)

## 环境

- [ ] Windows / macOS / Linux 任一
- [ ] Node.js ≥ 18、Python ≥ 3.10、Git

> **常见坑：** pull 新代码后若 `/api/v1/presence` 等返回 404，多半是旧 API 进程仍在跑。先 `dev-clean.bat`，再 `dev.bat` / `py -m fangyu --server`。

## 步骤（建议计时）

| # | 动作 | 预期 | 耗时 |
|---|------|------|------|
| 1 | `git clone` + `npm install` + `py -m pip install -e .`（或 `install-worker.bat`） | 无报错；桌面出现 `Fangyu-Worker.lnk` | |
| 2 | `dev-clean.bat`（若需要）+ `dev.bat` | 打开 http://localhost:5173，标题含「方隅·序」 | |
| 3 | `install-worker.bat` 或 `dev-worker-tray.bat` | 托盘 / Worker 在线；序顶栏出现「行 N」 | |
| 4 | Flow 画布 → 示例 / 意图生成 → **序内预览** | 预览成功 | |
| 5 | **派发至行** | 方隅·行面板任务 `done` | |
| 6 | `py scripts/worker_happy_path.py --spawn-worker` | 打印 OK（shell + run_flow） | |
| 7 | 导出 Agent Bundle → `py -m fangyu bundle run …`（或 `py scripts/happy_path_demo.py`） | Bundle 常驻 / RPC 有响应 | |
| 8 | 顶栏 **方隅·观**（或 `GET /api/v1/presence`） | 能看到 Worker Presence；派发后时间线有事件 | |
| 9 | 顶栏 **方隅·律**（或 `GET /api/v1/constitution/audit/verify`） | 能看到宪法与审计；链验证 `valid=true` 或白话可解释 | |

**API 快速复验（6/8/9）：** `py scripts/happy_path_acceptance_check.py`

## 通过标准

- 步骤 1–6 **必须全绿**
- 7 按 Phase 5 Bundle 文档；若环境缺依赖可记「部分通过」并开 issue
- 8–9 为四门两包体验验收（观/律）

## 记录

| 项 | 填写 |
|----|------|
| 验收人 | Agent（本机自测，模拟外人视角脚本路径） |
| 日期 | 2026-07-13 |
| 总耗时 | ~15 min（脚本路径）；UI 点选步骤待真人补做 |
| 卡点 / 文档缺口 | ① 旧 API 进程导致观/场景 404 → 已写入「常见坑」+ `happy_path_acceptance_check.py`；② 律 `audit/verify?limit=` 长日志误报断裂 → 已修窗口锚点 |
| 结论 | ☑ 有条件通过 ☐ 通过 ☐ 未通过 |

### 2026-07-13 脚本项结果

| 步骤 | 结果 |
|------|------|
| 1 `install-worker.bat`（非交互） | ✅ 快捷方式已写桌面 / 开始菜单 |
| 6 `worker_happy_path.py --spawn-worker` | ✅ shell + run_flow |
| 7 `happy_path_demo.py` | ✅ 5 步跨 Bundle RPC |
| 8 presence API | ✅（须用新进程；旧进程会 404） |
| 9 constitution + audit verify | ✅（修窗口后） |
| 2 Studio `http://localhost:5173` | ✅ HTTP 200（本机 Vite 仅监听 `::1`，用 localhost 勿用 127.0.0.1） |
| 4/5/8/9 UI 点选 | ⬜ 待人手在 Studio 点验（API 侧观/律已绿） |
