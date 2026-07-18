# 开发者 Happy Path 验收清单（外人视角）

> Phase 5 收口用。目标：**未参与本项目开发**的工程师，按文档 ≤1 小时完成闭环。  
> 关联：[L1 路线图](L1_ROADMAP.md) · [用户手册](USER_GUIDE.md)

## 环境

- [ ] Windows / macOS / Linux 任一
- [ ] Node.js ≥ 18、Python ≥ 3.10、Git

> **常见坑：** pull 新代码后若 `/api/v1/presence` 等返回 404，多半是旧 API 进程仍在跑。  
> - Windows：先 `dev-clean.bat`，再 `dev.bat` / `py -m fangyu --server`  
> - macOS：先 `./dev-clean.sh`，再 `./dev.sh`（请在本机 Terminal 前台跑）；冒烟用 `./scripts/mac-smoke.sh`  
> - **API 必须在本机 Terminal 前台跑。** Cursor agent shell 里起的进程常会挂掉 → Studio `502 Bad Gateway`，看起来像「意图/预览坏了」。

## 步骤（建议计时）

| # | 动作 | 预期 | 耗时 |
|---|------|------|------|
| 1 | `git clone` + `npm install` + `pip install -e .`（Win：`install-worker.bat` / Mac：`./install-worker.sh`） | 无报错；Mac 可出现 `~/Applications/Fangyu-Worker.command` | |
| 2 | Win：`dev-clean.bat` + `dev.bat`；Mac：`./dev-clean.sh` + `./dev.sh`（API 在 Terminal 前台） | 打开 http://localhost:5173，标题含「方隅·序」 | |
| 3 | Win：`install-worker.bat` / `dev-worker-tray.bat`；Mac：`./install-worker.sh` 或 `./dev-worker.sh` | Worker 在线；序顶栏出现「行 N」 | |
| 4a | 创建 → **意图生成** → 应用到画布 → **工具栏「预览」** | 底部出现可读结论（与 4b 同引擎）；act/verify 语义成功 | |
| 4b | 同一 Flow → 底部 **「预览」聊天** → 发一句 | 助手回复**可读**（含验证通过 / completed 等），**不是**「无输出」或「画布为空」 | |
| 5 | **派发至行** | 方隅·行面板任务 `done` | |
| 6 | `python scripts/worker_happy_path.py --spawn-worker` | 打印 OK（shell + run_flow） | |
| 7 | 导出 Agent Bundle → `python -m fangyu bundle run …`（或 `python scripts/happy_path_demo.py`） | Bundle 常驻 / RPC 有响应 | |
| 8 | 顶栏 **方隅·观**（或 `GET /api/v1/presence`） | 能看到 Worker Presence；派发后时间线有事件 | |
| 9 | 顶栏 **方隅·律**（或 `GET /api/v1/constitution/audit/verify`） | 能看到宪法与审计；链验证 `valid=true` 或白话可解释 | |

> **预览引擎：** 4a 与 4b 现为同一后端路径（`/api/v1/flow/run/stream`）。4a 无聊天输入时用节点 default_value。

**脚本复验：**

- API 观/律/路由：`python scripts/happy_path_acceptance_check.py`
- **Studio 预览（意图 + 工具栏 + 底部）：** `python scripts/studio_preview_smoke.py`  
  （API 未起时退出码 2，不当假绿）

## 通过标准

- 步骤 1–3、**4a + 4b**、6 **必须全绿**（两条入口都应能跑通同一引擎）
- 5、7 按环境；缺 Worker 可记「部分通过」
- 8–9 为四门两包体验验收（观/律）

## 记录

| 项 | 填写 |
|----|------|
| 验收人 | |
| 日期 | |
| 总耗时 | |
| 卡点 / 文档缺口 | |
| 结论 | ☐ 通过 ☐ 有条件通过 ☐ 未通过 |

### 已知曾漏测（勿再只测工具栏）

| 路径 | 说明 |
|------|------|
| 意图 → **底部聊天** | 后端 Python 沙箱；与本地 JS 模拟不是同一条 |
| 聊天文字覆盖 input 默认值 | `query`/`message` 必须盖掉 `default_value` |
| 对象结果展示 | verify 返回对象时聊天框不能显示「无输出」 |
