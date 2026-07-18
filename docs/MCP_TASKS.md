# MCP Tasks（方隅最小实现）

对齐 **SEP-2663** `io.modelcontextprotocol/tasks` 的可跑子集，服务端无 session、靠 `taskId` 句柄轮询。

> 真 IM 仍暂缓；本能力服务「长耗时 MCP 工具」与无状态 HTTP 部署方向。

## 无状态 HTTP 传输

端点：`POST /mcp/v1/messages`（JSON-RPC 2.0，**无 session**）

`GET /mcp/v1/messages` 返回能力发现。

与 Studio REST 面并存：

| REST | JSON-RPC method |
|------|-----------------|
| `GET /api/v1/mcp/discover` | `initialize` / `server/discover` |
| `GET /api/v1/mcp/tools` | `tools/list` |
| `POST /api/v1/mcp/call` | `tools/call` |
| `GET /api/v1/mcp/tasks/{id}` | `tasks/get` |

示例：

```bash
curl -s http://127.0.0.1:8000/mcp/v1/messages -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"tools/list","params":{}
}'
```

Tasks 调用在 `params._meta` 中声明扩展：

```json
"_meta": {
  "io.modelcontextprotocol/clientCapabilities": {
    "extensions": { "io.modelcontextprotocol/tasks": {} }
  }
}
```

外连客户端（`McpServerConnection`）默认 POST 到对方的 `/mcp/v1/messages`。


```json
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/tasks": {}
    }
  }
}
```

## 调用

`POST /api/v1/mcp/call`

客户端须声明支持扩展（二选一）：

- `"supports_tasks": true`
- 或 `meta["io.modelcontextprotocol/clientCapabilities"].extensions` 含 Tasks

服务端何时返回 task：

- `"as_task": true`（强制）
- 或已声明支持且 `"delay_sec" > 0`（演示用延迟）

成功时：

```json
{
  "success": true,
  "resultType": "task",
  "taskId": "...",
  "status": "working",
  "pollIntervalMs": 500,
  "task": { "taskId": "...", "status": "working" }
}
```

未声明扩展却要求 task → HTTP 400，`code: -32003`。

## 轮询 / 更新 / 取消

| 方法 | 路径 |
|------|------|
| tasks/get | `GET /api/v1/mcp/tasks/{taskId}` |
| tasks/update | `POST /api/v1/mcp/tasks/{taskId}/update` |
| tasks/cancel | `POST /api/v1/mcp/tasks/{taskId}/cancel` |

状态：`working` → `completed` | `failed` | `cancelled`（`input_required` 预留）。

## 与厂内 `task` 子 Agent 的区别

| | MCP Tasks | agent-loop `task` |
|--|--|--|
| 层 | 工具/MCP 扩展 | Harness 委派 |
| 句柄 | `taskId` 轮询 | 子 agent-loop / background inject |
| 导出 | 协议能力 | Bundle 原料角色 |

不要混用名词：MCP Tasks ≠ OpenCode 风格 `task` 工具。
