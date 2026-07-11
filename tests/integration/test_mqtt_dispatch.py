"""MQTT dispatch API 测试"""
import pytest
from fastapi.testclient import TestClient

from fangyu.adapters import AdapterRegistry, ensure_default_adapters
from fangyu.server import app


@pytest.fixture(autouse=True)
def _adapters():
    AdapterRegistry.clear()
    ensure_default_adapters()
    yield
    AdapterRegistry.clear()


@pytest.fixture()
def client():
    return TestClient(app)


def test_mqtt_dispatch_sim(client):
    client.post("/api/v1/adapters/plc/register_worker", json={"name": "MqttWorker"})
    resp = client.post("/api/v1/adapters/mqtt/dispatch", json={
        "agent_name": "MqttWorker",
        "topic": "plc/line1/temperature",
        "payload": {"value": 95.0, "unit": "C", "alarm": True},
        "use_sim": True,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "ALARM" in body["worker_output"]
