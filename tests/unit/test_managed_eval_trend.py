"""托管升级 + Eval 趋势。"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.factory_eval import (
    compare_eval_reports,
    eval_trend,
    load_eval_history,
    write_eval_report,
)
from fangyu.engine import managed_host as mh
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    config_mod.set_data_dir(tmp_path / "data")
    mh.reset_registry_for_tests()
    yield
    mh.reset_registry_for_tests()


def test_eval_history_and_trend(tmp_path):
    data = tmp_path / "data"
    write_eval_report(
        {"exit_code": 0, "ok": True, "stages": {"unit": {"ok": True}}},
        data_dir=data,
        also_workspace=False,
    )
    write_eval_report(
        {"exit_code": 1, "ok": False, "stages": {"unit": {"ok": False}, "card": {"ok": True}}},
        data_dir=data,
        also_workspace=False,
    )
    write_eval_report(
        {"exit_code": 0, "ok": True, "stages": {"unit": {"ok": True}, "card": {"ok": True}}},
        data_dir=data,
        also_workspace=False,
    )
    hist = load_eval_history(data_dir=data, limit=10)
    assert len(hist) == 3
    assert hist[0]["ok"] is True
    trend = eval_trend(data_dir=data, limit=10)
    assert trend["ok_streak"] >= 1
    assert trend["compare"]["ok"] is True
    assert any(d["stage"] == "unit" for d in trend["compare"].get("stage_diffs") or []) or trend["compare"].get("changed") is not None

    cmp = compare_eval_reports(hist[0], hist[1])
    assert cmp["ok"] is True


def test_eval_trend_api(tmp_path):
    write_eval_report(
        {"exit_code": 0, "ok": True, "stages": {"unit": {"ok": True}}},
        also_workspace=False,
    )
    with TestClient(app) as client:
        r = client.get("/api/v1/monitor/eval-trend?limit=5")
        assert r.status_code == 200
        assert "points" in r.json()
        h = client.get("/api/v1/monitor/eval-history")
        assert h.status_code == 200
        assert h.json()["history"]


def test_upgrade_instance_restarts(monkeypatch, tmp_path):
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    (bundle / "manifest.json").write_text("{}", encoding="utf-8")

    # seed registry with fake stopped instance
    reg = {
        "version": 1,
        "instances": {
            "m_old": {
                "id": "m_old",
                "name": "Demo",
                "bundle_dir": str(bundle),
                "host": "127.0.0.1",
                "port": 19099,
                "pid": 0,
                "status": "stopped",
            }
        },
    }
    mh._save_registry(reg)

    started = {
        "id": "m_new",
        "name": "Demo",
        "bundle_dir": str(bundle),
        "host": "127.0.0.1",
        "port": 19099,
        "pid": 1,
        "status": "running",
        "alive": True,
    }

    def fake_start(*a, **k):
        r = mh._load_registry()
        r["instances"]["m_new"] = {**started, "pid": 1}
        mh._save_registry(r)
        return dict(started)

    monkeypatch.setattr(mh, "start_instance", fake_start)
    monkeypatch.setattr(mh, "stop_instance", lambda *a, **k: {"id": "m_old", "alive": False})
    monkeypatch.setattr(mh, "_pid_alive", lambda pid: False)
    monkeypatch.setattr(mh, "probe_health", lambda *a, **k: {"status": "ok"})

    out = mh.upgrade_instance("m_old")
    assert out["upgrade"] is True
    assert out["upgraded_from"] == "m_old"
    assert out["id"] == "m_new"

    with TestClient(app) as client:
        # re-seed
        mh._save_registry(reg)
        monkeypatch.setattr(mh, "upgrade_instance", lambda *a, **k: {**started, "upgrade": True, "upgraded_from": "m_old"})
        r = client.post("/api/v1/managed/instances/m_old/upgrade", json={})
        assert r.status_code == 200
        assert r.json().get("upgrade") is True
