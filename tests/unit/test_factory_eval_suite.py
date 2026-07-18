"""出厂 Eval 套件清单与 OIDC 授权码登录。"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core import sso as sso_mod
from fangyu.core.sso import (
    clear_jwks_cache,
    clear_oidc_states,
    complete_oidc_login,
    rsa_public_jwk,
    save_sso_config,
    start_oidc_login,
    verify_access_token,
)
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    clear_jwks_cache()
    clear_oidc_states()
    yield
    clear_jwks_cache()
    clear_oidc_states()


def test_factory_eval_suite_wired():
    """FACTORY_EVAL 固定套件文件必须存在且被 gate 引用。"""
    root = Path(__file__).resolve().parents[2]
    gate = (root / "scripts" / "factory_gate.py").read_text(encoding="utf-8")
    doc = (root / "docs" / "FACTORY_EVAL.md").read_text(encoding="utf-8")
    assert "FACTORY_EVAL" in gate or "factory_eval" in gate
    assert "browser-inspect" in gate
    assert "oidc_auth_code" in gate
    assert "factory_gate.py" in doc
    assert (root / "tests" / "unit" / "test_browser_sso.py").is_file()


def _mint_id_token(key, *, client_id: str) -> str:
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT", "kid": "oidc1"}
    payload = {
        "iss": "https://idp.example",
        "aud": client_id,
        "sub": "u-99",
        "preferred_username": "dana",
        "email": "dana@example.com",
        "name": "Dana",
        "iat": now,
        "exp": now + 3600,
    }
    signing = f"{sso_mod._b64url_json(header)}.{sso_mod._b64url_json(payload)}"
    sig = key.sign(signing.encode("ascii"), padding.PKCS1v15(), hashes.SHA256())
    return f"{signing}.{sso_mod._b64url(sig)}"


def test_oidc_auth_code_login_flow(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = rsa_public_jwk(key, kid="oidc1")
    jwks_doc = {"keys": [jwk]}
    client_id = "fangyu-studio"
    id_token = _mint_id_token(key, client_id=client_id)

    class FakeResp:
        status_code = 200
        text = "{}"

        def json(self):
            return {"id_token": id_token, "access_token": "opaque", "token_type": "Bearer"}

        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, headers=None):
            assert "jwks" in url

            class JR(FakeResp):
                def json(self_inner):
                    return jwks_doc

            return JR()

        def post(self, url, data=None, headers=None):
            assert "token" in url
            assert data and data.get("code") == "auth-code-1"
            return FakeResp()

    monkeypatch.setattr(sso_mod.httpx, "Client", FakeClient)
    save_sso_config({
        "enabled": True,
        "issuer": "https://idp.example",
        "audience": "fangyu-api",
        "oidc": {
            "authorization_endpoint": "https://idp.example/authorize",
            "token_endpoint": "https://idp.example/token",
            "jwks_uri": "https://idp.example/jwks",
            "client_id": client_id,
            "client_secret": "s3cret",
            "redirect_uri": "http://127.0.0.1:5173/",
        },
    })

    started = start_oidc_login(redirect_uri="http://127.0.0.1:5173/")
    assert "authorization_url" in started
    assert "state=" in started["authorization_url"]
    assert "client_id=fangyu-studio" in started["authorization_url"]

    out = complete_oidc_login(code="auth-code-1", state=started["state"])
    assert out["principal_id"] == "dana"
    local = verify_access_token(out["access_token"])
    assert local["sub"] == "dana"

    with TestClient(app) as client:
        r = client.get("/api/v1/auth/config")
        assert r.status_code == 200
        assert r.json()["oidc"]["login_ready"] is True
        assert "oidc_auth_code" in r.json()["modes"]

        start = client.post(
            "/api/v1/auth/oidc/start",
            json={"redirect_uri": "http://127.0.0.1:5173/"},
        )
        assert start.status_code == 200
        st = start.json()["state"]
        cb = client.post(
            "/api/v1/auth/oidc/callback",
            json={"code": "auth-code-1", "state": st},
        )
        assert cb.status_code == 200
        assert cb.json()["principal_id"] == "dana"

        me = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {cb.json()['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["principal_id"] == "dana"
