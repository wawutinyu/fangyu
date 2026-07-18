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


def test_enrich_includes_health_history():
    row = {
        "id": "f1",
        "base_url": "http://a",
        "online": True,
        "last_heartbeat_at": time.time(),
        "last_probe_ok": True,
        "meta": {
            "health_history": [
                {"ts": 1.0, "score": 70},
                {"ts": 2.0, "score": 85},
            ],
        },
    }
    enriched = enrich_factory_row(row)
    assert enriched["health"]["history"][-1]["score"] == 85
    assert len(enriched["health"]["history"]) == 2
    assert "factors" in enriched["health"]


def test_build_presence_health_factors_and_history():
    from fangyu.core.collaboration import build_presence
    from fangyu.core.remote_hosts import clear_remote_hosts, upsert_remote_host

    clear_remote_hosts()
    upsert_remote_host(
        host_id="factory:east",
        label="东厂",
        base_url="http://127.0.0.1:18789",
        role="factory",
        meta={
            "factory_id": "east",
            "health": {
                "score": 72,
                "grade": "B",
                "factors": {"online": 40, "freshness": 20},
                "history": [{"ts": 1.0, "score": 60}, {"ts": 2.0, "score": 72}],
            },
        },
    )
    hit = next(e for e in build_presence() if e.get("id") == "host:factory:east")
    assert hit["health"]["factors"]["online"] == 40
    assert hit["health"]["history"][-1]["score"] == 72
    clear_remote_hosts()
