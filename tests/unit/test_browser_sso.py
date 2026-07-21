"""浏览器深度工具 + SSO / OIDC JWKS。"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.materials import default_materials
from fangyu.core.sso import (
    clear_jwks_cache,
    fetch_jwks,
    mint_access_token,
    mint_rs256_token_for_tests,
    rsa_public_jwk,
    save_sso_config,
    verify_access_token,
)
from fangyu.engine.browser_tool import (
    clear_browser_sessions,
    tool_browser_click,
    tool_browser_open,
    tool_browser_press,
    tool_browser_screenshot,
    tool_browser_scroll,
    tool_browser_snapshot,
    tool_browser_type,
    tool_browser_wait,
)
from fangyu.engine.bundle_tools import reset_builtin_tool_impls_for_tests, resolve_toolbelt
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    clear_browser_sessions()
    clear_jwks_cache()
    reset_builtin_tool_impls_for_tests()
    yield
    clear_browser_sessions()
    clear_jwks_cache()


def _patch_httpx_static(bt_mod):
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

    bt_mod.httpx.Client = FakeClient  # type: ignore


def test_browser_open_static_html():
    import fangyu.engine.browser_tool as bt

    _patch_httpx_static(bt)
    out = tool_browser_open("https://example.test/", engine="static")
    assert out["ok"] is True
    assert out["title"] == "Hi"
    assert "Hello" in out["text"]
    assert out["links"] and out["links"][0]["href"].endswith("/next")
    snap = tool_browser_snapshot(session_id=out["session_id"])
    assert snap["ok"] is True
    clicked = tool_browser_click(link_index=0, session_id=out["session_id"])
    assert clicked["ok"] is True


def test_browser_pw_actions_require_playwright():
    import fangyu.engine.browser_tool as bt

    _patch_httpx_static(bt)
    out = tool_browser_open("https://example.test/", engine="static")
    sid = out["session_id"]
    for fn, kwargs in (
        (tool_browser_type, {"selector": "#x", "text": "a", "session_id": sid}),
        (tool_browser_wait, {"selector": "#x", "session_id": sid}),
        (tool_browser_scroll, {"session_id": sid}),
        (tool_browser_press, {"key": "Enter", "session_id": sid}),
        (tool_browser_screenshot, {"session_id": sid}),
    ):
        r = fn(**kwargs)
        assert r["ok"] is False
        assert "playwright" in r["error"].lower()


def test_browser_pw_actions_with_mock_page(tmp_path, monkeypatch):
    import fangyu.engine.browser_tool as bt

    monkeypatch.chdir(tmp_path)
    _patch_httpx_static(bt)
    out = tool_browser_open("https://example.test/", engine="static")
    sid = out["session_id"]
    sess = bt._SESSIONS[sid]
    page = MagicMock()
    page.title.return_value = "Mock"
    page.inner_text.return_value = "body text"
    page.url = "https://example.test/mock"
    page.eval_on_selector_all.return_value = []
    sess["engine"] = "playwright"
    sess["_page"] = page

    assert tool_browser_wait(selector="#ok", session_id=sid)["ok"] is True
    page.wait_for_selector.assert_called()
    assert tool_browser_scroll(direction="down", amount=100, session_id=sid)["ok"] is True
    assert tool_browser_press(key="Enter", session_id=sid)["ok"] is True
    page.keyboard.press.assert_called_with("Enter")
    shot = tool_browser_screenshot(path="demo.png", session_id=sid)
    assert shot["ok"] is True
    assert shot["path"].endswith("demo.png")
    page.screenshot.assert_called()
    assert tool_browser_type(selector="#q", text="hi", session_id=sid)["ok"] is True


def test_browser_in_coding_materials():
    mat = default_materials()
    ids = {t["id"] for t in mat["tools"]}
    assert "browser_open" in ids
    assert "browser_wait" in ids
    assert "browser_screenshot" in ids
    tools = resolve_toolbelt("coding", materials=mat)
    assert "browser_open" in tools
    assert "browser_click" in tools
    assert "browser_wait" in tools
    assert "browser_screenshot" in tools


def test_sso_mint_and_me(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "0")
    monkeypatch.delenv("FANGYU_ALLOW_DEV_TOKEN", raising=False)
    monkeypatch.setattr(config_mod.settings, "REQUIRE_AUTH", False)
    monkeypatch.setattr(config_mod.settings, "ALLOW_DEV_TOKEN", "")
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
        assert "oidc_jwks_rs256" in cfg.json()["modes"]


def test_sso_enabled_rejects_bad_token(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    save_sso_config({"enabled": True})
    with TestClient(app) as client:
        r = client.get("/api/health", headers={"Authorization": "Bearer not-a-jwt"})
        assert r.status_code == 401


def test_oidc_jwks_rs256_verify(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = rsa_public_jwk(key, kid="k1")
    jwks_doc = {"keys": [jwk]}

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return jwks_doc

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, headers=None):
            assert url == "https://idp.example/.well-known/jwks.json"
            return FakeResp()

    import fangyu.core.sso as sso_mod

    monkeypatch.setattr(sso_mod.httpx, "Client", FakeClient)
    save_sso_config({
        "enabled": True,
        "issuer": "fangyu-oidc",
        "audience": "fangyu-api",
        "oidc": {"jwks_uri": "https://idp.example/.well-known/jwks.json"},
    })
    token = mint_rs256_token_for_tests(
        private_key=key,
        principal_id="eve",
        kid="k1",
        issuer="fangyu-oidc",
        audience="fangyu-api",
    )
    payload = verify_access_token(token)
    assert payload["sub"] == "eve"
    # 缓存命中
    again = fetch_jwks("https://idp.example/.well-known/jwks.json")
    assert again["keys"][0]["kid"] == "k1"

    with TestClient(app) as client:
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["principal_id"] == "eve"


def test_browser_inspect_skill():
    from fangyu.core.skill_pack import load_skill_parsed
    assert load_skill_parsed("browser-inspect")
