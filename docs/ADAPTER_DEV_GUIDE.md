# Adapter 开发指南

> Phase 4 — 物理层 / 工业协议 Adapter 插件接口。面向第三方集成 MQTT、OPC-UA、Modbus 等。

关联：[L1 路线图](L1_ROADMAP.md)

---

## 1. 架构位置

```
外部设备/总线 (MQTT / OPC-UA / Modbus …)
        │ raw event
        ▼
   BaseAdapter.ingest()  →  Payload (content_type + body)
        │
        ▼
   A2A Message  →  Worker Agent skill flow
        │
        ▼
   BaseAdapter.emit()  →  外部指令 (降速 / 停机 / 写寄存器)
```

fangyu 不绑定具体工业协议实现；通过 **AdapterRegistry** 注册插件，统一映射到 A2A **Payload** 层。

---

## 2. Payload content_type

| content_type | 用途 |
|--------------|------|
| `text/plain` | 文本消息 |
| `application/json` | 结构化 JSON |
| `image/png` 等 | 图像引用（uri / bytes） |
| `application/file+ref` | 文件引用 |
| `application/industrial` | 产线/PLC/传感器事件 |

Industrial body 推荐字段：

```json
{
  "protocol": "mqtt",
  "tag": "temperature",
  "value": 85.2,
  "unit": "C",
  "alarm": true,
  "device_id": "plc_line1",
  "line_id": "line1"
}
```

Python 解析：`fangyu.a2a.payload.message_to_inputs(message)`  
TypeScript：`fangyu-canvas/src/utils/payload.ts` → `messageToInputs()`

---

## 3. 实现 BaseAdapter

```python
from fangyu.adapters.base import BaseAdapter
from fangyu.adapters.registry import AdapterRegistry
from fangyu.a2a.payload import Payload, CONTENT_INDUSTRIAL

class MyModbusAdapter(BaseAdapter):
    name = "my_modbus"
    protocol = "modbus"
    content_types = [CONTENT_INDUSTRIAL]

    def ingest(self, raw: dict) -> Payload:
        return Payload(
            content_type=CONTENT_INDUSTRIAL,
            body={"tag": raw["register"], "value": raw["value"], "protocol": "modbus"},
        )

    def emit(self, payload: Payload, target: str = "") -> dict:
        # 写寄存器 / 下发指令
        return {"written": target, "value": payload.body}

AdapterRegistry.register(MyModbusAdapter())
```

必须实现：

- `ingest(raw) → Payload` — 外部事件进入 fangyu
- `emit(payload, target) → dict` — fangyu 指令回到外部
- 可选 `health() → dict` — 健康检查

---

## 4. 内置模拟 Adapter（参考实现）

| 名称 | 模块 | 说明 |
|------|------|------|
| `mqtt_sim` | `adapters/mqtt_sim.py` | 内存 MQTT topic 总线 |
| `mqtt` | `adapters/mqtt_client.py` | **真实 MQTT broker**（需 `pip install fangyu[mqtt]`） |
| `opcua_sim` | `adapters/opcua_sim.py` | 内存 OPC-UA 节点 |
| `plc_sim` | `adapters/plc_sim.py` | 产线 PLC 寄存器 + 告警 |

启动平台后自动注册（`ensure_default_adapters()`）。

---

## 5. HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/adapters` | 列出 Adapter |
| GET | `/api/v1/adapters/{name}/health` | 健康状态 |
| POST | `/api/v1/adapters/ingest` | `{adapter, raw}` → Payload |
| POST | `/api/v1/adapters/emit` | `{adapter, target, body}` → 外部写入 |
| POST | `/api/v1/adapters/plc/register_worker` | 注册产线 Worker |
| POST | `/api/v1/adapters/plc/dispatch` | PLC 事件 → Worker → 可选 PLC 回调 |
| POST | `/api/v1/adapters/mqtt/dispatch` | MQTT 事件 → Worker |

### 产线 Demo

```powershell
py -3 -m fangyu --server
py -3 scripts/plc_demo.py
```

流程：温度 35°C → Worker 输出 `OK:…`；温度 95°C → Worker 输出 `ALARM:…` → PLC 自动 `motor_speed=0`。

---

## 6. 与 Agent Bundle 集成

Bundle `config/interfaces.json` 可扩展：

```json
{
  "adapters": ["mqtt_sim", "plc_sim"],
  "trust_policy": { "require_envelope": true }
}
```

Worker Agent skill 通过 `industrial_event` 输入接收 Adapter 事件（见 `routers/adapters.py` 中 `_industrial_worker_flow`）。

---

## 7. 测试

```powershell
py -3 -m pytest tests/unit/test_payload.py tests/unit/test_adapters.py tests/integration/test_plc_demo.py -v
```

---

*版本：Phase 4 v1 — 接口 + 模拟实现，真实 MQTT/OPC-UA 客户端可作为独立 Adapter 插件接入。*
