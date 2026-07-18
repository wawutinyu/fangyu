# fangyu 安全模型 v1

> Phase 5 拍板文档。Happy Path、跨机 A2A、外部 Agent 联邦均以此为准。

关联：[Phase 5 技术方案](PHASE5_TECH_SPEC.md) · [L1 主线](L1_ROADMAP.md)

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **Fail-closed** | 验签失败、未授权、信封缺失 → 拒绝，不降级明文 |
| **身份与能力分离** | AgentCard 描述能力；ATP/TrustRegistry 描述谁可调用什么 |
| **最小暴露** | RPC 端点只暴露公钥；私钥永不通过 HTTP 返回 |
| **开发者默认安全** | 新导出 Bundle `require_envelope=true`；本地调试可显式关闭 |

### 1.1 TrustRegistry 入口

- **应用 / API / 引擎：** `from fangyu.engine.trust_runtime import TrustRegistry`
- **协议实现源：** `fangyu.a2a.trust.registry`（由 `trust_runtime` re-export，进程内是同一类）
- 勿在业务代码再维护第二套注册表；单测用 `assert fangyu.a2a.trust.registry.TrustRegistry is fangyu.engine.trust_runtime.TrustRegistry` 防回归

---

## 2. 密钥与身份

### 2.1 签发

- 导出 Bundle 时由 `AgentIdentity.generate()` 生成 **Ed25519** 密钥对
- `agent_id` 格式：`fyu:agent:<16hex>`，写入 `manifest.json` 与 `identity.json`
- 宪法快照签署：`identity.json` → `constitution.payload` + `constitution.signature`

### 2.2 私钥交付（v1 决策）

| 场景 | 策略 |
|------|------|
| **开发者 / 本机调试** | 私钥写入 `identity.json`（`private_key_hex`），Bundle 目录即完整 runtime |
| **跨机部署** | 将整个 Bundle 目录（含私钥）通过安全通道传输；或拆包后私钥单独交付 |
| **生产（v1.1）** | `embed_private_key=false` + 环境变量 `FANGYU_AGENT_PRIVATE_KEY`（hex） |

**v1.1 已实现 env 注入：** `resolve_agent_identity()` 优先读 `FANGYU_AGENT_PRIVATE_KEY`。

### 2.3 公钥发现

Bundle runtime 暴露：

- `GET /health` — `agent_id`、`public_key`、`require_envelope`
- `GET /identity/public` — 仅公钥侧信息（供外部 Agent onboarding）

**禁止** 任何 HTTP 端点返回 `private_key_hex`。

---

## 3. MessageEnvelope（加密通信 v1）

### 3.1 范围

v1「加密」= **Ed25519 签名 + 载荷绑定**，非端到端对称加密。

```
X-A2A-Envelope: {
  "senderId": "fyu:agent:...",
  "timestamp": 1234567890,
  "nonce": "...",
  "signature": "...",
  "payload": "<canonical JSON-RPC body>"
}
```

### 3.2 默认策略

| 配置 | 默认值 | 位置 |
|------|--------|------|
| `require_envelope` | `true` | `config/interfaces.json` → `trust_policy` |
| 平台内 A2A | 可强制（`FANGYU_PLATFORM_REQUIRE_ENVELOPE=1`） | `verify_a2a_envelope` + 序 `a2aSend` 自动签 |
| 平台身份 | `data/platform-identity.json`（gitignore） | `GET /api/v1/trust/platform` · `POST …/platform/sign` |
| Bundle 对外 RPC | 强制（当 require_envelope=true） | `bundle_runtime._verify_envelope` → 同 `verify_a2a_envelope` |

### 3.3 验签流程

1. 解析 `X-A2A-Envelope` header
2. 比对 `envelope.payload` 与请求 body（JSON 语义相等）
3. `MessageEnvelope.verify()` — 查 TrustRegistry 公钥验签
4. 失败 → JSON-RPC `403`

### 3.4 trusted_peers

跨 Bundle 互调时，接收方需预注册发送方：

```json
{
  "trust_policy": {
    "trusted_peers": [
      { "agent_id": "fyu:agent:abc...", "public_key": "<hex>", "allowed_skills": ["*"] }
    ]
  }
}
```

CLI/API 提供 `add_trusted_peer()`，Happy Path 脚本自动配置，**无需手改 JSON**。

---

## 4. 授权模型

### 4.1 本厂 Agent（Bundle / 平台 deploy）

- 自身身份自动注册 TrustRegistry
- skill 调用走 `assert_agent_authorized(agent_name, skill_id, trust)`

### 4.2 外部 Agent（联邦）

| 步骤 | 动作 |
|------|------|
| 1 | `POST /agents/discover` — 拉 AgentCard + 公钥身份 |
| 2 | `POST /agents/register_external` — 注册 rpc_url + agent_id + public_key |
| 3 | `POST /agents/{name}/authorize` — 显式授权 + skill ACL |
| 4 | 编排调用 | `AgentBus`：组织 ACL → `authorized` + `allowed_skills` |

**默认策略**（`org_acl.external_agents`）：

- 注册：`authorized=false`；`allowed_skills` 取 Agent Card 技能 id（拒绝裸 `*`）
- 组织 ACL 启用后：调用外部需 `agent:call:external:*`（`operator` 默认有；`viewer` 无）
- 未授权外部 Agent → `TrustViolation(not_authorized)`，fail-closed

---

## 5. 吊销（v1 范围）

| 能力 | v1 | 后续 |
|------|-----|------|
| 取消外部授权 | ✅ `authorize=false` | — |
| 内存 TrustRegistry 注销 | ✅ `AgentRegistry.unregister` | — |
| 持久化 CRL / 链上 anchor | ❌ | Phase 5.2+ |
| Bundle 宪法违宪扫描 | ✅ 导出时签署 + 运行时 gate | — |

---

## 6. 开发者 Happy Path 安全 checklist

1. 导出 Bundle → `require_envelope=true`（默认）
2. `py -m fangyu bundle run ./my-agent --port 9001` — 常驻 daemon
3. 调用方用 `bundle_a2a_client.rpc_call()` 或 `fangyu bundle rpc` — 自动签名
4. 跨机：接收方 `bundle trust add --from ./caller-bundle` 或 Happy Path 脚本
5. 外部 Agent：discover → 自动填公钥 → 勾选授权

**验收：** 全程无手改 `identity.json` / `interfaces.json`。

---

## 7. 威胁模型（简要）

| 威胁 | v1 缓解 |
|------|---------|
| 伪造 RPC 请求 | Envelope 验签 + trusted_peers |
| 重放攻击 | timestamp + nonce（Envelope 层，窗口 300s；见 `test_envelope.py`） |
| 私钥泄露 | 文档警告；生产用 env/HSM（后续） |
| 未授权外部 Agent | authorize + skill ACL |
| 违宪 flow | constitution scan + runtime gate |
| 代码节点任意执行 | `engine/sandbox.py`：禁 builtins / 禁 `open`/`eval`/…；语句级禁 `import`；超时；测见 `test_sandbox.py` |

---

*版本：security-model/1.1 — 过夜补 sandbox / envelope 测试与 import 语句拦截*
