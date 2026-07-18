"""平台 A2A 信封：强制开关 + 平台签名。"""
import json

import pytest
from fastapi.testclient import TestClient

from fangyu.core.config import settings
from fangyu.core.platform_identity import PLATFORM_AGENT_ID, ensure_platform_identity
from fangyu.engine.a2a_runtime import AgentRegistry
from fangyu.server import app


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clean_agents():
    for name in list(AgentRegistry.list_agents()):
        AgentRegistry.unregister(name["name"])
    yield


def _sign(client: TestClient, body: dict) -> str:
    payload = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    resp = client.post("/api/v1/trust/platform/sign", json={"payload": payload})
    assert resp.status_code == 200
    return json.dumps(resp.json()["envelope"], separators=(",", ":"))


def test_platform_public_identity(client):
    ensure_platform_identity()
    resp = client.get("/api/v1/trust/platform")
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_id"] == PLATFORM_AGENT_ID
    assert body["public_key"]


def test_send_unsigned_ok_when_not_required(client, monkeypatch):
    monkeypatch.setattr(settings, "PLATFORM_REQUIRE_ENVELOPE", False)
    AgentRegistry.register("Echo", {"name": "Echo", "version": "1.0.0"}, {})
    body = {
        "target_agent": "Echo",
        "message": {"role": "user", "parts": [{"type": "text", "text": "hi"}]},
        "task_id": "",
    }
    resp = client.post("/api/v1/a2a/send", json=body)
    assert resp.status_code == 200
    assert resp.json().get("id")


def test_send_unsigned_rejected_when_required(client, monkeypatch):
    monkeypatch.setattr(settings, "PLATFORM_REQUIRE_ENVELOPE", True)
    AgentRegistry.register("Echo", {"name": "Echo", "version": "1.0.0"}, {})
    body = {
        "target_agent": "Echo",
        "message": {"role": "user", "parts": [{"type": "text", "text": "hi"}]},
        "task_id": "",
    }
    resp = client.post("/api/v1/a2a/send", json=body)
    assert resp.status_code == 403


def test_send_signed_ok_when_required(client, monkeypatch):
    monkeypatch.setattr(settings, "PLATFORM_REQUIRE_ENVELOPE", True)
    AgentRegistry.register("Echo", {"name": "Echo", "version": "1.0.0"}, {})
    body = {
        "target_agent": "Echo",
        "message": {"role": "user", "parts": [{"type": "text", "text": "hi"}]},
        "task_id": "",
    }
    # 与前端一致：用同一字符串作为 body
    raw = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    env = _sign(client, body)
    resp = client.post(
        "/api/v1/a2a/send",
        content=raw,
        headers={"Content-Type": "application/json", "X-A2A-Envelope": env},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json().get("id")
