"""方隅·行 Worker 持久化与事件"""
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core.worker_store import close_connection, get_connection, get_task_db
from fangyu.core.worker_registry import reset_registry
from fangyu.server import app


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_worker_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("FANGYU_WORKER_DB", path)
    reset_registry()
    yield
    reset_registry()
    close_connection()
    Path(path).unlink(missing_ok=True)


def test_register_and_list(client):
    reg = client.post("/api/v1/workers/register", json={
        "name": "dev-worker",
        "hostname": "localhost",
        "os": "win32",
    })
    assert reg.status_code == 200
    worker_id = reg.json()["worker"]["id"]

    listed = client.get("/api/v1/workers")
    assert listed.status_code == 200
    workers = listed.json()["workers"]
    assert len(workers) == 1
    assert workers[0]["id"] == worker_id
    assert workers[0]["online"] is True


def test_enqueue_poll_complete_shell(client):
    reg = client.post("/api/v1/workers/register", json={"name": "w1", "hostname": "h", "os": "win32"})
    worker_id = reg.json()["worker"]["id"]

    created = client.post("/api/v1/workers/tasks", json={
        "type": "shell",
        "payload": {"command": "echo hello"},
    })
    assert created.status_code == 200
    task_id = created.json()["task_id"]

    polled = client.get("/api/v1/workers/tasks/poll", params={"worker_id": worker_id})
    assert polled.status_code == 200
    task = polled.json()["task"]
    assert task["id"] == task_id
    assert task["type"] == "shell"

    done = client.post(f"/api/v1/workers/tasks/{task_id}/complete", json={
        "worker_id": worker_id,
        "status": "done",
        "result": {"stdout": "hello\n", "stderr": "", "exitCode": 0},
    })
    assert done.status_code == 200
    assert done.json()["task"]["status"] == "done"

    events = client.get(f"/api/v1/workers/tasks/{task_id}/events")
    assert events.status_code == 200
    assert len(events.json()["events"]) >= 3


def test_task_persistence_survives_reconnect(client):
    reg = client.post("/api/v1/workers/register", json={"name": "w2", "hostname": "h", "os": "linux"})
    worker_id = reg.json()["worker"]["id"]

    created = client.post("/api/v1/workers/tasks", json={
        "type": "run_flow",
        "worker_id": worker_id,
        "payload": {"nodes": [], "edges": []},
    })
    task_id = created.json()["task_id"]

    close_connection()
    get_connection()

    task = get_task_db(task_id)
    assert task is not None
    assert task["status"] == "pending"
    assert task["type"] == "run_flow"


def test_worker_reregister_reuses_identity(client):
    reg1 = client.post("/api/v1/workers/register", json={
        "name": "same", "hostname": "host-a", "os": "win32",
    })
    wid = reg1.json()["worker"]["id"]

    reg2 = client.post("/api/v1/workers/register", json={
        "name": "same", "hostname": "host-a", "os": "win32",
    })
    assert reg2.json()["worker"]["id"] == wid

    reg3 = client.post("/api/v1/workers/register", json={
        "name": "same", "hostname": "host-a", "os": "win32",
        "worker_id": wid,
    })
    assert reg3.json()["worker"]["id"] == wid


def test_enqueue_by_worker_name(client):
    reg = client.post("/api/v1/workers/register", json={
        "name": "lab-pc", "hostname": "host-b", "os": "win32",
    })
    worker_id = reg.json()["worker"]["id"]

    created = client.post("/api/v1/workers/tasks", json={
        "type": "run_flow",
        "worker_name": "lab-pc",
        "payload": {"nodes": [], "edges": []},
    })
    assert created.status_code == 200
    body = created.json()
    assert body["assigned_worker_id"] == worker_id
    assert body["assigned_worker_name"] == "lab-pc"

    polled = client.get("/api/v1/workers/tasks/poll", params={"worker_id": worker_id})
    assert polled.json()["task"]["id"] == body["task_id"]


def test_enqueue_by_unknown_worker_name(client):
    resp = client.post("/api/v1/workers/tasks", json={
        "type": "shell",
        "worker_name": "missing-worker",
        "payload": {"command": "echo hi"},
    })
    assert resp.status_code == 404


def test_worker_append_task_event(client):
    reg = client.post("/api/v1/workers/register", json={"name": "w3", "hostname": "h", "os": "win32"})
    worker_id = reg.json()["worker"]["id"]

    created = client.post("/api/v1/workers/tasks", json={
        "type": "shell",
        "worker_id": worker_id,
        "payload": {"command": "echo hi"},
    })
    task_id = created.json()["task_id"]
    client.get("/api/v1/workers/tasks/poll", params={"worker_id": worker_id})

    appended = client.post(f"/api/v1/workers/tasks/{task_id}/events", json={
        "worker_id": worker_id,
        "event_type": "shell_start",
        "message": "echo hi",
    })
    assert appended.status_code == 200
    events = client.get(f"/api/v1/workers/tasks/{task_id}/events").json()["events"]
    assert any(e["event_type"] == "shell_start" for e in events)


def test_enqueue_read_file_task(client):
    created = client.post("/api/v1/workers/tasks", json={
        "type": "read_file",
        "payload": {"path": "README.md"},
    })
    assert created.status_code == 200
    assert created.json()["status"] == "pending"


def test_enqueue_adapter_invoke_task(client):
    created = client.post("/api/v1/workers/tasks", json={
        "type": "adapter_invoke",
        "payload": {"action": "ingest", "adapter": "mqtt_sim", "raw": {"topic": "t", "payload": {"v": 1}}},
    })
    assert created.status_code == 200
    assert created.json()["status"] == "pending"
