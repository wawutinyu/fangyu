"""工厂通讯录健康分。"""
from __future__ import annotations

import time

from fangyu.core.a2a_factories import compute_factory_health, enrich_factory_row


def test_health_online_fresh_high():
    now = time.time()
    h = compute_factory_health({
        "online": True,
        "last_heartbeat_at": now - 5,
        "last_probe_ok": True,
        "meta": {"consecutive_failures": 0},
    }, now=now, ttl_sec=120)
    assert h["score"] >= 80
    assert h["grade"] == "A"


def test_health_offline_low():
    now = time.time()
    h = compute_factory_health({
        "online": False,
        "last_heartbeat_at": now - 5,
        "last_probe_ok": False,
        "meta": {"consecutive_failures": 5},
    }, now=now, ttl_sec=120)
    assert h["score"] < 40
    assert h["grade"] == "D"
    assert h["factors"]["fail_penalty"] == -10


def test_health_stale_heartbeat():
    now = time.time()
    h = compute_factory_health({
        "online": True,
        "last_heartbeat_at": now - 200,
        "last_probe_ok": True,
        "meta": {},
    }, now=now, ttl_sec=120)
    assert h["factors"]["freshness"] == 0
    assert h["score"] < 80


def test_health_never_probed_baseline():
    h = compute_factory_health({"meta": {}}, now=time.time())
    assert 20 <= h["score"] <= 50
    assert "health" in enrich_factory_row({"id": "x", "base_url": "http://a"})
