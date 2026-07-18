# 技术雷达 2026 → 方隅行动

> 行业已收敛：**MCP（工具）· Skills（方法）· A2A（协作）· Harness（机床）· Eval（质检）**。  
> 方隅定位是 **Agent 工厂**：批量组装可导出的公民，而不是再做一个聊天壳。

关联：[工厂原料](FACTORY_MATERIALS.md) · [毕业标准](GRADUATION_EXPORTABLE_AGENT.md) · [愿景](VISION_AND_PRODUCT.md)

---

## 1. 行业栈（必须分清层）

| 层 | 标准/实践 | 方隅对应 | 别混成 |
|----|-----------|----------|--------|
| 工具/数据 | MCP | materials + toolbelt + `mcp_*` | 编排 |
| 方法知识 | Skills / SKILL.md | `skills/factory/*.md` + skill_pack | 又一个 RPC |
| Agent 协作 | A2A | Bundle / Agent Card / bus / topology | 工具调用 |
| 执行系统 | Harness | agent-loop / plan·build / task / ask | 「再换个更强模型」 |
| 质量 | Eval + 观测 | live 脚本；**缺口：回归套件** | 偶发 demo |

**口诀：MCP 连世界，Skills 装方法，A2A 连同伴，Harness 当机床，Eval 做出厂质检。**

---

## 2. 现状（相对雷达）

| 层 | 进度 | 说明 |
|----|------|------|
| Harness | 较强 | plan/build、task、ask shell、压缩/稳定性 |
| 原料 Tools | 中上 | materials.json + coding 带；MCP 仅 `__internal__` 起头 |
| Skills | 起步 | 已有 implement-and-verify；缺渐进加载与标准 frontmatter |
| A2A | 中 | 有 RPC/编排；Agent Card / 任务态 / 跨厂发现未满 |
| Eval | 弱 | 有 live；缺固定回归集与「出厂必绿」门禁 |
| 沙箱/观测 | 部分 | 宪法/ACL/审计有；结构化 trace/eval 平台薄 |

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

5. Studio「原料货架」：勾选 tools / skills / mcp → 写入 materials.json  
6. 拓扑：并行边 + 与 `task` 职责说明（厂内动态 vs 导出编队）  
7. 观测：agent-loop trace 结构化落盘（含 task 子会话、shell ask）  
8. 更多技能包：`explore-codebase`、`research-web`、`office-decompose`

### 以后（不挡主线）

9. 真 IM、平级 Teams、Computer-use / 浏览器、SSO  
10. MCP Tasks 扩展、无状态 HTTP 部署跟进上游 spec  
11. 云托管升级与跨机 Presence

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
```

下一刀：Studio 原料货架 UI · 观测落盘 · 更多技能包。

---

*版本：2026-07-18 · 随行业与仓库演进更新「现状」表*
