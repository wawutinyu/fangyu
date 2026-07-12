# 开发者 Happy Path 验收清单（外人视角）

> Phase 5 收口用。目标：**未参与本项目开发**的工程师，按文档 ≤1 小时完成闭环。  
> 关联：[L1 路线图](L1_ROADMAP.md) · [用户手册](USER_GUIDE.md)

## 环境

- [ ] Windows / macOS / Linux 任一
- [ ] Node.js ≥ 18、Python ≥ 3.10、Git

## 步骤（建议计时）

| # | 动作 | 预期 | 耗时 |
|---|------|------|------|
| 1 | `git clone` + `npm install` + `py -m pip install -e .` | 无报错 | |
| 2 | `dev-clean.bat`（若需要）+ `dev.bat` | 打开 http://localhost:5173，标题含「方隅·序」 | |
| 3 | `install-worker.bat` 或 `dev-worker-tray.bat` | 托盘 / Worker 在线；序顶栏出现「行 N」 | |
| 4 | Flow 画布 → 示例 / 意图生成 → **序内预览** | 预览成功 | |
| 5 | **派发至行** | 方隅·行面板任务 `done` | |
| 6 | `py scripts/worker_happy_path.py --spawn-worker` | 打印 OK（shell + run_flow） | |
| 7 | 导出 Agent Bundle → `py -m fangyu bundle run …`（或文档中的 run 命令） | Bundle 常驻 / RPC 有响应 | |
| 8 | 顶栏 **方隅·观** | 能看到 Worker Presence；派发后时间线有事件 | |
| 9 | 顶栏 **方隅·律** | 能看到宪法与审计；链验证显示完整或可解释 | |

## 通过标准

- 步骤 1–6 **必须全绿**
- 7 按 Phase 5 Bundle 文档；若环境缺依赖可记「部分通过」并开 issue
- 8–9 为四门两包体验验收（观/律）

## 记录

| 项 | 填写 |
|----|------|
| 验收人 | |
| 日期 | |
| 总耗时 | |
| 卡点 / 文档缺口 | |
| 结论 | ☐ 通过 ☐ 有条件通过 ☐ 未通过 |
