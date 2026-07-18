"""Eval 告警进观测 / 值班墙 · 跨厂投递样例。"""
from __future__ import annotations

from fastapi.testclient import TestClient

from fangyu.server import app
from fangyu.core.collaboration import list_events, reset_collaboration
from fangyu.core.factory_eval import write_eval_report
from fangyu.core.presence_samples import list_sample_meta, load_sample_pack


def test_eval_fail_emits_presence_and_alerts(monkeypatch, tmp_path):
    from fangyu.core import config as config_mod

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("FANGYU_COLLAB_DB", str(tmp_path / "collab.db"))
    reset_collaboration()

    write_eval_report({
        "exit_code": 1,
        "ok": False,
        "live_tier": "none",
        "stages": {
            "unit": {"ok": False, "skipped": False},
            "card": {"ok": True, "skipped": False},
        },
    }, data_dir=tmp_path / "data", also_workspace=False)

    kinds = [e["kind"] for e in list_events(limit=20)]
    assert "eval.fail" in kinds or "eval.regression" in kinds

    with TestClient(app) as client:
        al = client.get("/api/v1/monitor/alerts?limit=20")
        assert al.status_code == 200
        body = al.json()
        assert body["eval_fail"] >= 1
        assert any(a["kind"].startswith("eval.") for a in body["alerts"])


def test_eval_ok_silent(monkeypatch, tmp_path):
    from fangyu.core import config as config_mod

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("FANGYU_COLLAB_DB", str(tmp_path / "collab.db"))
    reset_collaboration()

    write_eval_report({
        "exit_code": 0,
        "ok": True,
        "stages": {"unit": {"ok": True}},
    }, data_dir=tmp_path / "data", also_workspace=False)

    assert not any(str(e.get("kind") or "").startswith("eval.") for e in list_events(limit=20))


def test_cross_factory_task_sample_pack():
    samples = list_sample_meta()
    assert any(s.get("id") == "cross-factory-task" for s in samples)
    pack = load_sample_pack("cross-factory-task")
    kinds = {e.get("kind") for e in (pack.get("events") or [])}
    assert "a2a.send" in kinds
    assert "a2a.complete" in kinds
    assert "host.heartbeat" in kinds
    hosts = [p for p in (pack.get("presence") or []) if p.get("kind") == "host"]
    assert len(hosts) >= 2
