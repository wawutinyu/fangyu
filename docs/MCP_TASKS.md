# MCP Tasks（方隅最小实现）

对齐 **SEP-2663** `io.modelcontextprotocol/tasks` 的可跑子集，服务端无 session、靠 `taskId` 句柄轮询。

> 真 IM 仍暂缓；本能力服务「长耗时 MCP 工具」与无状态 HTTP 部署方向。

## 能力声明

`GET /api/v1/mcp/discover`

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
