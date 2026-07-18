"""内置跨机 Presence 回放样例。"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.presence_samples import list_sample_meta, load_sample_pack, load_sample_snapshot


@pytest.fixture()
def restore_data_dir(tmp_path):
    prev = Path(config_mod.DATA_DIR)
    config_mod.set_data_dir(tmp_path / "data")
    yield
    config_mod.set_data_dir(prev)


def test_list_and_load_cross_host_sample():
    metas = list_sample_meta()
    assert any(m["id"] == "cross-host" for m in metas)
    pack = load_sample_pack("cross-host")
    assert pack["format"] == "fangyu.guan.replay"
    kinds = {e["kind"] for e in pack["events"]}
    assert "host.heartbeat" in kinds
    assert "host.offline" in kinds
    assert "managed.start" in kinds
    snap = load_sample_snapshot("cross-host")
    assert len(snap["events"]) >= 6
    assert any(p.get("kind") == "host" for p in snap["presence"])


def test_load_sample_by_stem():
    pack = load_sample_pack("cross_host")
    assert len(pack["events"]) >= 6


def test_presence_sample_routes(restore_data_dir):
    from fangyu.server import app

    client = TestClient(app)
    listed = client.get("/api/v1/presence/replays/samples")
    assert listed.status_code == 200
    samples = listed.json()["samples"]
    assert any(s["id"] == "cross-host" for s in samples)

    loaded = client.post("/api/v1/presence/replays/samples/cross-host/load")
    assert loaded.status_code == 200
    body = loaded.json()
    assert body["ok"] is True
    assert body["replay"]["id"].startswith("replay-")
    assert any(e["kind"] == "host.heartbeat" for e in body["snapshot"]["events"])

    bad = client.post("/api/v1/presence/replays/samples/no-such/load")
    assert bad.status_code == 404
