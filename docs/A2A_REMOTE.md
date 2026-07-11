# 跨机器 A2A 通信

fangyu 支持通过 **JSON-RPC over HTTP** 从另一台机器调用已部署的 Agent。

## 架构

```
机器 A (客户端)                    机器 B (fangyu 服务端)
  scripts/a2a_remote_demo.py  →  POST /api/v1/a2a/rpc
  a2a.transport_http.HTTPTransport   AgentBus → Agent 执行
```

## 快速开始

### 1. 启动服务端（机器 B）

```bash
py -m pip install -e .
py -m fangyu --server    # http://0.0.0.0:8000
```

在 Agent 画布部署至少一个 Agent，或使用演示脚本自动注册 Echo Agent。

### 2. 远程调用（机器 A 或本机）

```bash
py -3 scripts/a2a_remote_demo.py --base http://192.168.1.10:8000
```

## JSON-RPC 方法

| 方法 | 说明 |
|------|------|
| `a2a.send_message` | 向 Agent 发送消息，返回 Task |
| `a2a.get_task` | 查询 Task 状态 |
| `a2a.list_tasks` | 列出 Task |
| `a2a.list_agents` | 列出已注册 Agent |
| `a2a.get_agent_card` | 获取 AgentCard |

### 请求示例

```bash
curl -X POST http://localhost:8000/api/v1/a2a/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "a2a.send_message",
    "params": {
      "targetAgent": "Echo",
      "message": {"role": "user", "parts": [{"type": "text", "text": "hi"}]}
    },
    "id": "1"
  }'
```

## Python 客户端

```python
from fangyu.a2a.transport_http import HTTPTransport

transport = HTTPTransport(base_url="http://remote-host:8000/api/v1/a2a/rpc")
task = transport.call("a2a.send_message", {
    "targetAgent": "MyAgent",
    "message": {"role": "user", "parts": [{"type": "text", "text": "hello"}]},
})
```

## 注意事项

- 生产环境应启用 **ATP 信任层** 并配置 HTTPS
- 防火墙需放行 8000 端口（或自定义 PORT）
- Agent 的 `defaultInterface.url` 应指向可达的 RPC 端点
