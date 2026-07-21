"""S0：auth/token 门闩、强制鉴权、skills 路径、webhook secret、settings 脱敏。"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.sso import save_sso_config
from fangyu.engine import skill as skill_mod
from fangyu.server import app


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    d = tmp_path / "data"
    d.mkdir()
    monkeypatch.setattr(config_mod, "DATA_DIR", d)
    monkeypatch.setenv("FANGYU_DATA_DIR", str(d))
    save_sso_config({"enabled": False, "issuer": "fangyu-local", "audience": "fangyu-api"})
    return d


def test_dev_token_blocked_when_disallowed(data_dir, monkeypatch):
    monkeypatch.setenv("FANGYU_ALLOW_DEV_TOKEN", "0")
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "0")
    monkeypatch.delenv("FANGYU_BOOTSTRAP_SECRET", raising=False)
    with TestClient(app) as client:
        r = client.post("/api/v1/auth/token", json={"principal_id": "eve"})
        assert r.status_code == 403


def test_bootstrap_secret_can_mint(data_dir, monkeypatch):
    monkeypatch.setenv("FANGYU_ALLOW_DEV_TOKEN", "0")
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "1")
    monkeypatch.setenv("FANGYU_BOOTSTRAP_SECRET", "s3cr3t-boot")
    monkeypatch.setattr(config_mod.settings, "REQUIRE_AUTH", True)
    with TestClient(app) as client:
        bad = client.post("/api/v1/auth/token", json={"principal_id": "eve"})
        assert bad.status_code == 403
        ok = client.post(
            "/api/v1/auth/token",
            json={"principal_id": "admin", "roles": ["admin"]},
            headers={"X-Fangyu-Bootstrap": "s3cr3t-boot"},
        )
        assert ok.status_code == 200
        assert ok.json().get("access_token")


def test_dev_token_allowed_by_default_without_require_auth(data_dir, monkeypatch):
    monkeypatch.delenv("FANGYU_ALLOW_DEV_TOKEN", raising=False)
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "0")
    monkeypatch.setattr(config_mod.settings, "REQUIRE_AUTH", False)
    monkeypatch.setattr(config_mod.settings, "ALLOW_DEV_TOKEN", "")
    with TestClient(app) as client:
        r = client.post("/api/v1/auth/token", json={"principal_id": "bob", "name": "Bob"})
        assert r.status_code == 200
        assert r.json().get("access_token")


def test_require_auth_blocks_flow_run(data_dir, monkeypatch):
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "1")
    monkeypatch.setenv("FANGYU_ALLOW_DEV_TOKEN", "1")
    monkeypatch.setattr(config_mod.settings, "REQUIRE_AUTH", True)
    with TestClient(app) as client:
        denied = client.post("/api/v1/flow/run", json={"nodes": [], "edges": []})
        assert denied.status_code == 401

        tok = client.post("/api/v1/auth/token", json={"principal_id": "op", "roles": ["operator"]})
        assert tok.status_code == 200
        access = tok.json()["access_token"]
        ok = client.post(
            "/api/v1/flow/run",
            json={"nodes": [], "edges": []},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert ok.status_code == 200


def test_health_public_under_require_auth(data_dir, monkeypatch):
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "1")
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200


def test_skill_path_traversal_rejected(tmp_path, monkeypatch):
    root = tmp_path / "skills"
    root.mkdir()
    monkeypatch.setattr(skill_mod, "SKILLS_DIR", root)
    monkeypatch.setattr(skill_mod, "REGISTRY_FILE", root / "registry.json")
    bad = skill_mod.create_skill("../etc_passwd", "x", "body")
    assert bad["success"] is False
    assert "escape" in bad["error"] or "invalid" in bad["error"] or "path" in bad["error"]
    assert skill_mod.get_skill_content("../../etc/passwd") is None
    w = skill_mod.skill_write_file("ok", "../../evil.txt", "x")
    assert w.get("success") is False


def test_webhook_requires_secret(data_dir, monkeypatch):
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "0")
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/trigger/webhooks",
            json={"name": "t", "flow_config": {"nodes": [], "edges": []}},
        )
        assert created.status_code == 200
        wid = created.json()["id"]
        secret = created.json()["secret"]
        assert secret.startswith("whsec_")

        no = client.post(f"/api/v1/trigger/hook/{wid}", json={})
        assert no.status_code == 401

        yes = client.post(
            f"/api/v1/trigger/hook/{wid}",
            json={},
            headers={"X-Fangyu-Webhook-Secret": secret},
        )
        assert yes.status_code == 200


def test_settings_masks_api_keys(data_dir, monkeypatch):
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "0")
    with TestClient(app) as client:
        put = client.put(
            "/api/v1/settings/",
            json={"settings": {"deepseek_api_key": "sk-abcdefghijklmnop", "theme": "dark"}},
        )
        assert put.status_code == 200
        body = put.json()["settings"]
        assert body["theme"] == "dark"
        assert body["deepseek_api_key"] != "sk-abcdefghijklmnop"
        assert "***" in body["deepseek_api_key"]


def test_orchestrate_ignores_body_principal_when_require_auth(data_dir, monkeypatch):
    """S0-D2：强制鉴权时 principal 来自 JWT，忽略 body 伪造。"""
    from unittest.mock import patch

    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "1")
    monkeypatch.setenv("FANGYU_ALLOW_DEV_TOKEN", "1")
    monkeypatch.setattr(config_mod.settings, "REQUIRE_AUTH", True)
    captured: dict = {}

    def _fake(query, steps, pass_mode="replace", topology=None, principal_id=None):
        captured["principal_id"] = principal_id
        return {"ok": True, "steps": []}

    with patch("fangyu.routers.a2a._orchestrator.run_pipeline", side_effect=_fake):
        with TestClient(app) as client:
            tok = client.post(
                "/api/v1/auth/token",
                json={"principal_id": "alice", "roles": ["operator"]},
            )
            assert tok.status_code == 200
            access = tok.json()["access_token"]
            r = client.post(
                "/api/v1/a2a/orchestrate",
                json={
                    "query": "x",
                    "steps": [{"agent": "A", "skill_id": "s"}],
                    "principal_id": "attacker",
                },
                headers={"Authorization": f"Bearer {access}"},
            )
            assert r.status_code == 200
            assert captured.get("principal_id") == "alice"
