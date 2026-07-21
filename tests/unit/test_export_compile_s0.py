"""S0-B6：导出 compile 开关、路径净化、限流。"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from fangyu.routers import export_compile as export_mod
from fangyu.server import app


@pytest.fixture(autouse=True)
def _reset_rate():
    export_mod._compile_times.clear()
    yield
    export_mod._compile_times.clear()


def test_bundle_rejects_extrafiles_escape(monkeypatch):
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "0")
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/export/bundle",
            json={
                "pyCode": "print(1)\n",
                "extraFiles": [{"filename": "../evil.txt", "content": "x"}],
            },
        )
        assert r.status_code == 400
        assert "escape" in r.json()["detail"].lower() or "path" in r.json()["detail"].lower()


def test_compile_disabled_when_require_auth(monkeypatch):
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "1")
    monkeypatch.setenv("FANGYU_ALLOW_DEV_TOKEN", "1")
    monkeypatch.delenv("FANGYU_ALLOW_EXPORT_COMPILE", raising=False)
    with TestClient(app) as client:
        tok = client.post("/api/v1/auth/token", json={"principal_id": "op", "roles": ["operator"]})
        assert tok.status_code == 200
        access = tok.json()["access_token"]
        r = client.post(
            "/api/v1/export/compile-bundle",
            json={"pyCode": "print(1)\n"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert r.status_code == 403
        assert "禁用" in r.json()["detail"] or "COMPILE" in r.json()["detail"].upper()


def test_compile_allowed_with_flag(monkeypatch):
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "0")
    monkeypatch.setenv("FANGYU_ALLOW_EXPORT_COMPILE", "1")
    monkeypatch.setenv("FANGYU_EXPORT_COMPILE_RATE", "10")
    # 不真正跑 PyInstaller：只验证门闩放行到 to_thread 之前；用 monkeypatch 短路
    async def _fake_bundle(body, tmp_dir):
        from io import BytesIO
        return BytesIO(b"PK"), False

    monkeypatch.setattr(export_mod, "_compile_bundle_sync", lambda body, tmp: (__import__("io").BytesIO(b"PK\x03\x04"), False))
    with TestClient(app) as client:
        r = client.post("/api/v1/export/compile-bundle", json={"pyCode": "print(1)\n"})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/zip")
