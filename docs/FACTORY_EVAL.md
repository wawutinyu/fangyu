# 工厂 Eval / 出厂回归

> 目标：无 Key 也能证明「原料 + harness + 导出物」可毕业；有 Key 再跑 live。

关联：[技术雷达](TECH_RADAR_2026.md) · [毕业标准](GRADUATION_EXPORTABLE_AGENT.md) · `scripts/factory_gate.py`

## 怎么跑

```bash
python scripts/factory_gate.py --skip-live          # 无 Key 必绿（= --live-tier none）
python scripts/factory_gate.py --live-tier smoke    # 有 Key：仅 opencode harness
python scripts/factory_gate.py --live-tier full     # 有 Key：opencode + task + workbuddy
python scripts/factory_gate.py                      # 默认 full（无 Key 则跳过 live → exit 2）
python scripts/factory_gate.py --unit-only
```

退出码：`0` 全绿；`1` 失败；`2` unit+card 绿但 live 跳过（`--strict-live` 可打成 1）。

### live 可选档

| `--live-tier` | 脚本 | 说明 |
|---------------|------|------|
| `none` | （无） | 等价 `--skip-live`，CI 无 Key 默认 |
| `smoke` | `opencode_harness_live` | 最短 live 冒烟 |
| `full` | + `task_harness_live` + `workbuddy_harness_live` | 毕业全档 |

## 固定套件（出厂必绿）

| 层 | 覆盖 | 入口 |
|----|------|------|
| 原料 | materials / toolbelt / 货架 / 浏览器工具 | `test_materials*` · `test_browser_sso` |
| Skills | frontmatter + skill_load + 领域包 | `test_factory_gate` · `test_plan_shell_skills` |
| Harness | agent-loop / task / plan / shell ask | `test_agent_loop` · `test_subagent_task` · `test_approvals` |
| 拓扑 | depends 波次 / multi profile | `test_skills_topology_trace` · `test_g2_workbuddy_multi` |
| MCP | Tasks · 无状态 HTTP · Presence | `test_mcp_tasks` · `test_mcp_http_presence` |
| 身份 | SSO JWT · JWKS · OIDC 授权码 | `test_browser_sso` |
| 导出 | Agent Card · well-known · materials | gate `stage_card` |
| Live | OpenCode / task / **WorkBuddy** harness | `opencode_harness_live` · `task_harness_live` · `workbuddy_harness_live`（需 Key） |

## 门禁 card 额外断言

- 必选技能包：`implement-and-verify` · `explore-codebase` · `research-web` · `office-decompose` · `multi-agent-split` · `browser-inspect`
- coding materials 含 `browser_open` / `browser_wait`
- auth `modes` 含 `oidc_auth_code`
- harness_trace 可落盘抽样

## 产物

每次跑 gate（除非 `--no-report`）会写：

- `DATA_DIR/factory_eval_report.json`
- 同步：仓库 `.fangyu/factory_eval_report.json`
- 追加历史：`DATA_DIR/factory_eval_history.jsonl`

Studio「观测 → Eval 报告」展示最近结果 + 趋势条；API：

- `GET /api/v1/monitor/eval-report`
- `GET /api/v1/monitor/eval-history`
- `GET /api/v1/monitor/eval-trend`
- `GET /api/v1/monitor/eval-compare?i=0&j=1`（历史下标对比，0=最新）

Studio「观测 → Eval」含 **最近 / 对比**：选两条历史看 stage 差异与并排摘要。

Harness Trace：`GET /api/v1/monitor/harness-traces`（观测面板默认页）。
