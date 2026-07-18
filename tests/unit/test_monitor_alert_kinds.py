"""monitor alert kind helpers (frontend parity)."""
from __future__ import annotations


def is_monitor_alert_kind(kind: str) -> bool:
    k = (kind or "").strip()
    if not k:
        return False
    return (
        k.startswith("eval.")
        or k in ("factory.offline", "host.offline", "factory.online")
    )


def test_is_monitor_alert_kind():
    assert is_monitor_alert_kind("eval.fail")
    assert is_monitor_alert_kind("eval.regression")
    assert is_monitor_alert_kind("factory.offline")
    assert is_monitor_alert_kind("host.offline")
    assert is_monitor_alert_kind("factory.online")
    assert not is_monitor_alert_kind("a2a.send")
    assert not is_monitor_alert_kind("host.heartbeat")
    assert not is_monitor_alert_kind("")
