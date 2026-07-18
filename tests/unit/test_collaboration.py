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


def test_build_presence_reads_agent_department(monkeypatch):
    """真实 Agent card.metadata.department → Presence 分宅字段。"""
    from fangyu.engine.a2a_runtime import AgentRegistry

    AgentRegistry.register(
        "dept_agent_x",
        {
            "name": "研判员",
            "metadata": {
                "department": "研判部",
                "department_id": "dept-judge",
                "canvas_id": "node-judge-1",
            },
            "skills": [{"id": "default", "name": "default"}],
        },
        {"default": {"nodes": [], "edges": []}},
    )
    entities = build_presence()
    hit = next(e for e in entities if e.get("name") == "dept_agent_x")
    assert hit["department"] == "研判部"
    assert hit["department_id"] == "dept-judge"
    assert hit["canvas_id"] == "node-judge-1"

    snap = snapshot(event_limit=20)
    deps = snap.get("departments") or []
    assert any(d.get("id") == "dept-judge" for d in deps)


def test_build_presence_attaches_factory_health():
    """remote_host.meta.health → Presence 实体 health。"""
    from fangyu.core.remote_hosts import clear_remote_hosts, upsert_remote_host

    clear_remote_hosts()
    upsert_remote_host(
        host_id="factory:east",
        label="东厂",
        base_url="http://127.0.0.1:18789",
        role="factory",
        meta={"factory_id": "east", "health": {"score": 88, "grade": "A"}},
    )
    entities = build_presence()
    hit = next(e for e in entities if e.get("id") == "host:factory:east")
    assert hit["role"] == "factory"
    assert hit["health"]["score"] == 88
    assert hit["health"]["grade"] == "A"
    clear_remote_hosts()


def _sample_replay_pack(**overrides):
    pack = {
        "format": "fangyu.guan.replay",
        "version": 1,
        "exported_at": "2026-07-18T12:00:00Z",
        "summary": {"agents": 1, "agents_busy": 0, "workers": 0, "workers_online": 0, "events": 2},
        "departments": [{"id": "dept-a", "name": "甲部", "houses": [{"id": "h1", "name": "东宅"}]}],
        "presence": [
            {
                "id": "agent:alpha",
                "kind": "agent",
                "name": "alpha",
                "label": "甲",
                "status": "idle",
                "department": "甲部",
                "department_id": "dept-a",
            },
        ],
        "events": [
            {
                "id": "e1",
                "ts": 1000.0,
                "kind": "a2a.send",
                "actor": "alpha",
                "target": "beta",
                "message": "hello",
                "detail": {},
                "severity": "info",
            },
            {
                "id": "e2",
                "ts": 1001.0,
                "kind": "a2a.complete",
                "actor": "beta",
                "target": "alpha",
                "message": "done",
                "detail": {},
                "severity": "info",
            },
        ],
    }
    pack.update(overrides)
    return pack


def test_validate_replay_pack_ok():
    from fangyu.core.collaboration import validate_replay_pack, pack_to_snapshot

    pack = validate_replay_pack(_sample_replay_pack())
    assert pack["format"] == "fangyu.guan.replay"
    assert len(pack["events"]) == 2
    snap = pack_to_snapshot(pack)
    assert len(snap["events"]) == 2
    assert snap["events"][0]["ts"] >= snap["events"][1]["ts"]
    assert any(p["name"] == "alpha" for p in snap["presence"])
    assert snap["summary"]["events"] == 2


def test_validate_replay_pack_rejects_bad_format():
    from fangyu.core.collaboration import validate_replay_pack

    with pytest.raises(ValueError, match="format"):
        validate_replay_pack({"format": "other", "events": []})
    with pytest.raises(ValueError, match="events"):
        validate_replay_pack({"format": "fangyu.guan.replay", "events": "nope"})


def test_replay_store_save_list_load_delete():
    from fangyu.core.collaboration import validate_replay_pack, pack_to_snapshot
    from fangyu.core.collaboration_store import (
        save_replay,
        list_replays,
        get_replay,
        delete_replay,
    )

    pack = validate_replay_pack(_sample_replay_pack())
    meta = save_replay(title="单元测回放", pack=pack)
    assert meta["id"].startswith("replay-")
    assert meta["event_count"] == 2
    assert meta["department_count"] == 1

    listed = list_replays(limit=10)
    assert any(r["id"] == meta["id"] for r in listed)

    row = get_replay(meta["id"])
    assert row is not None
    assert row["title"] == "单元测回放"
    snap = pack_to_snapshot(row["pack"])
    assert len(snap["events"]) == 2

    assert delete_replay(meta["id"]) is True
    assert get_replay(meta["id"]) is None
    assert delete_replay(meta["id"]) is False


def test_router_replay_import_save_load(client):
    pack = _sample_replay_pack()

    bad = client.post("/api/v1/presence/replays/import", json={"title": "x", "pack": {"format": "nope", "events": []}})
    assert bad.status_code == 422

    imp = client.post(
        "/api/v1/presence/replays/import",
        json={"title": "导入测", "pack": pack},
    )
    assert imp.status_code == 200
    body = imp.json()
    assert body["ok"] is True
    rid = body["replay"]["id"]
    assert body["snapshot"]["summary"]["events"] == 2
    assert len(body["snapshot"]["events"]) == 2

    listed = client.get("/api/v1/presence/replays")
    assert listed.status_code == 200
    assert any(r["id"] == rid for r in listed.json()["replays"])

    loaded = client.post(f"/api/v1/presence/replays/{rid}/load")
    assert loaded.status_code == 200
    assert loaded.json()["replay"]["title"] == "导入测"
    assert len(loaded.json()["snapshot"]["presence"]) >= 1

    saved = client.post(
        "/api/v1/presence/replays",
        json={"title": "再存一份", "pack": pack},
    )
    assert saved.status_code == 200
    rid2 = saved.json()["replay"]["id"]

    deleted = client.delete(f"/api/v1/presence/replays/{rid}")
    assert deleted.status_code == 200
    assert client.post(f"/api/v1/presence/replays/{rid}/load").status_code == 404

    assert client.delete(f"/api/v1/presence/replays/{rid2}").status_code == 200
