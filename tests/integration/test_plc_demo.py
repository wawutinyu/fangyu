"""产线 PLC → Worker Agent 端到端测试"""
from fastapi.testclient import TestClient

from fangyu.adapters import AdapterRegistry, ensure_default_adapters
from fangyu.engine.a2a_runtime import AgentRegistry
from fangyu.server import app


def test_plc_dispatch_api():
    ensure_default_adapters()
    for item in AgentRegistry.list_agents():
        AgentRegistry.unregister(item["name"])

    client = TestClient(app)
    reg = client.post("/api/v1/adapters/plc/register_worker", json={"name": "LineWorker"})
    assert reg.status_code == 200

    # 正常温度
    normal = client.post("/api/v1/adapters/plc/dispatch", json={
        "agent_name": "LineWorker",
        "tag": "temperature",
        "value": 35.0,
    })
    assert normal.status_code == 200
    body = normal.json()
    assert body["success"] is True
    assert "OK:temperature" in body["worker_output"]
    assert body["plc_command"] is None

    # 触发告警 → worker 输出 ALARM → PLC 自动降速
    alarm = client.post("/api/v1/adapters/plc/dispatch", json={
        "agent_name": "LineWorker",
        "tag": "temperature",
        "value": 95.0,
    })
    assert alarm.status_code == 200
    ab = alarm.json()
    assert ab["success"] is True
    assert "ALARM" in ab["worker_output"]
    assert ab["plc_command"] is not None
    assert AdapterRegistry.get("plc_sim").registers["motor_speed"]["value"] == 0
