# 工厂原料目录（Factory Materials）

> 方隅是 **Agent 工厂**：批量、快速产出可导出的高质量 Agent。  
> 工具 / 技能 / 角色模板 / 装配规则 = **原材料**，不是某个竞品的附属清单。  
> OpenCode、WorkBuddy、办公数字员工、多 Agent 编排，都是用同一货架拼出来的产线。

关联：[愿景](VISION_AND_PRODUCT.md) · [毕业标准](GRADUATION_EXPORTABLE_AGENT.md)

**口径：** 原料要能 **进货架 → 进 Bundle → 被 agent-loop / 拓扑 / A2A 复用**。只存在于 Studio 节点、打不进导出物的，不算工厂原料（可标「平台侧」）。

---

## 1. 四类原料

| 类型 | 是什么 | 装配进哪里 |
|------|--------|------------|
| **工具 Tool** | 一次可调用的手脚 | `toolbelt` / MCP / `task` 子环 |
| **技能 Skill** | 可复用的方法/剧本（提示 + 约定步骤） | Bundle `skills/`、system、可加载 skill |
| **角色模板 Role** | 人设 + 默认工具集 + 权限姿态 | profile / subagent_type / agent 卡 |
| **装配 Assembly** | 如何拼：权限、宪法、拓扑、委派、托管 | `config/*`、flow、ACL、manage |

---

## 2. 现状速览（诚实）

```text
工具货架     ██████░░░░  coding 已进 glob/grep/webfetch/websearch/question；MCP 外挂仍待声明进包
技能货架     ███░░░░░░░  角色级方法有了；独立 skills/*.md 包仍少
角色模板     ██████░░░░  + scout；缺只读 Plan 主角色
装配能力     ███████░░░  materials.json 注册表已进 Bundle；人审 ask 闸仍弱
```

**关键裂缝（已收一刀）：** 平台 `web_search`/`read_url` 占位实现已由 harness 原料 **`websearch`/`webfetch`** 实装进产线；统一 **`config/materials.json`** 与 toolbelt 清单对齐。

---

## 3. 工具目录（Tool SKU）

### 3.1 编码 / 工作区（coding toolbelt）

| ID | 状态 | 优先级 | 说明 |
|----|------|--------|------|
| `read` / `write` / `list` | ✅ | P0 | 已有 |
| `search` | ✅ | P0 | 与 grep 同实现，保留兼容名 |
| `apply_patch` | ✅ 简 | P0→增强 | 单文件字符串替换；缺多文件/diff 编辑 |
| `shell` | ✅ 简 | P0 | 有基础拒绝列表；缺细粒度 ask/deny 命令策略 |
| `task` | ✅ | P0 | 委派 explore/general/review/scout；并行 / background |
| `glob` | ✅ | P0 | 按模式列文件 |
| `grep` | ✅ | P0 | 内容正则搜索 |
| `edit` / 多段补丁 | ❌ | P1 | 结构化编辑，减少整文件重写 |
| `webfetch` | ✅ | P0 | 拉 URL 转文本 |
| `websearch` | ✅ | P0 | DuckDuckGo Instant Answer（无 Key） |
| `lsp` | ❌ | P1 | 定义跳转 / 诊断 |
| `question` | ✅ | P0 | 提问并写入 `.fangyu/questions.jsonl` |
| `todowrite` / `todoread` | ❌ | P1 | 长任务检查清单（与 plan 互补） |
| `snapshot` / diff 回滚 | ❌ | P2 | 安全改仓 |

### 3.2 办公（office toolbelt）

| ID | 状态 | 优先级 | 说明 |
|----|------|--------|------|
| `read` / `write` / `list` | ✅ | P0 | 已有 |
| `write_deliverable` | ✅ | P0 | md / docx / xlsx |
| `list_deliverables` | ✅ | P0 | 已有 |
| 表格/幻灯更强排版 | 部分 | P1 | 按交付场景加深 |
| 邮件 / 日历 / 网盘 | ❌ | P2 | 企业办公原料 |

### 3.3 平台侧已有、待「进产线」

| ID | 在哪 | 优先级 | 说明 |
|----|------|--------|------|
| `web_search` / `read_url` / `current_time` | `tool_registry` / MCP `__internal__` | **P0** | 挂进可导出 toolbelt 或统一「原料注册表」 |
| `memory_*` | tool_registry | P1 | 长记忆进 Bundle 策略需定 |
| `code_execution` / `shell_execution` / `file_operations` | tool_registry | P1 | 与 coding 带去重合并 |
| `skill_*`（创建/编辑/列表） | tool_registry | P1 | 工厂元工具：产技能的技能 |
| MCP 外挂 | Studio `mcp` 节点 + `/api/v1/mcp` | **P0** | **导出 Bundle 时可声明 MCP 依赖并在 harness 调用** |
| IM 发送 | `im_feishu` | P2 | 真机暂缓；代码通道已有 |

### 3.4 协作 / 运行时（偏装配，也是「调用面」）

| ID | 状态 | 优先级 | 说明 |
|----|------|--------|------|
| A2A `send_message` | ✅ | P0 | 跨 Agent 点名 |
| `bundle orchestrate` | ✅ | P0 | 固定拓扑串行 |
| `task` 动态委派 | ✅ | P0 | 环内拆人 |
| 平级 Teams 消息总线 | ❌ | P2 | 对标实验中的 Agent Teams |

---

## 4. 技能目录（Skill / 方法 SKU）

技能 = **可点名的方法**，不是散落在 system 里的一句话。

| ID | 状态 | 优先级 | 说明 |
|----|------|--------|------|
| `plan-first` | ⚠️ 嵌在 loop | P0 | `require_plan`；应可标成可开关技能 |
| `explore-codebase` | ⚠️ 靠 explore 角色 | P0 | 独立 skill 文档 + 触发条件 |
| `implement-and-verify` | ❌ | **P0** | 改 → 跑测/lint → 读失败 → 再改 |
| `code-review` | ⚠️ review 角色 | P0 | 固化检查项 |
| `research-web` | ❌ | P0 | 依赖 webfetch/websearch |
| `office-decompose` | ⚠️ system 提示 | P1 | 一句话 → 多交付物 |
| `multi-agent-split` | ⚠️ intent→topology | P1 | 意图拆专家 |
| 领域包（法务/客服/数据…） | ❌ | P2 | 行业原料，后置 |

**缺口本质：** 仓库几乎没有可版本化的 `skills/*.md` 原料包；Flow 里的 skill 与 harness 方法未统一成「工厂 SKU」。

---

## 5. 角色模板（Role SKU）

| ID | 状态 | 优先级 | 默认手脚 |
|----|------|--------|----------|
| `opencode` / Build 型 | ✅ profile | P0 | coding + plan + task |
| `workbuddy` 办公员工 | ✅ profile | P0 | office + deliverable |
| `multi` 编队 | ✅ profile | P0 | topology 导出 |
| `action` 经典环 | ✅ | P1 | observe→plan→act |
| `explore` 子角色 | ✅ task | P0 | 只读 + glob/grep |
| `general` 子角色 | ✅ task | P0 | 全 coding（不可嵌套 task） |
| `review` 子角色 | ✅ task | P0 | 只读审查 |
| `scout` 子角色 | ✅ task | P0 | web + 只读仓 |
| `plan` 主角色（只读规划） | ❌ | **P0** | 禁写/限 shell，与 Build 切换 |
| `scout` 外研 | ✅ | P0 | 见上 |
| 自定义角色包 | 部分 | P1 | markdown/JSON 定义 → 工厂登记 |

---

## 6. 装配规则（Assembly）

| 能力 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| Bundle 导出 + workspace 绑定 | ✅ | P0 | 已有 |
| toolbelt.json 清单 | ✅ | P0 | coding 已含 task；需与真实注册表同步 |
| 宪法 / 审计 | ✅ | P0 | 已有 |
| 组织 ACL | ✅ 粗 | P0→P1 | 缺按命令/路径的 ask |
| `require_plan` / `enable_task` | ✅ | P0 | flow config |
| 拓扑 pipeline | ✅ 串行 | P1 | 并行边、依赖边 |
| 托管 manage | ✅ | P1 | 升级/跨机仍弱 |
| 人审闸（ask） | ❌ | **P0** | 危险操作停问 |
| 原料注册表（统一 ID） | ✅ | P0 | `core/materials.py` + Bundle `config/materials.json` |
| SSO / 企业身份 | ❌ | P2 | 真 IM 同级后置 |

---

## 7. 统一「原料注册表」（建议立刻立项）

目标：一个 ID，三处一致——

1. **货架文档**（本文件）  
2. **运行时可调用**（toolbelt / MCP / skill loader）  
3. **导出物可声明**（`config/materials.json` 或扩展 `toolbelt.json`）

建议最小结构：

```json
{
  "version": "1.0",
  "tools": [{"id": "webfetch", "source": "builtin|mcp|registry", "belt": ["coding", "scout"]}],
  "skills": [{"id": "implement-and-verify", "path": "skills/implement-and-verify.md"}],
  "roles": [{"id": "scout", "tools": ["read", "list", "grep", "webfetch", "websearch"]}]
}
```

没有注册表，工厂会继续「Studio 一套、harness 一套、导出又一套」。

---

## 8. 建议进货顺序（执行用）

### 第一刀（原料基建）— ✅ 已进货
1. ~~落地本目录为团队口径（本文）~~  
2. ~~**`config/materials.json` + 注册表加载**~~（`core/materials.py`，出包写入）  
3. ~~**`webfetch` / `websearch` / `glob` / `grep` / `question`** 进 coding 产线~~；**`scout` 角色**已挂 task  

### 第二刀（继续夯实）
4. ~~`glob` + `grep`~~ ✅  
5. ~~`question`~~ ✅（落盘；完整人审 ask 闸仍待）  
6. 角色：`plan`（只读主角色）仍待；~~`scout`~~ ✅  
7. MCP 依赖可进 Bundle 声明并在 harness 调用  
8. 技能包 md：`implement-and-verify` 等  

### 明确后置
- 真 IM、平级 Teams、LSP、snapshot、行业包  

---

## 9. 验收口径（工厂视角）

一条原料算「进厂」当且仅当：

- [ ] 有稳定 **ID** 与说明  
- [ ] **harness 或 Bundle 运行时**能调到（不只是文档）  
- [ ] **导出物**能声明依赖或直接带上  
- [ ] 至少被 **一个角色模板或技能**引用  
- [ ] 有 **单测或 live 抽检**

---

## 10. 与毕业双轨的关系

| 毕业轨 | 更依赖哪些原料 |
|--------|----------------|
| G1 编码 harness | coding 工具 + plan/task + explore/verify 技能 |
| G2-A 办公 | office 工具 + 拆解技能 + 交付物 |
| G2-B IM | IM 工具（后置） |
| G2-C/D 权限/托管 | 装配规则 |
| G2-E 多编排 | task + topology + A2A + 拆专家技能 |

**总毕业进度不靠堆功能点，靠原料 SKU 是否可装配、可导出。**

---

*版本：2026-07-18 · 状态：目录初稿，随进货更新「状态」列*
