"""方隅·观 — Presence / 协作事件测试。"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core.collaboration import (
    emit_event,
    list_events,
    reset_collaboration,
    snapshot,
    build_presence,
    build_edges,
)
from fangyu.core.collaboration_store import close_connection as close_collab
from fangyu.core.worker_registry import reset_registry, register_worker, enqueue_task, complete_task
from fangyu.core.worker_store import close_connection
from fangyu.server import app


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
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


@pytest.fixture()
def isolated_workers(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("FANGYU_WORKER_DB", path)
    reset_registry()
    yield
    reset_registry()
    close_connection()
    Path(path).unlink(missing_ok=True)


def test_emit_and_list_events():
    emit_event("a2a.send", actor="user", target="agent_1", message="hi")
    emit_event("constitution.warn", actor="system", message="warn", severity="warn")
    events = list_events(limit=10)
    assert len(events) >= 2
    assert events[0]["ts"] >= events[1]["ts"]
    filtered = list_events(kinds=["a2a.send"])
    assert all(e["kind"] == "a2a.send" for e in filtered)


def test_persist_survives_memory_clear():
    emit_event("persist.ping", actor="a", target="b", message="keep")
    from fangyu.core import collaboration as collab
    with collab._lock:
        collab._events.clear()
    events = list_events(kinds=["persist.ping"])
    assert len(events) >= 1
    assert events[0]["message"] == "keep"


def test_build_edges():
    emit_event("a2a.send", actor="router", target="search", message="1")
    emit_event("a2a.send", actor="router", target="search", message="2")
    emit_event("a2a.complete", actor="search", target="summarizer", message="3")
    edges = build_edges(limit=10)
    assert any(e["source"] == "router" and e["target"] == "search" and e["count"] >= 2 for e in edges)
    assert any(e["source"] == "search" and e["target"] == "summarizer" for e in edges)


def test_snapshot_includes_edges(isolated_workers):
    register_worker(name="gw", hostname="h", os_name="win32")
    emit_event("a2a.send", actor="user", target="agent_x", message="go")
    snap = snapshot(event_limit=20)
    assert "edges" in snap
    assert snap["summary"]["edges"] >= 1
    assert any(e["source"] == "user" for e in snap["edges"])


def test_snapshot_summary(isolated_workers):
    w = register_worker(name="gw2", hostname="h", os_name="win32")
    emit_event("worker.task_enqueued", actor="gw2", message="shell")
    snap = snapshot(event_limit=20)
    assert snap["summary"]["workers"] >= 1
    assert snap["summary"]["workers_online"] >= 1
    assert any(p["id"] == f"worker:{w['id']}" for p in snap["presence"])
    assert snap["events"]


def test_worker_hooks_emit(isolated_workers):
    w = register_worker(name="hook-w", hostname="h", os_name="win32")
    task = enqueue_task(task_type="shell", payload={"command": "echo x"}, worker_id=w["id"])
    complete_task(task["id"], worker_id=w["id"], status="done", result={"stdout": "x"})
    kinds = {e["kind"] for e in list_events(limit=50)}
    assert "worker.register" in kinds
    assert "worker.task_enqueued" in kinds
    assert "worker.task_done" in kinds


def test_audit_fanout_to_presence():
    from fangyu.core.constitution import audit_event

    audit_event("constitution_violation", {"agent": "a1", "error": "denied"})
    events = list_events(kinds=["constitution.deny"])
    assert events
    assert events[0]["severity"] == "deny"


def test_router_snapshot(client, isolated_workers):
    register_worker(name="api-w", hostname="h", os_name="win32")
    emit_event("test.ping", actor="t", target="u", message="ping")
    resp = client.get("/api/v1/presence")
    assert resp.status_code == 200
    data = resp.json()
    assert "presence" in data
    assert "events" in data
    assert "edges" in data
    assert "summary" in data


def test_router_post_event(client):
    resp = client.post("/api/v1/presence/events", json={
        "kind": "manual.note",
        "actor": "tester",
        "target": "field",
        "message": "hello field",
    })
    assert resp.status_code == 200
    assert resp.json()["event"]["kind"] == "manual.note"
    listed = client.get("/api/v1/presence/events?kind=manual.note")
    assert listed.status_code == 200
    assert len(listed.json()["events"]) >= 1


def test_build_presence_empty_ok():
    entities = build_presence()
    assert isinstance(entities, list)
