"""G2-D 托管管理器：启停 / 健康 / 日志。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.agent_factory import build_from_profile
from fangyu.engine import managed_host as mh


@pytest.fixture()
def managed_env(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    config_mod.set_data_dir(data)
    mh.reset_registry_for_tests()
    yield data
    # 清理残留进程
    for inst in mh.list_instances():
        try:
            mh.stop_instance(inst["id"])
        except Exception:
            pass
    mh.reset_registry_for_tests()


def test_start_stop_status_logs(managed_env, tmp_path):
    bundle = build_from_profile("action", tmp_path / "agent", name="ManagedAgent", a2a_port=0)
    inst = mh.start_instance(bundle, name="test-managed", port=0, wait=True, timeout_sec=30)
    assert inst.get("alive") is True
    assert inst.get("status") == "running"
    assert (bundle / "config" / "managed.json").is_file()
    assert inst.get("health", {}).get("status") == "ok"

    st = mh.get_instance(inst["id"])
    assert st and st["alive"]

    logs = mh.read_logs(inst["id"], tail=20)
    assert logs["id"] == inst["id"]
    assert isinstance(logs["lines"], list)

    stopped = mh.stop_instance(inst["id"])
    assert stopped.get("alive") is False
    assert stopped.get("status") == "stopped"


def test_managed_api(managed_env, tmp_path):
    from fangyu.server import app

    bundle = build_from_profile("action", tmp_path / "agent2", name="APIManaged")
    client = TestClient(app)
    r = client.post("/api/v1/managed/instances", json={
        "bundle_dir": str(bundle),
        "name": "api-m",
        "port": None,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    iid = body["id"]
    assert body.get("alive") is True

    listed = client.get("/api/v1/managed/instances")
    assert listed.status_code == 200
    assert any(i["id"] == iid for i in listed.json()["instances"])

    logs = client.get(f"/api/v1/managed/instances/{iid}/logs?tail=10")
    assert logs.status_code == 200

    stop = client.post(f"/api/v1/managed/instances/{iid}/stop")
    assert stop.status_code == 200
    assert stop.json().get("alive") is False

    rm = client.delete(f"/api/v1/managed/instances/{iid}")
    assert rm.status_code == 200
