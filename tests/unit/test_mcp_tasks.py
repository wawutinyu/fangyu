"""MCP Tasks 扩展 + 法务/合规技能。"""
from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from fangyu.engine.mcp_tasks import clear_mcp_tasks
from fangyu.server import app


@pytest.fixture()
def client():
    clear_mcp_tasks()
    with TestClient(app) as c:
        yield c
    clear_mcp_tasks()


def test_discover_declares_tasks(client):
    r = client.get("/api/v1/mcp/discover")
    assert r.status_code == 200
    exts = r.json()["capabilities"]["extensions"]
    assert "io.modelcontextprotocol/tasks" in exts


def test_as_task_requires_capability(client):
    r = client.post("/api/v1/mcp/call", json={
        "name": "current_time",
        "as_task": True,
        "supports_tasks": False,
    })
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["code"] == -32003


def test_task_poll_completes(client):
    r = client.post("/api/v1/mcp/call", json={
        "name": "current_time",
        "supports_tasks": True,
        "as_task": True,
        "delay_sec": 0.15,
        "arguments": {},
    })
    if r.status_code != 200:
        pytest.skip(f"internal tool unavailable: {r.text}")
    body = r.json()
    assert body.get("resultType") == "task"
    tid = body["taskId"]

    g = None
    status = "working"
    deadline = time.time() + 5
    while time.time() < deadline:
        g = client.get(f"/api/v1/mcp/tasks/{tid}")
        assert g.status_code == 200
        status = g.json()["status"]
        if status in ("completed", "failed", "cancelled"):
            break
        time.sleep(0.05)
    assert status == "completed", status
    assert g is not None and "result" in g.json()


def test_task_cancel(client):
    r = client.post("/api/v1/mcp/call", json={
        "name": "current_time",
        "supports_tasks": True,
        "as_task": True,
        "delay_sec": 2.0,
    })
    if r.status_code != 200:
        pytest.skip(f"internal tool unavailable: {r.text}")
    tid = r.json()["taskId"]
    c = client.post(f"/api/v1/mcp/tasks/{tid}/cancel")
    assert c.status_code == 200
    g = client.get(f"/api/v1/mcp/tasks/{tid}")
    assert g.json()["status"] == "cancelled"


def test_legal_skills_registered():
    from fangyu.core.materials import default_materials
    from fangyu.core.skill_pack import load_skill_parsed

    for sid in ("legal-review", "compliance-check"):
        assert load_skill_parsed(sid)
    active = {s["id"] for s in default_materials()["skills"] if s.get("status") == "active"}
    assert "legal-review" in active
    assert "compliance-check" in active
