# A2A 跨厂发现

方隅把「工厂」当作可发现的对等点：本厂目录 + 远程探测 + 工厂通讯录。

## 本厂

| 路径 | 作用 |
|------|------|
| `GET /api/v1/a2a/discovery` | 已注册 Agent 列表 + well-known 提示 |
| `GET /api/v1/a2a/well-known/agent-card` | 平台公开 Agent Card |
| Bundle `.well-known/agent-card.json` | 导出物发现约定 |

## 远程

| 路径 | 作用 |
|------|------|
| `POST /api/v1/a2a/agents/discover` | `rpc_url` 或 `base_url` → Card + identity |
| `POST /api/v1/a2a/factories/probe` | 多路径探测（well-known / card / discovery / health） |
| `GET/POST/DELETE /api/v1/a2a/factories` | 跨厂通讯录（`DATA_DIR/a2a_factories.json`） |

探测顺序（拉 Card）：

1. `/.well-known/agent-card.json`
2. `/agent.card.json`
3. `/card`
4. `/api/v1/a2a/well-known/agent-card`
5. JSON-RPC `a2a.get_agent_card` / `a2a.list_agents`

Studio 外部 Agent「发现」可填工厂根 URL（不必手写 `/rpc`）。

运维面板 **工厂** 页：探测 → 入库 → 列表 / 再探测 / 删除（读写 `DATA_DIR/a2a_factories.json`）。
