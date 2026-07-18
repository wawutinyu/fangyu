"""试跑失败 → 观测告警。"""
from __future__ import annotations

from fangyu.core.collaboration import emit_event, reset_collaboration
from fangyu.core.monitor_alerts import collect_monitor_alerts


def test_external_ping_fail_in_monitor_alerts(monkeypatch):
    monkeypatch.setattr("fangyu.core.a2a_factories.load_factories", lambda: [])
    monkeypatch.setattr("fangyu.core.factory_eval.load_eval_report", lambda: None)
    reset_collaboration()

    emit_event(
        "external.ping",
        actor="agent:ext-demo",
        message="试跑失败 · timeout",
        detail={"ok": False, "error": "timeout", "agent": "ext-demo"},
        severity="warn",
    )
    emit_event(
        "external.ping",
        actor="agent:ext-ok",
        message="试跑通过",
        detail={"ok": True},
        severity="info",
    )

    body = collect_monitor_alerts(limit=20)
    assert body["ok"] is True
    assert body["ping_fail"] >= 1
    kinds = [a["kind"] for a in body["alerts"]]
    assert "external.ping" in kinds
    fail = next(a for a in body["alerts"] if a["kind"] == "external.ping")
    assert fail["title"] == "外部试跑未过"
    assert fail["severity"] == "warn"
    # 成功试跑不进告警
    assert all(
        (a.get("detail") or {}).get("ok") is False
        for a in body["alerts"]
        if a.get("kind") == "external.ping"
    )
