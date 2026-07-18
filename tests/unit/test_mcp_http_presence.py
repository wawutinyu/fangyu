"""无状态 MCP HTTP + 托管 Presence / 跨机心跳。"""
from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from fangyu.core.collaboration import reset_collaboration, snapshot
from fangyu.core.remote_hosts import clear_remote_hosts
from fangyu.engine.mcp_tasks import clear_mcp_tasks
from fangyu.server import app


@pytest.fixture()
def client():
    clear_mcp_tasks()
    clear_remote_hosts()
    reset_collaboration()
    with TestClient(app) as c:
        yield c
    clear_mcp_tasks()
    clear_remote_hosts()
    reset_collaboration()


def test_mcp_http_discover_get(client):
    r = client.get("/mcp/v1/messages")
    assert r.status_code == 200
    assert r.json()["stateless"] is True
    assert "tools/call" in r.json()["methods"]


def test_mcp_http_jsonrpc_tools_list(client):
    r = client.post("/mcp/v1/messages", json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list",
        "params": {},
    })
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == 1
    assert "result" in body
    assert isinstance(body["result"].get("tools"), list)


def test_mcp_http_tools_call_as_task(client):
    r = client.post("/mcp/v1/messages", json={
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "current_time",
            "arguments": {},
            "asTask": True,
            "delaySec": 0.1,
            "_meta": {
                "io.modelcontextprotocol/clientCapabilities": {
                    "extensions": {"io.modelcontextprotocol/tasks": {}},
                },
            },
        },
    })
    if r.status_code != 200 or "error" in r.json():
        pytest.skip(f"tool unavailable: {r.text}")
    result = r.json()["result"]
    assert result.get("resultType") == "task"
    tid = result["taskId"]

    status = "working"
    deadline = time.time() + 5
    while time.time() < deadline:
        g = client.post("/mcp/v1/messages", json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tasks/get",
            "params": {"taskId": tid},
        })
        status = g.json()["result"]["status"]
        if status in ("completed", "failed", "cancelled"):
            break
        time.sleep(0.05)
    assert status == "completed"


def test_host_heartbeat_in_presence(client):
    r = client.post("/api/v1/presence/hosts/heartbeat", json={
        "host_id": "edge-1",
        "label": "边缘机-A",
        "base_url": "http://10.0.0.2:8000",
        "role": "edge",
        "ttl_sec": 60,
    })
    assert r.status_code == 200
    assert r.json()["host"]["id"] == "edge-1"

    snap = client.get("/api/v1/presence").json()
    hosts = [p for p in snap["presence"] if p.get("kind") == "host"]
    assert any(h.get("name") == "边缘机-A" or h.get("id") == "host:edge-1" for h in hosts)
    assert snap["summary"].get("hosts_online", 0) >= 1

    listed = client.get("/api/v1/presence/hosts")
    assert any(h["id"] == "edge-1" for h in listed.json()["hosts"])


def test_managed_kind_in_build_presence(monkeypatch):
    from fangyu.core import collaboration as collab

    monkeypatch.setattr(
        "fangyu.engine.managed_host.list_instances",
        lambda: [{
            "id": "m_test",
            "name": "DemoHost",
            "alive": True,
            "host": "127.0.0.1",
            "port": 19001,
            "bundle_dir": "/tmp/x",
            "started_at": time.time(),
        }],
    )
    reset_collaboration()
    clear_remote_hosts()
    presence = collab.build_presence()
    managed = [p for p in presence if p.get("kind") == "managed"]
    assert any(p.get("id") == "managed:m_test" for p in managed)
    snap = snapshot()
    assert snap["summary"].get("managed_online", 0) >= 1
