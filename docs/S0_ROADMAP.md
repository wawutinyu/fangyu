# S0 安全止血清单（裁剪版路线）

> 对照仓库日期：2026-07-21  
> 原则：公网先止血；质量 14 层先不做。每项修完写测试。  
> 来源：安全审计 P0 + A2A 审计 P0，经仓库核对。

状态：`OPEN` 仍成立 · `PARTIAL` 有半截防护 · `N/A` 本阶段不做

---

## S0-A 认证（最先）

| ID | 项 | 仓库现状 | 状态 | 改法（摘要） |
|----|----|----------|------|--------------|
| A1 | `POST /api/v1/auth/token` 开放签发 | `routers/auth.py` + `FANGYU_ALLOW_DEV_TOKEN` | **DONE** | 默认随 REQUIRE_AUTH；生产 `=0` |
| A2 | 全局强制鉴权 | `server.py` + `core/auth_gate.py` | **DONE** | `FANGYU_REQUIRE_AUTH=1` |
| A3 | ACL 默认关 / require_principal=false | `core/org_acl.py` + `server.py` lifespan | **DONE** | `REQUIRE_AUTH` 时自动 `enable_acl(True, require_principal=True)` |

**验收**：无 Token 调 `/api/v1/flow/run`、`/api/v1/llm/chat`、`/api/v1/settings` → 401。

---

## S0-B RCE / 任意执行

| ID | 项 | 仓库现状 | 状态 | 改法（摘要） |
|----|----|----------|------|--------------|
| B1 | `tool_registry` `exec` + 危险内置 | `engine/tool_registry.py` | **DONE** | shell/file 原生 argv；拒危险注册；收紧 builtins |
| B2 | `bundle_tools` shell 黑名单可绕过 | `engine/bundle_tools.py` | **DONE** | argv + 禁止元字符；无 shell=True |
| B3 | skills 路径遍历 | `engine/skill.py` | **DONE** | `_resolve_under` / `is_relative_to` |
| B4 | 前端 `new Function` | `localExecutor.ts` | **DONE** | 默认关；Vitest/Tauri/`fangyu_allow_local_js` 可开 |
| B5 | 沙箱 `().__class__` 逃逸 | `engine/sandbox.py` | **DONE** | 逃逸模式正则黑名单 |
| B6 | 导出 compile 任意源码 | `routers/export_compile.py` | **DONE** | 默认禁 compile；路径净化；限流 |

**验收**：未授权无法 `exec`/写 skills 逃出目录；危险工具默认 403。

---

## S0-C 密钥与日志

| ID | 项 | 仓库现状 | 状态 | 改法（摘要） |
|----|----|----------|------|--------------|
| C1 | Flow 把 settings（含 Key）注入 global_vars | 运行时仍注入；**日志/settings API 已脱敏** | **PARTIAL** | ExecutionLog + GET settings 脱敏 |
| C2 | `GET /settings` 暴露 Key | settings 路由已 mask | **DONE** | `redact_mapping` |
| C3 | Webhook secret 不校验 | `routers/trigger.py` | **DONE** | 校验 `X-Fangyu-Webhook-Secret` |

**验收**：monitor/logs 与 settings 响应看不到完整 API Key；错误 secret 的 hook → 401。

---

## S0-D A2A（生产最小）

| ID | 项 | 仓库现状 | 状态 | 改法（摘要） |
|----|----|----------|------|--------------|
| D1 | 信封默认不强制 | `auth_gate.platform_require_envelope` | **DONE** | 显式 env 或随 `REQUIRE_AUTH`；生产设 `=1` |
| D2 | orchestrate / 平台 RPC 无身份 | A2A 路由 | **DONE** | 全局鉴权 + orchestrate 只用 JWT principal |
| D3 | nonce `clear()` 重放 | trust registry | **DONE** | OrderedDict FIFO 淘汰 |

**验收**：无信封的 `send_message` 在生产配置下被拒。

---

## 明确不进 S0（冻住）

- 质量 14 层全量、Eval、A/B、冷启动预热  
- SQLite→PG、多机、重写前端  
- 102 项里所有 P2/P3 一次清完  

S0 完成后进入 **Q0**（scope exclusion + guardrails + validator warn + 失败模式文档）。

---

## 建议动手顺序

```text
A1 → A2 → C1 → C3 → B3 → B1 → B6 → D1 → D2 → 其余 B/C/D
```

每项：改代码 → 单测（未授权 401 / 路径拒绝 / 脱敏）→ 再下一项。

## 公网临时缓解（改代码前）

若 `shengjiang.online/fangyu` 仍对外：

1. Nginx 对 `/api/` 加 IP 白名单或 Basic Auth  
2. 确认 `ALLOW_DANGEROUS_TOOLS=false`  
3. 不要依赖「没人知道 URL」
