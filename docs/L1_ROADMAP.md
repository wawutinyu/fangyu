# L1 开发主线与技术方案

> **后续开发北极星。** 画布不只造「聊天 Agent」，而是造**能干活、带身份、可加密通信、可独立导出、可授权接入**的行动体。

关联文档：[愿景与产品方向](VISION_AND_PRODUCT.md)（含 **四门两包** 交付模型）

**产品交付（锁定）：** 叙事 **序 / 行 / 观 / 律** 四门；安装 **studio + worker** 两包。观、律先挂序包为一等入口，协议独立，达标再拆包。

---

## 一、产品主线（四条关切）

### 主线 1：Action-first 画布 — 「长了手脚」的 Agent

**目标：** 对标 OpenClaw / OpenCode / Cursor — 不是 prompt chain，而是 **感知 → 决策 → 执行 → 验证** 的常驻工作者。

| 聊天 Agent | 干活 Agent（目标） |
|------------|-------------------|
| 输入文本 → 输出文本 | 改文件 / 调 API / 控设备 / 跑子流程 |
| Flow 终点是 LLM | Flow 终点是 **action + 可验证结果** |
| 人持续打字 | 人设定目标，Agent **持续执行** |

**画布要求：**
- 默认模板面向 **worker**（tool/code/mcp/http/approval loop），而非纯 LLM 链
- 节点组合支持 **observe → plan → act → verify** 闭环
- 导出物默认 **常驻 runtime**，不是一次性脚本

---

### 主线 2：导出 Agent 携带平台身份 + 加密通信

**目标：** 导出物不是裸 Python，而是 **fangyu 生态出生的可验证个体**。

每个导出 Agent 必须携带：
- `agent_id` — 平台签发 / 注册的唯一标识
- **密钥对** — 用于签名与加密通信
- `constitution_version` — 签署过的社会契约版本
- `protocol_version` — A2A + fangyu envelope 版本

**离平台后仍能：**
- 证明身份（「我是 fangyu 签发的 Agent」）
- 与其他 Agent **加密**通信（非明文 HTTP）
- 被验证授权状态（TrustRegistry / 吊销）

---

### 主线 3：多通道通信拓扑

**目标：** 通信不只是 Chat 文本，而是结构化 **Message + Payload**。

| 通道 | 场景 |
|------|------|
| User ↔ Agent | 任务下达、审批、多模态输入 |
| Agent ↔ Agent | 协作、委派、worker 只对内 |
| External Agent ↔ 生态 | 第三方 Agent 经协议 + 授权加入 |
| Physical AI（远期） | 产线、机器人 — 状态/事件/指令，非聊天 |

**Agent 类型（一等公民）：**
- **Interface Agent** — 面向用户（Chat/UI/API）
- **Worker Agent** — 只和 Agent 通信，无用户 UI
- **Hybrid Agent** — 两者兼备

**导出后：** 上述能力 **完整打包**，不依赖 fangyu UI。

---

### 主线 4：Agent 编排 — 本厂 + 授权外来

**目标：** Agent 编排画布 = 平台设计的 Agent + **经授权的外部 Agent**。

- 外部 Agent 通过 **AgentCard + 公钥 + skill ACL** 注册
- 编排 UI 区分：**本厂 / 已授权 / 未授权**
- 运行时 **真实 A2A RPC**，不是 LLM 模拟对话

---

## 二、L1 成功标准（验收一句话）

> 从画布导出任意 Agent 后，**在不启动 fangyu 平台 UI** 的情况下，它仍能：  
> （1）用 skill **干活**；（2）用平台签发的身份 **加密** 调用/被调用；（3）接入 A2A 网络（含授权外来者）。

---

## 三、技术架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                     fangyu 平台（设计期）                          │
│  Flow 画布 ──► Action Flow    Agent 画布 ──► 本厂 + 外来 Agent   │
│       │              │                │              │          │
│       └──────► Export Pipeline ◄──────┴──────────────┘          │
│                      │                                          │
│              ┌───────▼────────┐                                 │
│              │  Agent Bundle  │  ← 导出标准包（见 §四）           │
│              └───────┬────────┘                                 │
└──────────────────────┼──────────────────────────────────────────┘
                       │ 部署
┌──────────────────────▼──────────────────────────────────────────┐
│              Standalone Agent Runtime（运行期）                    │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Skill Engine│  │ Identity/ATP │  │ A2A Transport (HTTP/…)  │ │
│  │ (flow/exec) │  │ sign/verify  │  │ server + client         │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Tool/MCP    │  │ Constitution │  │ Adapters (user/physical)│ │
│  │ 手脚层       │  │ 本地 enforcement│  │ 可选 Human API / MQTT  │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                       │ A2A + Envelope
                       ▼
              其他 fangyu / 第三方 Agent
```

**设计原则：**
1. **Export = Runtime 打包**，不是只导出 flow JSON 或裸脚本
2. **协议与实现分离** — A2A Message 层稳定；Payload 可扩展（text/json/image/industrial）
3. **身份与能力分离** — AgentCard 描述能力；ATP 描述信任与授权
4. **复用现有** — `engine/`、`a2a/`、`core/constitution.py` 嵌入 runtime，不重写

---

## 四、Agent Bundle 导出标准（草案）

导出物目录结构建议：

```
my-agent.bundle/
├── manifest.json          # 元数据、版本、入口
├── agent.card.json        # A2A AgentCard
├── identity/
│   ├── agent_id           # 平台签发 ID
│   ├── public_key.pem     # 公钥（私钥单独交付或 HSM）
│   └── constitution.sig   # 签署的宪法版本 + 签名
├── skills/
│   ├── search/
│   │   ├── flow.json      # 或 compiled.py
│   │   └── meta.json
│   └── analyze/ ...
├── runtime/
│   ├── engine/            # 精简版 DAG 执行器（或嵌入 generated main.py）
│   ├── a2a_client.py      # JSON-RPC + envelope
│   ├── a2a_server.py      # 可选：对外暴露 skill
│   └── constitution.json  # 本地 enforcement 副本
├── config/
│   ├── interfaces.yaml      # user_api: on/off, a2a_listen: port
│   └── trust_policy.yaml    # 允许调用哪些外部 agent/skill
└── start.sh / start.exe     # 一键启动常驻进程
```

**manifest.json 核心字段：**

```json
{
  "bundle_version": "1.0",
  "platform": "fangyu",
  "agent_id": "fyu:agent:uuid",
  "exported_at": "ISO8601",
  "runtime_entry": "runtime/main.py",
  "capabilities": {
    "a2a_server": true,
    "a2a_client": true,
    "user_interface": false,
    "worker_only": true
  },
  "protocols": ["a2a/1.0", "fangyu-envelope/1.0"]
}
```

**与现有代码的关系：**
- `codeGenerator.ts` → 生成 `runtime/engine` 或 `skills/*/compiled.py`
- `agentDeploy.ts` / `agentCodeGenerator.ts` → 扩展为 **bundle 组装器**
- `a2a/trust/envelope.py` → 嵌入 runtime，导出时生成密钥对

---

## 五、通信协议层设计

### 5.1 Message 抽象（A2A 扩展）

在现有 A2A Task/Message 之上，统一 **Envelope + Payload**：

```
MessageEnvelope (已有)
  ├── sender_id, timestamp, nonce, signature
  └── payload → JSON:
        {
          "type": "a2a.skill_invoke",
          "target_agent": "...",
          "skill_id": "...",
          "content_type": "text/plain | application/json | multipart/...",
          "body": { ... }
        }
```

**content_type 扩展路线：**
- Phase 1：`text/plain`、`application/json`（结构化 tool 结果）
- Phase 2：`image/*`、文件引用
- Phase 3：`application/opcua` / `application/mqtt` 等工业 adapter 映射到同一 Message

### 5.2 Agent 类型在协议中的表达

AgentCard 增加 `interfaces` 字段：

```json
{
  "name": "FactoryWorker",
  "interfaces": {
    "user": { "enabled": false },
    "a2a": { "enabled": true, "url": "https://host:9001/rpc" }
  },
  "skills": [...]
}
```

Worker-only Agent：`user.enabled = false`，runtime 不启动 Chat UI。

### 5.3 第三方 Agent 加入（Federation）

**Onboarding 流程：**

1. 外部 Agent 提交 **AgentCard + 公钥** → `POST /api/v1/a2a/agents/register_external`
2. 平台管理员 / 用户 **授权** skill 白名单 → 写入 TrustRegistry
3. Agent 编排画布 **发现** 已授权 Agent → 作为节点拖入
4. 运行时通过 **A2A RPC + envelope 验签** 调用

**与现有代码：**
- 扩展 `AgentRegistry` / `TrustRegistry` 支持 `external: true`
- `routers/a2a.py` 已有 envelope 验签钩子 → runtime 同步

---

## 六、Action-first 画布技术方案

### 6.1 Flow 层：从 LLM-centric 到 Action-centric

**新增/强化节点语义：**
- `action-loop`（复合节点模板）：observe(code/http) → llm(plan) → tool-act → verify(condition)
- 现有 `code` / `tool-call` / `mcp-call` / `http` 作为 **手脚 primitives**

**引擎层：**
- `engine/scheduler.py` 已支持 DAG — 无需改架构
- 新增 **长运行模式**：`run_flow_daemon()` — 循环等待 trigger/A2A 消息 → 执行 skill subgraph

### 6.2 对标 OpenClaw / Cursor 的能力映射

| 能力 | fangyu 落点 |
|------|-------------|
| 文件读写 | `code` 节点 + sandbox；导出 runtime 挂载 workspace |
| 终端/命令 | `tool-call` → shell（宪法 gate + ALLOW_DANGEROUS_TOOLS） |
| 浏览器/API | `http` + 未来 `browser` 节点 |
| 多步自主 | composite + loop + approval |
| IDE 集成 | 导出 runtime 提供 **本地 HTTP API**（类似 OpenCode server） |

### 6.3 默认 skill 从 LLM 链改为 Action 链

修改 `agentDeploy.buildDefaultSkillFlow()`：
- 默认 worker skill：`trigger → code/tool → output`
- LLM 仅作为 **规划节点**，非唯一路径

---

## 七、分阶段落地路线

### Phase 1 — Agent Bundle MVP ✅ 已完成

**交付：** 导出一个 **worker Agent bundle**，本机启动后可 A2A 被调用。

| 任务 | 说明 |
|------|------|
| 定义 `manifest.json` + bundle 目录规范 | 文档 + schema |
| 导出 pipeline 组装 bundle | 扩展 `exportFlow.ts` / 新 `exportAgentBundle.ts` |
| 签发 agent_id + 密钥对 | 集成 `AgentIdentity`，写入 bundle |
| 嵌入精简 runtime | `engine` + `a2a/transport_http` + envelope |
| CLI `py -m fangyu run-bundle ./my-agent.bundle` | 常驻进程 + A2A server |
| 验收 | 平台 deploy 的 Agent 与 bundle Agent 互发 A2A 消息 |

**复用：** `codeGenerator.ts`、`a2a/trust/*`、`engine/scheduler.py`

---

### Phase 2 — Worker / Interface 分型 + 加密通信闭环 ✅ 已完成

| 任务 | 说明 |
|------|------|
| AgentCard `interfaces` 字段 | 区分 user / a2a / worker_only |
| 画布 Agent 类型 UI | Interface / Worker / Hybrid |
| 全部 A2A 走 MessageEnvelope | 平台内 + bundle 外统一 |
| constitution 写入 bundle + 本地 scan | 导出时签署快照 |
| 验收 | 两个 bundle 跨机器加密 RPC；worker 无 UI |

---

### Phase 3 — 编排本厂 + 授权外来 Agent ✅ 已完成

| 任务 | 说明 |
|------|------|
| `register_external` API + 授权 UI | Agent 编排面板 |
| 画布节点类型 `external-agent` | 显示 trust 状态 |
| Orchestrator 支持 external target | `agentOrchestrate.ts` 扩展 |
| Agent 发现/registry | 可选：轻量 directory 服务 |
| 验收 | 画布编排「本厂 + 外部」完成一条协作链 |

---

### Phase 4 — 多模态 & 物理 Adapter 接口 ✅ 已完成

| 任务 | 说明 | 状态 |
|------|------|------|
| Payload `content_type` 扩展 | image、file ref、industrial | ✅ |
| Adapter 插件接口 | mqtt/opcua/plc 模拟 | ✅ |
| 产线 demo | worker Agent ↔ 模拟 PLC | ✅ |
| 文档 | [Adapter 开发指南](ADAPTER_DEV_GUIDE.md) | ✅ |

---

### Phase 5 — 开发者基础设施打磨（**当前阶段**）

> **受众：开发者 / 集成商。** 把 L0–L1 做成「能依赖、能集成、能交付」的 infra，不追求大众零门槛。

**技术方案：** [Phase 5 技术方案](PHASE5_TECH_SPEC.md) · [安全模型 v1](SECURITY_MODEL.md)

| 任务 | 说明 | 状态 |
|------|------|------|
| 开发者 Happy Path | Flow→Bundle→`bundle run`→跨机 A2A，≤5 步、无手改 JSON | ✅ |
| 长运行 Worker | daemon：等 A2A → 执行 skill subgraph | ✅ |
| 安全模型拍板 | 私钥交付、envelope 全链路、吊销 — 文档化 | ✅ |
| SDK / CLI 统一 | `fangyu bundle run\|rpc\|validate\|trust` | ✅ |
| 外部 Agent DX | discover 自动填身份 + 一键授权 | ✅ |
| 真 MQTT Adapter | `adapters/mqtt_client.py` + `fangyu[mqtt]` | ✅ |
| 真 OPC-UA Adapter | 真实 client（非 sim） | ⏸ 暂缓（sim 够用，Phase 6+ 按需） |
| Bundle MQTT 事件触发 | subscribe → 自动执行 skill（daemon 增强） | ✅ |

### Phase 5.5 — 单 Agent 行动闭环（**当前**）

| 任务 | 说明 | 状态 |
|------|------|------|
| Action Loop 模板 | observe → plan → act → verify 默认 skill | ✅ |
| Bundle workspace | `workspace/` 挂载 + `ws_read/write/list` | ✅ |
| 任务状态持久化 | `.fangyu/state.json` | ✅ |
| Flow 画布 demo | `actionWorker` 模板 | ✅ |
| LLM 规划节点 | plan 步骤可选接 llm 节点 | ✅ |
| 开发者文档 | [集成 Cookbook](INTEGRATION_COOKBOOK.md) | ✅ |

**验收：** 一个**未参与本项目开发的工程师**，按文档可在 1 小时内完成 Bundle 导出 + 独立运行 + 远程 RPC。

---

### Phase 6 — AI 助手层 + 场景模板（**进行中**）

> **受众：普通人 + 开发者。** 在 Phase 5 的 L0 之上叠 L2/L3，行业通过模板覆盖，不 fork 代码。

| 任务 | 说明 | 状态 |
|------|------|------|
| Intent → Flow | 自然语言描述目标 → 生成 action-first flow + 宪法扫描 | ✅ MVP（模板路由 + 序工具栏「意图生成」） |
| Intent → Agent 网 | 描述协作关系 → 自动生成 Agent 画布 + 路由 | ✅ MVP（`POST /api/v1/intent/to-agents` + 意图面板） |
| **观 · Presence MVP** | Agent/Worker 在线忙闲 + 协作时间线（挂序内） | ✅ + 持久化 + 协作边图 |
| **律 · 一等入口** | 宪法/审计从设置边角升格为序包主入口 | ✅ + 白话解释 |
| **违宪 / 失败可解释** | 协作失败、ATP 拒绝 → 白话 + 建议下一步 | ✅ MVP（`lawExplain` · 律面板） |
| Setup Copilot | 外部 Agent：粘贴 URL → 人话确认信任 → 一键授权 | ✅ MVP（`POST /api/v1/setup/copilot/preview` + 序内面板） |
| 场景模板库 | 产线巡检、文档助手等 — 一键实例化 Bundle + 策略包 | ✅ MVP（`POST /api/v1/scenario/instantiate` + 序「场景模板」） |
| 模板市场（可选） | 社区/官方模板分发 | ⬜ |

**API：** `POST /api/v1/intent/to-flow` · `POST /api/v1/intent/to-agents` · `GET /api/v1/presence` · `GET /api/v1/presence/stream`（SSE） · `POST /api/v1/setup/copilot/preview` · `GET /api/v1/scenario/templates` · `POST /api/v1/scenario/instantiate`  
**测试：** `test_intent_flow.py` · `test_intent_agents.py` · `test_collaboration.py` · `test_presence_integration.py` · `test_setup_and_sse.py` · `test_scenario_templates.py`

**行壳（开发）：** `dev-worker-tray.bat`（过渡）· `dev-worker-tauri.bat`（Tauri MVP，需 Rust）— 见 `fangyu-worker-tauri/README.md`

**验收（完整 Phase 6）：** 非开发者用户仅通过对话 + 按钮，完成「创建一个 Worker 并导出运行」（无需理解 agent_id/公钥）。

> **Mac 进展（2026-07-18）：** `./install-worker.sh` → `~/Applications/Fangyu-Worker.command`，无需理解公钥；平台信封 `FANGYU_PLATFORM_REQUIRE_ENVELOPE` + 序自动签名已就绪（默认关闭强制，可开）。完整「对话建 Worker」仍待 Setup Copilot 扩到行侧。

**前置条件：** Phase 5 开发者 Happy Path 全绿；否则 AI 层只会生成不可靠的配置。

---

## 八、关键模块与现有代码映射

| 新能力 | 主要改动位置 |
|--------|--------------|
| Bundle 导出 | `fangyu-canvas/src/utils/exportAgentBundle.ts`（新） |
| Bundle 运行 | `fangyu/__main__.py` 增 `run-bundle`；`engine/agent_runtime.py`（新） |
| 身份签发 | `a2a/trust/identity.py`、`routers/trust.py` |
| 加密通信 | `a2a/trust/envelope.py`（已有，扩到全链路） |
| Worker 分型 | `agentSlice.ts`、`AgentConfigPanel.tsx`、`a2a/protocol.py` |
| 外来 Agent | `engine/a2a_runtime.py` AgentRegistry、`routers/a2a.py` |
| Action 模板 | `demoFlows.ts`、节点库默认模板 |
| 宪法签署 | `core/constitution.py` + bundle `identity/constitution.sig` |

---

## 九、风险与决策点（需后续拍板）

1. **私钥交付：** bundle 内含私钥 vs 用户自生成 vs HSM — 影响安全模型
2. **Runtime 体积：** 嵌入 full engine vs 编译 skill 为单文件 — 影响启动速度
3. **协议兼容：** 严格 A2A 标准 vs fangyu 扩展字段 — 影响第三方接入成本
4. **物理 AI 时机：** Phase 4 仅定义 adapter 接口，避免过早绑定 OPC-UA/MQTT 实现

---

## 十、与现有 TEST/CI 的关系

每 Phase 增加：
- Bundle 结构 schema 测试
- 跨进程 A2A integration test（已有 demo 脚本基础）
- Export bundle → run → invoke skill 端到端
- Envelope 验签 fail-closed 测试

---

*文档版本：L1 主线 v2.1 — Phase 1–5.5 已完成；Phase 6 Intent→Flow MVP 已落地。*
