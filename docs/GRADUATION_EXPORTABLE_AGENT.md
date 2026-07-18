# 毕业标准：可导出的 OpenCode / WorkBuddy 级 Agent

> 方隅的目的是 **批量、快速产出高质量 Agent 的平台**。  
> 毕业 ≠ Studio 好用，而是：**用平台搭出并能导出**达到 OpenCode harness **与** WorkBuddy（含 IM / 企业权限 / 托管 / **多 Agent 编排**）档的独立智能体。

关联：[愿景](VISION_AND_PRODUCT.md) · [评估](PROJECT_ASSESSMENT.md) · [L1 路线图](L1_ROADMAP.md) · [工厂原料目录](FACTORY_MATERIALS.md)

**口径更正（2026-07-18）：** IM、企业权限、托管、**多 Agent 编排** **属于毕业范围**，不是「以后再说」的附加项。

---

## 双轨毕业

| 轨 | 含义 | 当前粗进度 |
|----|------|------------|
| **G1 · OpenCode harness** | 绑仓、**长任务 plan**、多轮手脚、复杂仓稳定性、chat/RPC、工厂出包、live 绿 | **~90%**（P0 live/graduation C 已绿） |

| **G2 · WorkBuddy 全档** | 办公交付 + **IM** + **企业权限** + **托管** + **多 Agent 编排** | **~55%**（骨架多，真机/边 ACL 未满） |

**平台毕业 = G1 ∧ G2。** 只完成 G1 不算总毕业。

**口径补充（同日）：** **可以 / 应该多 Agent 编排**——WorkBuddy 级「多专家并行」对应方隅的 **Agent 画布 + orchestrate + A2A**；毕业要求的是 **可导出、可常驻、可经 IM/权限约束的多 Agent 协作**，不只 Studio 里拖一下。

---

## G1 · OpenCode（硬清单）

1. `bundle create --profile opencode --workspace <repo>`
2. `bundle chat` 多轮改仓；`.fangyu/chat.jsonl` 有会话
3. **长任务规划**：`action=plan` 先拆步；coding 默认 `require_plan`
4. **task 子 Agent**：`task(explore|general|review)` 委派隔离子会话（默认不可嵌套）
5. **复杂仓稳定性**：工具输出截断、重复调用告警、上下文压缩、进度回灌；默认 `max_turns≥24`
6. 包内宪法；危险 shell 拒
7. 工厂可批量变体
8. `opencode_harness_live.py` 有 Key 三用例绿
9. `opencode_graduation_c.py` 自动项绿

脚本：`scripts/opencode_graduation_c.py` · `scripts/opencode_harness_live.py`

---

## G2 · WorkBuddy 全档（硬清单）

### G2-A 办公数字员工（产品竖切）

| # | 项 | 状态 |
|---|----|------|
| 1 | `bundle create --profile workbuddy` | ✅ |
| 2 | 一句话任务 → 拆解 → 多轮执行 | 部分（office agent-loop） |
| 3 | **成品落盘**（至少 md；目标 docx/xlsx/页） | ✅ md + docx + **xlsx** |
| 4 | 工作区 = 用户授权文件夹 | 部分（`--workspace`） |
| 5 | 办公 live / 验收脚本 | ✅ `scripts/workbuddy_harness_live.py` |

### G2-B IM 入口（在毕业范围内）

| # | 项 | 状态 |
|---|----|------|
| 1 | 至少一条 IM 通道可对话触发 Agent（**飞书**先做） | ✅ 解析+challenge+入站；真机订阅待配凭证 |
| 2 | 消息 → Bundle/harness → 回复回 IM | 部分（有 Key 可回飞书；否则 `im_outbox.jsonl`） |
| 3 | 凭证与回调配置可进 Bundle/部署文档 | ✅ `config/im.json` · `bundle im-bind` · `/im/feishu` · **运维·飞书向导** `/api/v1/im/status` |

### G2-C 企业权限（在毕业范围内）

| # | 项 | 状态 |
|---|----|------|
| 1 | 组织/成员/角色或等价 ACL（谁能调哪个 Agent、哪些工具） | ✅ `org_acl` + admin/operator/viewer |
| 2 | 与律（宪法/审计）打通：越权可拦可查 | ✅ 拒绝写 `acl_violation` 审计 |
| 3 | 授权/吊销产品路径（非只改 JSON） | ✅ Studio「运维 → 组织 ACL」+ CLI/API；SSO ✅ 运维 SSO / OIDC |

### G2-D 托管常驻（在毕业范围内）

| # | 项 | 状态 |
|---|----|------|
| 1 | 导出物可 **7×24 常驻**（daemon / 服务安装 / 托管进程） | ✅ `bundle manage start` 后台 daemon |
| 2 | 托管面：启停、日志、健康、升级或等价运维 | ✅ 启停/状态/日志/健康/**重启·升级** |
| 3 | 可选云托管或本机「托管感」面板（用户能当服务用，不是一次性脚本） | ✅ Studio「更多 → 运维」面板 + CLI/API |

### G2-E 多 Agent 编排（在毕业范围内 · 你已确认「可以」）

| # | 项 | 状态 |
|---|----|------|
| 1 | **设计态**：意图 → Agent 网 / Agent 画布协作拓扑 | 部分（`to-agents`、Agent 画布 MVP） |
| 2 | **运行态**：`/orchestrate` / A2A 管线可跑通本厂+外来 | 部分（有 API / demo） |
| 3 | **导出态**：多 Agent 拓扑 **打进 Bundle / 部署物**，脱离 Studio 也能编 | ✅ `profile multi` + `topology.json` + `bundle orchestrate` |
| 4 | 与 G2-A/B 结合：一句办公任务可拆给多专家；IM 可触发整网而非单人 | 部分（im `mode=orchestrate`） |
| 5 | 与 G2-C 结合：编排边上的权限（谁可调谁、跨 Agent 工具边界） | ☐ |

**现成资产：** Agent 画布 · `POST /orchestrate` · `intent/to-agents` · A2A · `bundle orchestrate` · `/api/v1/im/*`

---

## 距离判断（诚实）

```text
G1 OpenCode  █████████░  ~90%（P0 live/graduation C 已绿 · 2026-07-19）
G2-A 办公竖切 ████████░░  ~80%（md+docx+xlsx）
G2-B IM       ████░░░░░░  ~45%（真机暂缓）
G2-C 企业权限 ███████░░░  ~70%（ACL+SSO；编排边 ACL ☐）
G2-D 托管     █████████░  ~85%（manage+Studio；升级/重启 ✅）
G2-E 多编排   ██████░░░░  ~55%
────────────────────────
总毕业(G1∧G2) █████░░░░░  ~60%
```

---

## 建议推进顺序（仍服务总毕业）

### 已完成（骨架）

1. ~~G1 路径/脚本骨架~~ ✅（**live 常绿仍未收口 → 见 P0**）  
2. ~~G2-A / G2-E 骨架~~ ✅  
3. ~~G2-B 飞书通道代码~~ ✅（真机见 P3）  
4. ~~G2-D 托管面~~ ✅  
5. ~~G2-C 企业权限骨架~~ ✅（编排边 ACL 见 P2）  
6. ~~可演示竖切 · Studio 运维面板 · docx/xlsx~~ ✅  

### 进行中计划（P0→P4 · 2026-07-19）

| 优先级 | 目标 | 验收标准 |
|--------|------|----------|
| **P0** | 稳住 G1 live | `opencode_harness_live` 三用例绿；`opencode_graduation_c` 自动项绿；live 用 `FANGYU_SHELL_POLICY=allow` 避免人审卡死；`factory_gate --live-tier smoke` 可重复过 |
| **P1** | 真双厂值班验收 | ✅ `scripts/dual_factory_duty_acceptance.py`（D1–D9）；见 [双厂值班](DUAL_FACTORY_DUTY.md) |
| **P2** | 编排边 ACL | topology 边声明「谁可调谁」；越权可拦可审计；补齐 G2-E #5 |
| **P3** | 飞书真机（单开） | 运维向导配凭证 → 私聊触发 Bundle/harness → 回复回会话；不挡 P0–P2 |
| **P4** | 办公×编排交叉 | 一句办公任务拆多专家；IM `mode=orchestrate` 触发整网可演示验收 |

关联：[项目评估](PROJECT_ASSESSMENT.md) · [技术雷达](TECH_RADAR_2026.md)

---

## 进度总表

| 项 | 状态 |
|----|------|
| G1 路径 A/B/C + 脚本 | ✅ 骨架 |
| G1 live / graduation C 常绿 | ✅ **P0 已打通**（2026-07-19：mock 先 plan；live `FANGYU_SHELL_POLICY=allow`） |
| G2-A workbuddy + live 脚本 | ✅ |
| G2-E multi 导出编排 | ✅ 骨架 |
| G2-E 编排边 ACL | ☐ **P2** |
| G2-B 飞书 IM 通道（代码） | ✅ |
| G2-B 飞书真机 | ☐ **P3**（暂缓可开） |
| G2-D 托管 manage | ✅ |
| G2-C 组织 ACL + SSO | ✅ 骨架 |
| 真双厂值班验收仪式 | ✅ **P1** `dual_factory_duty_acceptance` |
| Studio 运维面板 | ✅ |

*版本：2026-07-19 · 口径：WorkBuddy 全档 = 办公 + IM + 企业权限 + 托管 + 多 Agent 编排；进度与 [项目评估](PROJECT_ASSESSMENT.md) v3.0 对齐*
