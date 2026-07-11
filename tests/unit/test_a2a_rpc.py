"""A2A JSON-RPC 端点测试"""
import json

import pytest
from fastapi.testclient import TestClient

from fangyu.server import app
from fangyu.engine.a2a_runtime import AgentRegistry


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clean_agents():
    for name in list(AgentRegistry.list_agents()):
        AgentRegistry.unregister(name["name"])
    yield


def test_rpc_list_agents_empty(client):
    resp = client.post("/api/v1/a2a/rpc", json={
        "jsonrpc": "2.0", "method": "a2a.list_agents", "params": {}, "id": 1,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"] == []


def test_rpc_send_and_get_task(client):
    AgentRegistry.register("Echo", {"name": "Echo", "version": "1.0.0"}, {})
    resp = client.post("/api/v1/a2a/rpc", json={
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": "Echo",
            "message": {"role": "user", "parts": [{"type": "text", "text": "hi"}]},
        },
        "id": 2,
    })
    assert resp.status_code == 200
    task = resp.json()["result"]
    assert task["id"]

    get_resp = client.post("/api/v1/a2a/rpc", json={
        "jsonrpc": "2.0",
        "method": "a2a.get_task",
        "params": {"taskId": task["id"]},
        "id": 3,
    })
    assert get_resp.json()["result"]["id"] == task["id"]


def test_rpc_unknown_method(client):
    resp = client.post("/api/v1/a2a/rpc", json={
        "jsonrpc": "2.0", "method": "a2a.nope", "params": {}, "id": 4,
    })
    assert resp.status_code == 200
    assert resp.json()["error"]["code"] == -32601
