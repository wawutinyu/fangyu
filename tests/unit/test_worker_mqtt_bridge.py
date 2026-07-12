"""Worker MQTT bridge tests"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core.worker_mqtt_bridge import get_worker_mqtt_bridge, reset_worker_mqtt_bridge_for_tests
from fangyu.core.worker_registry import reset_registry
from fangyu.core.worker_store import close_connection
from fangyu.server import app


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    fd_path = tmp_path / "workers.db"
    monkeypatch.setenv("FANGYU_WORKER_DB", str(fd_path))
    reset_registry()
    reset_worker_mqtt_bridge_for_tests()
    yield
    reset_worker_mqtt_bridge_for_tests()
    reset_registry()
    close_connection()


def test_mqtt_fire_enqueues_task(client):
    reg = client.post("/api/v1/workers/register", json={"name": "w", "hostname": "h", "os": "win32"})
    worker_id = reg.json()["worker"]["id"]

    fired = client.post("/api/v1/workers/triggers/mqtt/fire", json={
        "topic": "fangyu/line1/event",
        "payload": {"value": 1},
    })
    assert fired.status_code == 200
    body = fired.json()
    assert body.get("task") or body.get("mode")

    polled = client.get("/api/v1/workers/tasks/poll", params={"worker_id": worker_id})
    task = polled.json().get("task")
    assert task is not None
    assert task["type"] in ("adapter_invoke", "run_flow")


def test_mqtt_trigger_with_config(client, tmp_path, monkeypatch):
    cfg = tmp_path / "mqtt.json"
    cfg.write_text(json.dumps({
        "enabled": True,
        "triggers": [{
            "topic": "fangyu/custom",
            "task_type": "adapter_invoke",
            "adapter": "mqtt_sim",
        }],
    }), encoding="utf-8")

    bridge = get_worker_mqtt_bridge()
    bridge._config_path = cfg
    status = bridge.start(cfg)
    assert status["started"] is True

    client.post("/api/v1/workers/register", json={"name": "w2", "hostname": "h", "os": "win32"})
    result = bridge.fire_sim("fangyu/custom", {"temp": 30})
    assert result.get("task")
