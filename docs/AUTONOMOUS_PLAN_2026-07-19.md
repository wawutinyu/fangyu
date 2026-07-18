# 自主推进计划（2026-07-19 夜）

> Agent 自驱，不打断用户。**不做** P3 真 IM（飞书真机）。

## 目标口径

总毕业 ~65% → 本夜把「能演示、少踩坑、文档/门禁一致」再收一档。

## 本夜任务

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| A1 | 运维·飞书：`mode=orchestrate` 无 topology 时 UI 明示 | Studio 文案 + status `has_topology` 步骤 | ✅ |
| A2 | 竖切 demo 走 `office_report` / IM orchestrate | `demo_vertical_slice` 6 步可跑绿 | ✅ |
| A3 | 毕业/评估与代码进度对齐 | `PROJECT_ASSESSMENT` v3.1 | ✅ |
| A4 | `factory_gate --skip-live` + `npm test` 绿 | 退出码 0 | ✅ |
| A5 | 尝试 `git push`；失败则留下本机推送说明 | 推成功或注明阻塞 | （执行中） |

## 明确不做

- P3 飞书真机订阅
- 再堆观筛选/告警按钮
- 大重构 / 换数据库

## 做完后的下一优先（留给醒后）

1. 本机推远程（若 A5 失败）：`cd ~/Projects/fangyu && git push origin main`
2. 演示练熟 / 录像（`python scripts/demo_vertical_slice.py`）
3. 边 ACL 画布编辑（产品面）
4. P3 真 IM（需你开口）

*开始执行即视为批准本清单。*
