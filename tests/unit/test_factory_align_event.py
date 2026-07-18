"""对齐结果写入观事件（timeline info，不进告警铃铛）。"""
from __future__ import annotations

from fastapi.testclient import TestClient

from fangyu.server import app
from fangyu.core.collaboration import list_events, reset_collaboration
from fangyu.core.monitor_alerts import collect_monitor_alerts


def test_align_emits_factory_align_info(monkeypatch, tmp_path):
    from fangyu.core import a2a_discovery as disc
    from fangyu.core import a2a_factories as fac
    from fangyu.core import config as config_mod
    from fangyu.core.remote_hosts import clear_remote_hosts, upsert_remote_host

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("FANGYU_COLLAB_DB", str(tmp_path / "collab.db"))
    reset_collaboration()
    clear_remote_hosts()
    fac.save_factories([])

    monkeypatch.setattr(
        disc,
        "probe_factory",
        lambda url: {
            "ok": True,
            "base_url": url.rstrip("/"),
            "rpc_url": url.rstrip("/") + "/api/v1/a2a/rpc",
            "card": {"name": "X"},
            "hits": [],
        },
    )
    upsert_remote_host(
        host_id="studio-east",
        label="东厂",
        base_url="http://east.example:8787",
        role="studio",
    )

    with TestClient(app) as client:
        aligned = client.post("/api/v1/a2a/factories/align", json={
            "import_hosts": True,
            "export_factories": True,
            "probe": False,
            "retest_after": True,
        })
        assert aligned.status_code == 200
        assert aligned.json()["imported"] >= 1

    events = [e for e in list_events(limit=20) if e.get("kind") == "factory.align"]
    assert len(events) >= 1
    assert events[0].get("severity") == "info"
    assert (events[0].get("detail") or {}).get("imported") >= 1

    body = collect_monitor_alerts(limit=40)
    assert not any(a.get("kind") == "factory.align" for a in body["alerts"])
