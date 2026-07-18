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
