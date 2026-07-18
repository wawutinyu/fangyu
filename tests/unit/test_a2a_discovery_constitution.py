"""A2A 跨厂发现 + 宪法 Bundle 绑定。"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.a2a_discovery import normalize_factory_base, normalize_rpc_url, probe_factory
from fangyu.core.a2a_factories import load_factories, upsert_factory
from fangyu.core.agent_card import validate_agent_card
from fangyu.core.constitution import load_constitution, save_constitution
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    config_mod.set_data_dir(tmp_path / "data")
    yield


def test_normalize_urls():
    assert normalize_factory_base("http://x:9/api/v1/a2a/rpc") == "http://x:9"
    assert normalize_rpc_url("http://x:9") == "http://x:9/api/v1/a2a/rpc"


def test_fetch_remote_card_well_known(monkeypatch):
    from fangyu.core import a2a_discovery as disc

    card = {
        "name": "Remote",
        "version": "1.0.0",
        "skills": [{"id": "default"}],
        "interfaces": {"a2a": {"enabled": True, "url": "http://r/rpc"}},
    }

    def fake_get(url, *, timeout=10.0):
        if url.endswith("/.well-known/agent-card.json"):
            return card
        return None

    monkeypatch.setattr(disc, "_http_get_json", fake_get)
    out = disc.fetch_remote_card("http://remote.example/api/v1/a2a/rpc")
    assert out["name"] == "Remote"
    assert "well-known" in out["_discovered_from"]


def test_local_discovery_and_well_known_api():
    from fangyu.engine.a2a_runtime import AgentRegistry

    AgentRegistry.register("local-a", {
        "name": "LocalA",
        "version": "1.0.0",
        "skills": [{"id": "default"}],
        "interfaces": {"a2a": {"enabled": True, "url": "/api/v1/a2a/rpc"}},
        "defaultInterface": {"type": "a2a", "url": "/api/v1/a2a/rpc"},
    }, {})
    with TestClient(app) as client:
        d = client.get("/api/v1/a2a/discovery")
        assert d.status_code == 200
        assert d.json()["count"] >= 1
        wk = client.get("/api/v1/a2a/well-known/agent-card")
        assert wk.status_code == 200
        assert validate_agent_card(wk.json()) == []


def test_factories_registry_and_probe(monkeypatch):
    from fangyu.core import a2a_discovery as disc

    monkeypatch.setattr(disc, "_http_get_json", lambda url, **k: {"status": "ok"} if "health" in url else None)
    monkeypatch.setattr(disc, "fetch_remote_card", lambda rpc: {"name": "X", "skills": [{"id": "d"}], "version": "1", "interfaces": {"a2a": {"enabled": True, "url": rpc}}})
    monkeypatch.setattr("fangyu.engine.a2a_remote.fetch_remote_identity", lambda rpc: {})

    row = upsert_factory(base_url="http://fac.example:8000", label="Fac")
    assert row["id"]
    assert any(f["base_url"] == "http://fac.example:8000" for f in load_factories())

    with TestClient(app) as client:
        p = client.post("/api/v1/a2a/factories/probe", json={"base_url": "http://fac.example:8000"})
        assert p.status_code == 200
        assert p.json()["ok"] is True
        listed = client.get("/api/v1/a2a/factories")
        assert listed.status_code == 200
        assert listed.json()["factories"]


def test_factories_probe_save(monkeypatch, tmp_path):
    from fangyu.core import a2a_discovery as disc
    from fangyu.core import a2a_factories as fac
    from fangyu.core import config as config_mod

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(disc, "_http_get_json", lambda url, **k: {"status": "ok"} if "health" in url else None)
    monkeypatch.setattr(
        disc,
        "fetch_remote_card",
        lambda rpc: {
            "name": "PeerFac",
            "skills": [{"id": "d"}],
            "version": "1",
            "interfaces": {"a2a": {"enabled": True, "url": rpc}},
        },
    )
    monkeypatch.setattr("fangyu.engine.a2a_remote.fetch_remote_identity", lambda rpc: {})

    with TestClient(app) as client:
        r = client.post(
            "/api/v1/a2a/factories/probe-save",
            json={"base_url": "http://peer.example:9000", "label": "对端"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["persisted"] is True
        assert body["factory"]["label"] == "对端"
        assert body["probe"]["card"]["name"] == "PeerFac"
        assert any(f["base_url"] == "http://peer.example:9000" for f in fac.load_factories())


def test_factories_batch_heartbeat(monkeypatch, tmp_path):
    from fangyu.core import a2a_discovery as disc
    from fangyu.core import a2a_factories as fac
    from fangyu.core import config as config_mod
    from fangyu.core.remote_hosts import clear_remote_hosts, list_remote_hosts

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    clear_remote_hosts()
    fac.save_factories([])

    upsert_factory(base_url="http://hb.example:8001", label="HB")
    monkeypatch.setattr(
        disc,
        "probe_factory",
        lambda url: {
            "ok": True,
            "base_url": "http://hb.example:8001",
            "rpc_url": "http://hb.example:8001/api/v1/a2a/rpc",
            "card": {"name": "HB"},
            "hits": [],
        },
    )

    with TestClient(app) as client:
        r = client.post("/api/v1/a2a/factories/heartbeat", json={"sync_presence": True})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["online"] == 1
        assert body["total"] == 1
        rows = fac.load_factories()
        assert rows[0].get("online") is True
        assert rows[0].get("last_heartbeat_at")
        hosts = list_remote_hosts()
        assert any(h.get("role") == "factory" for h in hosts)


def test_factories_align_and_heartbeat_loop(monkeypatch, tmp_path):
    from fangyu.core import a2a_discovery as disc
    from fangyu.core import a2a_factories as fac
    from fangyu.core import config as config_mod
    from fangyu.core import factory_heartbeat_loop as loop
    from fangyu.core.remote_hosts import clear_remote_hosts, upsert_remote_host

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    clear_remote_hosts()
    fac.save_factories([])
    loop.stop_factory_heartbeat_loop()

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
    upsert_factory(base_url="http://west.example:8787", label="西厂")
    # 标记西厂曾在线以便导出
    rows = fac.load_factories()
    rows[0]["online"] = True
    fac.save_factories(rows)

    with TestClient(app) as client:
        aligned = client.post("/api/v1/a2a/factories/align", json={
            "import_hosts": True,
            "export_factories": True,
            "probe": False,
        })
        assert aligned.status_code == 200
        body = aligned.json()
        assert body["imported"] >= 1
        assert body["exported"] >= 1
        bases = {f["base_url"] for f in fac.load_factories()}
        assert "http://east.example:8787" in bases
        assert "http://west.example:8787" in bases

        st = client.get("/api/v1/a2a/factories/heartbeat-loop")
        assert st.status_code == 200
        assert st.json()["running"] is False

        on = client.post("/api/v1/a2a/factories/heartbeat-loop", json={
            "enabled": True,
            "interval_sec": 30,
            "sync_presence": True,
            "align": True,
        })
        assert on.status_code == 200
        assert on.json()["enabled"] is True
        assert on.json()["running"] is True

        off = client.post("/api/v1/a2a/factories/heartbeat-loop", json={"enabled": False})
        assert off.status_code == 200
        assert off.json()["running"] is False

    loop.stop_factory_heartbeat_loop()


def test_constitution_bundle_roundtrip(tmp_path):
    bundle = tmp_path / "b"
    bundle.mkdir()
    doc = load_constitution()
    doc["name"] = "BundleLaw"
    doc["forbidden_actions"] = ["shell_execution"]
    (bundle / "constitution.json").write_text(json.dumps(doc), encoding="utf-8")

    with TestClient(app) as client:
        r = client.post("/api/v1/constitution/from-bundle", json={"bundle_dir": str(bundle)})
        assert r.status_code == 200
        assert r.json()["constitution"]["name"] == "BundleLaw"

        save_constitution({**load_constitution(), "name": "PlatformLaw"})
        w = client.post(
            "/api/v1/constitution/to-bundle",
            json={"bundle_dir": str(bundle)},
        )
        assert w.status_code == 200
        written = json.loads((bundle / "constitution.json").read_text(encoding="utf-8"))
        assert written["name"] == "PlatformLaw"

        tpl = client.get("/api/v1/constitution/policy-templates")
        assert tpl.status_code == 200
        assert len(tpl.json()["templates"]) >= 2


def test_factory_offline_transition_and_monitor_alerts(monkeypatch, tmp_path):
    from fangyu.core import a2a_discovery as disc
    from fangyu.core import a2a_factories as fac
    from fangyu.core import config as config_mod
    from fangyu.core.collaboration import list_events, reset_collaboration
    from fangyu.core.remote_hosts import clear_remote_hosts

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("FANGYU_COLLAB_DB", str(tmp_path / "collab.db"))
    clear_remote_hosts()
    reset_collaboration()
    fac.save_factories([])

    upsert_factory(base_url="http://alert.example:8001", label="告警厂")
    rows = fac.load_factories()
    rows[0]["online"] = True
    fac.save_factories(rows)

    monkeypatch.setattr(
        disc,
        "probe_factory",
        lambda url: {
            "ok": False,
            "base_url": "http://alert.example:8001",
            "error": "connection refused",
            "hits": [],
        },
    )

    with TestClient(app) as client:
        r = client.post("/api/v1/a2a/factories/heartbeat", json={"sync_presence": True})
        assert r.status_code == 200
        body = r.json()
        assert body["offline"] == 1
        rows = fac.load_factories()
        assert rows[0].get("online") is False
        assert rows[0].get("meta", {}).get("alert") == "offline"

        kinds = [e["kind"] for e in list_events(limit=20)]
        assert "factory.offline" in kinds

        al = client.get("/api/v1/monitor/alerts?limit=20")
        assert al.status_code == 200
        alert_body = al.json()
        assert alert_body["ok"] is True
        assert alert_body["offline_factories"] >= 1
        assert any(a["kind"] == "factory.offline" for a in alert_body["alerts"])
