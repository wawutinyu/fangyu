# 毕业标准：可导出的 OpenCode / WorkBuddy 级 Agent

> 方隅的目的是 **批量、快速产出高质量 Agent 的平台**。  
> 毕业 ≠ Studio 好用，而是：**用平台搭出并能导出**达到 OpenCode harness **与** WorkBuddy（含 IM / 企业权限 / 托管 / **多 Agent 编排**）档的独立智能体。

关联：[愿景](VISION_AND_PRODUCT.md) · [评估](PROJECT_ASSESSMENT.md) · [L1 路线图](L1_ROADMAP.md)

**口径更正（2026-07-18）：** IM、企业权限、托管、**多 Agent 编排** **属于毕业范围**，不是「以后再说」的附加项。

---

## 双轨毕业

| 轨 | 含义 | 当前粗进度 |
|----|------|------------|
| **G1 · OpenCode harness** | 绑仓、多轮手脚、chat/RPC、工厂出包、live 绿 | **~75%**（差 API Key live） |
| **G2 · WorkBuddy 全档** | 办公交付 + **IM** + **企业权限** + **托管** + **多 Agent 编排** | **~20%**（harness + 画布编排雏形） |

**平台毕业 = G1 ∧ G2。** 只完成 G1 不算总毕业。

**口径补充（同日）：** **可以 / 应该多 Agent 编排**——WorkBuddy 级「多专家并行」对应方隅的 **Agent 画布 + orchestrate + A2A**；毕业要求的是 **可导出、可常驻、可经 IM/权限约束的多 Agent 协作**，不只 Studio 里拖一下。

---

## G1 · OpenCode（硬清单）

1. `bundle create --profile opencode --workspace <repo>`
2. `bundle chat` 多轮改仓；`.fangyu/chat.jsonl` 有会话
3. 包内宪法；危险 shell 拒
4. 工厂可批量变体
5. `opencode_harness_live.py` 有 Key 三用例绿
6. `opencode_graduation_c.py` 自动项绿

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
| 3 | 凭证与回调配置可进 Bundle/部署文档 | ✅ `config/im.json` · `bundle im-bind` · `/im/feishu` |

### G2-C 企业权限（在毕业范围内）

| # | 项 | 状态 |
|---|----|------|
| 1 | 组织/成员/角色或等价 ACL（谁能调哪个 Agent、哪些工具） | ✅ `org_acl` + admin/operator/viewer |
| 2 | 与律（宪法/审计）打通：越权可拦可查 | ✅ 拒绝写 `acl_violation` 审计 |
| 3 | 授权/吊销产品路径（非只改 JSON） | ✅ Studio「运维 → 组织 ACL」+ CLI/API（SSO ☐） |

### G2-D 托管常驻（在毕业范围内）

| # | 项 | 状态 |
|---|----|------|
| 1 | 导出物可 **7×24 常驻**（daemon / 服务安装 / 托管进程） | ✅ `bundle manage start` 后台 daemon |
| 2 | 托管面：启停、日志、健康、升级或等价运维 | ✅ 启停/状态/日志/健康（升级 ☐） |
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
G1 OpenCode  █████████░  ~90%
G2-A 办公竖切 ████████░░  ~80%（md+docx+xlsx）
G2-B IM       █████░░░░░  ~45%（真机暂缓）
G2-C 企业权限 ███████░░░  ~65%（ACL+Studio 运维面板；SSO ☐）
G2-D 托管     ████████░░  ~75%（manage+Studio 运维面板；升级 ☐）
G2-E 多编排   ██████░░░░  ~55%
────────────────────────
总毕业(G1∧G2) █████░░░░░  ~52%
```

---

## 建议推进顺序（仍服务总毕业）

1. ~~收口 G1~~ ✅  
2. ~~G2-A / G2-E 骨架~~ ✅  
3. ~~G2-B 飞书通道代码~~ ✅（真机暂缓）  
4. ~~G2-D 托管面~~ ✅  
5. ~~G2-C 企业权限骨架~~ ✅  
6. ~~**可演示竖切**~~ ✅  
7. ~~Studio 托管/ACL 运维面板~~ ✅（更多 → 运维）  
8. ~~G2-A docx / xlsx~~ ✅  
9. 下一优先候选：演示练熟 · 飞书真机 · SSO  

---

## 进度总表

| 项 | 状态 |
|----|------|
| G1 路径 A/B/C + live | ✅ |
| G2-A workbuddy + live 脚本 | ✅ |
| G2-E multi 导出编排 | ✅ |
| G2-B 飞书 IM 通道（代码） | ✅（真机暂缓） |
| G2-D 托管 manage | ✅ |
| G2-C 组织 ACL | ✅ |
| Studio 运维面板 | ✅（更多 → 运维） |

*版本：2026-07-18 · 口径：WorkBuddy 全档 = 办公 + IM + 企业权限 + 托管 + 多 Agent 编排*
