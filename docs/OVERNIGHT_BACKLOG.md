# 过夜执行清单（2026-07-18）

> 用户入睡后由 Agent 自驱推进：对齐愿景文档，补测试 / Mac 冒烟 / CI / 连线规则硬化。  
> 原则：契约清楚、可测、少拍板；**不做** Postgres/Redis/多租户/大异步重构。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| N1 | `tests/unit/test_sandbox.py` | import/open/超时/语法/日志 | ✅ |
| N2 | `tests/unit/test_envelope.py` | 过期/重放/篡改/未知发送方 | ✅ |
| N3 | `test_variable` / `test_search` / `test_llm` | 无外网、可隔离 tmp | ✅ |
| N4 | `test_skill` / `test_memory` | 技能 CRUD + 记忆 scope | ✅ |
| N5 | `scripts/mac-smoke.sh` + README Mac | 一键冒烟 | ✅ |
| N6 | conftest 重置 registry + executors + ephemeral | 全量 unit 仍绿 | ✅ |
| N7 | connectionRules 多端口 + e2e 禁 llm→llm picker | vitest / playwright | ✅ |
| N8 | CI 接入 happy_path + bundle_runtime | workflow | ✅ |
| N9 | search.py 去掉 utcnow 弃用警告 | 无 DeprecationWarning | ✅ |

不在本夜：模板市场、真 OPC-UA、平台 A2A 强制信封、观·协作边 UI、同类型 LLM 链式放开（产品拍板后再改）。

## 前序（2026-07-13）

| ID | 状态 |
|----|------|
| O1 Presence SSE | ✅ |
| O2 Setup Copilot MVP | ✅ |
| O3 Tauri 脚本/文档 | ✅ |
| O4 全量单测回归 | ✅ |

## 结果摘要（本夜 · 2026-07-18）

| 项 | 结果 |
|----|------|
| Python unit | **264** passed（含 sandbox / envelope / variable / search / llm / skill / memory / palette parity） |
| Canvas vitest fast | **331** passed |
| Canvas typecheck | ✅ |
| Integration subset | happy_path + bundle_runtime **9** passed |
| 安全加固 | sandbox 语句级拦截 `import` / `from … import`（不误伤 `important`） |
| 文档 | `FLOW_CONNECTION_RULES.md` · README/Mac · HAPPY_PATH Mac · 本清单 |
| CI | python job 增加 happy_path + bundle_runtime |
| 脚本 | `scripts/mac-smoke.sh` |
