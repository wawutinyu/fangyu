# 技术雷达 2026 → 方隅行动

> 行业已收敛：**MCP（工具）· Skills（方法）· A2A（协作）· Harness（机床）· Eval（质检）**。  
> 方隅定位是 **Agent 工厂**：批量组装可导出的公民，而不是再做一个聊天壳。

关联：[工厂原料](FACTORY_MATERIALS.md) · [拓扑与 task](TOPOLOGY_AND_TASK.md) · [MCP Tasks](MCP_TASKS.md) · [浏览器](BROWSER_TOOL.md) · [认证 SSO](AUTH_SSO.md) · [出厂 Eval](FACTORY_EVAL.md) · [A2A 发现](A2A_DISCOVERY.md) · [毕业标准](GRADUATION_EXPORTABLE_AGENT.md) · [愿景](VISION_AND_PRODUCT.md)

---

## 1. 行业栈（必须分清层）

| 层 | 标准/实践 | 方隅对应 | 别混成 |
|----|-----------|----------|--------|
| 工具/数据 | MCP | materials + toolbelt + `mcp_*` | 编排 |
| 方法知识 | Skills / SKILL.md | `skills/factory/*.md` + skill_pack | 又一个 RPC |
| Agent 协作 | A2A | Bundle / Agent Card / bus / topology | 工具调用 |
| 执行系统 | Harness | agent-loop / plan·build / task / ask | 「再换个更强模型」 |
| 质量 | Eval + 观测 | `FACTORY_EVAL` + gate；trace 落盘 | 偶发 demo |

**口诀：MCP 连世界，Skills 装方法，A2A 连同伴，Harness 当机床，Eval 做出厂质检。**

---

## 2. 现状（相对雷达）

| 层 | 进度 | 说明 |
|----|------|------|
| Harness | 较强 | plan/build、task、ask shell、压缩/稳定性 |
| 原料 Tools | 中上 | materials.json + coding 带；MCP 仅 `__internal__` 起头 |
| Skills | 中 | frontmatter + skill_load；Studio 技能目录渐进预览 |
| A2A | 中上 | RPC/编排；跨厂 probe + discovery + 工厂通讯录 |
| Eval | 中 | `FACTORY_EVAL` + `factory_gate` 固定套件；live 仍需 Key |
| 沙箱/观测 | 中 | 宪法/ACL/审计；Studio 观测读 harness_trace + Eval 报告 |

---

## 3. 怎么做（推荐节奏）

### 现在（1～2 周）— **对齐标准 + 质检门禁**

目标：工厂「出的包」可测、可声明、层边界清楚。

1. **Skills 标准化**  
   - `skills/factory/*.md` 加 YAML frontmatter（id / description / when）  
   - 加载改为：目录摘要进 system，全文按需（progressive disclosure）

2. **MCP 产线化**  
   - Bundle `materials.mcp` 支持多 server + `tools: ["*"]` 展开  
   - 文档写清：内置 toolbelt = 标配；MCP = 可插拔原料总线

3. **出厂 Eval 门禁（最小）**  
   - 固定套件：`opencode_harness_live` + `task_harness_live` + materials 单测  
   - `scripts/factory_gate.py`：无 Key 跑单测；有 Key 跑 live；失败不准称「可毕业」

4. **A2A 卡片对齐**  
   - 导出物补齐/校验 Agent Card（skills、url、能力声明）与公开 discovery 路径约定

### 接着（2～4 周）— **工厂可装配体验**

5. Studio「原料货架」：勾选 tools / skills / mcp → 写入 materials.json ✅ `/api/v1/materials` + 更多·原料  
6. 拓扑：并行边 + depends 波次 + 与 `task` 职责说明 ✅ [TOPOLOGY_AND_TASK](TOPOLOGY_AND_TASK.md)  
7. 观测：agent-loop trace 结构化落盘 ✅ `.fangyu/harness_trace.jsonl`（含 `task_child` / `task_parallel`）  
8. 更多技能包：explore / research / office / review / **multi-agent-split** ✅  

### 以后（不挡主线）

9. 真 IM、平级 Teams（**真 IM 仍暂缓**）；Computer-use / 浏览器 ✅ wait/scroll/press/screenshot；SSO ✅ OIDC JWKS RS256  
10. MCP Tasks 扩展 ✅；无状态 HTTP ✅ `POST /mcp/v1/messages`  
11. 云托管升级与跨机 Presence ✅ 托管进观 + `/presence/hosts/heartbeat`  
12. 领域技能包 · 人审 UI ✅ legal/compliance + 运维人审

---

## 4. 决策原则（开发时用）

- **先机床与原料，再场景炫技**（办公/IM 是产线，不是底座借口）  
- **能进 Bundle 声明的才算进厂**（仅 Studio 节点 ≠ 工厂原料）  
- **模型可换，协议与 harness 要稳**  
- **每加一条产线，先加一条 eval**  
- **OpenCode / WorkBuddy 是参考产线，不是唯一北极星**

---

## 5. 本周建议开工顺序

```text
① factory_gate.py（质检门禁）     ✅ scripts/factory_gate.py
② Skills frontmatter + 按需加载   ✅ skill_load + 目录摘要
③ MCP tools:"*" 展开             ✅ _expand_mcp_tool_names
④ Agent Card 导出校验            ✅ .well-known/agent-card.json
⑤ Studio 原料货架 + draft/bundle ✅ routers/materials + MaterialsShelf
⑥ harness_trace 落盘             ✅ engine/harness_trace.py
⑦ 技能包扩容 + task_child trace  ✅ skills/factory/* + task 元数据
⑧ 拓扑并行段 + 职责文档          ✅ bundle_orchestrate + TOPOLOGY_AND_TASK
⑨ multi-agent-split + depends    ✅ 技能 + 边波次调度
⑩ factory_gate Eval 加厚         ✅ 更多单测 + multi/skills card 检
⑪ 领域技能 + 人审 UI             ✅ customer/data-brief + 运维·人审
⑫ 法务/合规技能 + MCP Tasks      ✅ legal/compliance + SEP-2663 最小子集
⑬ 无状态 MCP HTTP + 跨机 Presence ✅ /mcp/v1/messages + hosts heartbeat
⑭ 浏览器原料 + SSO JWT           ✅ browser_* + /api/v1/auth
⑮ playwright 深度 + OIDC JWKS    ✅ wait/scroll/press/screenshot + RS256
⑯ Eval 回归 + OIDC 登录页        ✅ FACTORY_EVAL + oidc/start·callback + 运维 SSO
⑰ workbuddy live + ACL↔SSO       ✅ gate live 挂 WB · sync-sso / 运维一键入库
⑱ 观测 Trace + Eval 报告         ✅ monitor harness/eval · factory_eval_report.json
⑲ Presence↔托管 + 技能目录 UX    ✅ 观筛托管/停实例 · materials/skills 全文预览
⑳ A2A 跨厂发现 + 律产品面        ✅ discovery/probe/factories · 律禁项/Bundle 宪法
㉑ 托管升级 + Eval 趋势           ✅ restart/upgrade · eval-history/trend
㉒ 飞书向导 + Presence 托管回放   ✅ im/status·运维飞书页 · managed.* 帧对齐
㉓ 跨机回放样例 + live 可选档     ✅ fixtures/cross-host · --live-tier none/smoke/full
㉔ Eval 对比页 + A2A 工厂目录 UI  ✅ eval-compare · 观测对比 · 运维·工厂
㉕ 对端一键入库 + 值班墙跨机默认  ✅ probe-save/peer-probe · 墙默认 host
㉖ 工厂批量心跳 + Eval smoke CI    ✅ factories/heartbeat · factory-gate.yml
㉗ 定时心跳 + Presence↔通讯录对齐  ✅ heartbeat-loop · factories/align
㉘ 离线告警 + 通讯录拉入画布       ✅ monitor/alerts · 运维「拉入画布」
㉙ Eval↔值班墙 + 跨厂投递样例     ✅ eval.fail 去观 · cross-factory-task
㉚ 跨厂 live smoke + 外部 ACL 默认  ✅ key-free cross_factory · agent:call:external:*
㉛ 授权向导 + 观告警铃铛           ✅ ExternalAuthWizard · PresenceAlertBell
㉜ 授权后部署校验 + 大屏告警条     ✅ verify 步骤 · PresenceAlertStrip
㉝ 试跑 ping + 告警铃铛 SSE        ✅ wizard 试跑 · Presence SSE 刷新 alerts
㉞ 试跑写观 + 工厂健康分           ✅ external.ping · factories health score
㉟ 健康分进墙 + 试跑告警           ✅ presence health 主机色 · ping_fail 告警
㊱ 健康明细趋势 + 试跑复测         ✅ FactoryHealthDetail · ExternalPingRetest
㊲ 离线再探测 + Eval 健康摘要      ✅ FactoryOfflineRetest · factories_health
㊳ Eval 健康差 + 墙主机再探测     ✅ factories_health_diff · PresenceCard 再探测
㊴ 健康回归告警 + 对齐后自动再探测 ✅ eval.health_regression · retest_after
```

下一刀：真 IM（仍暂缓）· 健康回归铃铛去观定位 · 对齐结果写入观事件。

---

*版本：2026-07-19 · 随行业与仓库演进更新「现状」表*
