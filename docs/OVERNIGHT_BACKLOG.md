# 过夜执行清单（自动）

> 生成时间：2026-07-13 · 在 commit + Tauri MVP 之后由 Agent 自开自跑。  
> 原则：契约清楚、可测、少拍板；做完写结果。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| O1 | Presence SSE（`GET /api/v1/presence/stream`） | 客户端可订阅事件；带单测 | ✅ |
| O2 | Setup Copilot MVP（粘贴 URL → 发现 → 授权确认文案） | API + 序内面板 + 测试 | ✅ |
| O3 | 根脚本 `dev-worker-tauri.bat` + README/路线图对齐 Tauri | 文档可跟跑 | ✅ |
| O4 | 全量单测 + studio build 回归 | 全绿 | ✅ |

不在本夜：真跨机联邦压测、Electron 删包、行业模板市场。

## 结果摘要

| 项 | 结果 |
|----|------|
| O1 | `subscribePresenceStream` + `PresencePanel` LIVE/POLL 回退；`mergePresenceEvent`；前端单测 |
| O2 | Setup Copilot API happy-path 单测；`addAgentNode` 接入；`setupCopilot.ts` |
| O3 | `fangyu-worker-tauri/README.md` + `.cargo/config.toml`（rsproxy）；根 README / USER_GUIDE / L1 / worker README |
| O4 | `pytest tests/unit/` **194 passed**；`fangyu-canvas test:fast` **308 passed**；`npm run build:studio` ✅ |

## Tauri 打包

- 源码 MVP + `dev-worker-tauri.bat` 已就绪；修复 `DoubleClick` API 后 `release` 编译通过
- 包内 `.cargo/config.toml`（rsproxy）；`bundle.targets = ["nsis"]`
- 已产出：
  - `fangyu-worker-tauri/src-tauri/target/release/fangyu-worker-tauri.exe`
  - `fangyu-worker-tauri/src-tauri/target/release/bundle/nsis/方隅·行_0.1.0_x64-setup.exe`
