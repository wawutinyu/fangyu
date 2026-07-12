"""观 × 行 × A2A 轻量集成：事件进入 Presence 时间线与协作边。"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core.collaboration import list_events, reset_collaboration, snapshot
from fangyu.core.collaboration_store import close_connection as close_collab
from fangyu.core.worker_registry import reset_registry, register_worker, enqueue_task, complete_task
from fangyu.core.worker_store import close_connection
from fangyu.engine.a2a_runtime import AgentRegistry, AgentBus
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(monkeypatch):
    fd1, p1 = tempfile.mkstemp(suffix=".collab.db")
    os.close(fd1)
    fd2, p2 = tempfile.mkstemp(suffix=".w.db")
    os.close(fd2)
    monkeypatch.setenv("FANGYU_COLLAB_DB", p1)
    monkeypatch.setenv("FANGYU_WORKER_DB", p2)
    reset_collaboration()
    reset_registry()
    # clear in-memory agents/tasks lightly by re-registering unique names
    yield
    reset_collaboration()
    reset_registry()
    close_collab()
    close_connection()
    Path(p1).unlink(missing_ok=True)
    Path(p2).unlink(missing_ok=True)


@pytest.fixture()
def client():
    return TestClient(app)


def test_worker_and_a2a_appear_in_presence(client):
    w = register_worker(name="integ-w", hostname="h", os_name="win32")
    task = enqueue_task(task_type="shell", payload={"command": "echo hi"}, worker_id=w["id"])
    complete_task(task["id"], worker_id=w["id"], status="done", result={"stdout": "hi"})

    AgentRegistry.register(
        "integ_agent",
        {"name": "integ_agent", "skills": [{"id": "default", "name": "default"}]},
        {"default": {"nodes": [], "edges": []}},
    )
    bus = AgentBus(enable_trust=False)
    bus.send_message(
        "integ_agent",
        {"role": "user", "parts": [{"type": "text", "text": "hello"}], "metadata": {"skill_id": "default"}},
        source="integ_user",
    )

    snap = snapshot(event_limit=100)
    kinds = {e["kind"] for e in snap["events"]}
    assert "worker.task_done" in kinds or "worker.task_enqueued" in kinds
    assert "a2a.send" in kinds or "a2a.complete" in kinds
    assert any(p["kind"] == "worker" and p["online"] for p in snap["presence"])
    assert any(p["name"] == "integ_agent" for p in snap["presence"] if p["kind"] == "agent")
    assert snap["edges"] is not None

    api = client.get("/api/v1/presence")
    assert api.status_code == 200
    assert api.json()["summary"]["workers_online"] >= 1
