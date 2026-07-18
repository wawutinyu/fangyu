"""Setup Copilot + Presence SSE 测试。"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core.collaboration import emit_event, reset_collaboration, subscribe_events, unsubscribe_events
from fangyu.core.collaboration_store import close_connection as close_collab
from fangyu.core.setup_copilot import build_trust_preview
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".collab.db")
    os.close(fd)
    monkeypatch.setenv("FANGYU_COLLAB_DB", path)
    reset_collaboration()
    yield
    reset_collaboration()
    close_collab()
    Path(path).unlink(missing_ok=True)


@pytest.fixture()
def client():
    return TestClient(app)


def test_build_trust_preview_risks():
    preview = build_trust_preview(
        rpc_url="http://example.com/rpc",
        card={"name": "Remote", "description": "demo", "skills": []},
        identity={},
    )
    assert "Remote" in preview["plain"]
    assert preview["risks"]
    assert preview["recommended_authorized"] is False


def test_subscribe_receives_emit():
    q = subscribe_events()
    try:
        emit_event("sse.ping", actor="t", message="hi")
        entry = q.get(timeout=1)
        assert entry["kind"] == "sse.ping"
    finally:
        unsubscribe_events(q)


def test_presence_stream_route_wired():
    from fangyu.routers import presence as presence_router

    paths = {r.path for r in presence_router.router.routes}
    assert "/api/v1/presence/stream" in paths


def test_presence_snapshot_http(client):
    resp = client.get("/api/v1/presence")
    assert resp.status_code == 200
    body = resp.json()
    assert "presence" in body
    assert "events" in body
    assert "summary" in body


def test_setup_copilot_preview_invalid(client):
    resp = client.post("/api/v1/setup/copilot/preview", json={"rpc_url": "http://127.0.0.1:1"})
    # discovery should fail against closed port
    assert resp.status_code in (400, 500)


def test_setup_copilot_preview_happy(client, monkeypatch):
    monkeypatch.setattr(
        "fangyu.engine.a2a_remote.fetch_remote_card",
        lambda _url: {
            "name": "NightBot",
            "description": "overnight agent",
            "skills": [{"name": "echo"}],
        },
    )
    monkeypatch.setattr(
        "fangyu.engine.a2a_remote.fetch_remote_identity",
        lambda _url: {"agent_id": "night-1", "public_key": "pk", "require_envelope": True},
    )
    resp = client.post(
        "/api/v1/setup/copilot/preview",
        json={"rpc_url": "http://example.com/rpc"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["preview"]["name"] == "NightBot"
    assert body["preview"]["recommended_authorized"] is False
    assert "NightBot" in body["preview"]["plain"]
    assert body["discover"]["card"]["name"] == "NightBot"


def test_worker_preview_from_description(client):
    resp = client.post(
        "/api/v1/setup/worker/preview",
        json={"description": "产线巡检助手，能跑 shell"},
    )
    assert resp.status_code == 200
    preview = resp.json()["preview"]
    assert "产线巡检" in preview["name"] or "巡检" in preview["name"]
    assert "FANGYU_WORKER_NAME" in preview["install_cmd"]
    assert "shell" in preview["capabilities"]
    assert preview["confirm_prompt"]
    assert preview["risks"]


def test_build_worker_preview_unit():
    from fangyu.core.setup_worker import build_worker_preview

    p = build_worker_preview("本机执行助手")
    assert p["name"]
    assert "dev-worker" in p["install_cmd"]
