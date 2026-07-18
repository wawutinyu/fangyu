"""浏览器工具 + SSO JWT。"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.engine.browser_tool import (
    clear_browser_sessions,
    tool_browser_click,
    tool_browser_open,
    tool_browser_snapshot,
)
from fangyu.engine.bundle_tools import reset_builtin_tool_impls_for_tests, resolve_toolbelt
from fangyu.core.materials import default_materials
from fangyu.core.sso import mint_access_token, save_sso_config, verify_access_token
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    clear_browser_sessions()
    reset_builtin_tool_impls_for_tests()
    yield
    clear_browser_sessions()


def test_browser_open_static_html(httpx_mock=None):
    # 用本地文件 URL 不可靠；直接 mock 抽取引擎路径：起简单 http server 太重
    # 改为对 extractor / open 用 httpx mock via monkeypatch Client
    import fangyu.engine.browser_tool as bt

    class FakeResp:
        text = "<html><title>Hi</title><body><p>Hello</p><a href='/next'>Next</a></body></html>"
        url = "https://example.test/"

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, headers=None):
            return FakeResp()

    bt.httpx.Client = FakeClient  # type: ignore
    out = tool_browser_open("https://example.test/")
    assert out["ok"] is True
    assert out["title"] == "Hi"
    assert "Hello" in out["text"]
    assert out["links"] and out["links"][0]["href"].endswith("/next")
    snap = tool_browser_snapshot(session_id=out["session_id"])
    assert snap["ok"] is True
    clicked = tool_browser_click(link_index=0, session_id=out["session_id"])
    assert clicked["ok"] is True


def test_browser_in_coding_materials():
    mat = default_materials()
    ids = {t["id"] for t in mat["tools"]}
    assert "browser_open" in ids
    tools = resolve_toolbelt("coding", materials=mat)
    assert "browser_open" in tools
    assert "browser_click" in tools


def test_sso_mint_and_me(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    save_sso_config({"enabled": False, "issuer": "fangyu-local", "audience": "fangyu-api"})
    tok = mint_access_token(principal_id="alice", name="Alice", roles=["admin"])
    payload = verify_access_token(tok["access_token"])
    assert payload["sub"] == "alice"

    with TestClient(app) as client:
        r = client.post("/api/v1/auth/token", json={"principal_id": "bob", "name": "Bob"})
        assert r.status_code == 200
        access = r.json()["access_token"]
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
        assert me.status_code == 200
        assert me.json()["principal_id"] == "bob"

        me2 = client.get("/api/v1/auth/me", headers={"X-Fangyu-Principal": "carol"})
        assert me2.status_code == 200
        assert me2.json()["principal_id"] == "carol"

        cfg = client.get("/api/v1/auth/config")
        assert cfg.status_code == 200
        assert "modes" in cfg.json()


def test_sso_enabled_rejects_bad_token(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    save_sso_config({"enabled": True})
    with TestClient(app) as client:
        r = client.get("/api/health", headers={"Authorization": "Bearer not-a-jwt"})
        assert r.status_code == 401


def test_browser_inspect_skill():
    from fangyu.core.skill_pack import load_skill_parsed
    assert load_skill_parsed("browser-inspect")
