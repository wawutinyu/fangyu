"""健康回归 → 观事件 / 观测告警。"""
from __future__ import annotations

from fastapi.testclient import TestClient

from fangyu.server import app
from fangyu.core.collaboration import list_events, reset_collaboration
from fangyu.core.factory_eval import is_health_regression, write_eval_report


def test_is_health_regression_rules():
    assert is_health_regression(None) is False
    assert is_health_regression({"changed": False}) is False
    assert is_health_regression({
        "changed": True,
        "avg_score_delta": -5.0,
        "offline_delta": 0,
    }) is True
    assert is_health_regression({
        "changed": True,
        "avg_score_delta": 2.0,
        "offline_delta": 1,
    }) is True
    assert is_health_regression({
        "changed": True,
        "avg_score_delta": 0.5,
        "offline_delta": 0,
    }) is False


def test_eval_ok_health_regression_emits(monkeypatch, tmp_path):
    from fangyu.core import config as config_mod

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("FANGYU_COLLAB_DB", str(tmp_path / "collab.db"))
    reset_collaboration()

    write_eval_report({
        "exit_code": 0,
        "ok": True,
        "stages": {"unit": {"ok": True}},
        "factories_health": {
            "count": 2,
            "online": 2,
            "offline": 0,
            "avg_score": 90.0,
            "min_score": 80,
        },
    }, data_dir=tmp_path / "data", also_workspace=False)

    write_eval_report({
        "exit_code": 0,
        "ok": True,
        "stages": {"unit": {"ok": True}},
        "factories_health": {
            "count": 2,
            "online": 1,
            "offline": 1,
            "avg_score": 55.0,
            "min_score": 20,
        },
    }, data_dir=tmp_path / "data", also_workspace=False)

    kinds = [e["kind"] for e in list_events(limit=20)]
    assert "eval.health_regression" in kinds
    assert "eval.fail" not in kinds

    with TestClient(app) as client:
        al = client.get("/api/v1/monitor/alerts?limit=20")
        assert al.status_code == 200
        body = al.json()
        assert body.get("health_regress", 0) >= 1
        assert any(a["kind"] == "eval.health_regression" for a in body["alerts"])
