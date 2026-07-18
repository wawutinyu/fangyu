"""ACL ↔ SSO 产品路径。"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.org_acl import (
    ensure_sso_member,
    init_acl,
    principal_acl_status,
)
from fangyu.core.sso import mint_access_token, save_sso_config
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    config_mod.set_data_dir(tmp_path / "data")
    yield


def test_ensure_sso_member_and_status():
    init_acl(org_name="Bridge", enabled=True, require_principal=True)
    st0 = principal_acl_status("dana")
    assert st0["is_member"] is False
    out = ensure_sso_member("dana", name="Dana", roles=["operator"])
    assert out["created"] is True
    assert out["status"]["is_member"] is True
    again = ensure_sso_member("dana", roles=["admin"])
    assert again["created"] is False
    assert again["member"]["roles"] == ["operator"]  # 默认不覆盖
    upd = ensure_sso_member("dana", roles=["admin"], update_existing=True)
    assert upd["member"]["roles"] == ["admin"]


def test_acl_sync_sso_api():
    init_acl(org_name="Bridge", enabled=False, require_principal=True)
    save_sso_config({"enabled": False, "issuer": "fangyu-local", "audience": "fangyu-api"})
    tok = mint_access_token(principal_id="eve", name="Eve", roles=["operator"])

    with TestClient(app) as client:
        me = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {tok['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["principal_id"] == "eve"
        assert me.json()["acl"]["is_member"] is False

        sync = client.post(
            "/api/v1/acl/sync-sso",
            headers={"Authorization": f"Bearer {tok['access_token']}"},
            json={"roles": ["operator"]},
        )
        assert sync.status_code == 200
        assert sync.json()["created"] is True
        assert sync.json()["status"]["is_member"] is True
        assert sync.json()["hint"]  # ACL 未启用时有提示

        me2 = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {tok['access_token']}"},
        )
        assert me2.json()["acl"]["is_member"] is True

        acl_me = client.get(
            "/api/v1/acl/me",
            headers={"Authorization": f"Bearer {tok['access_token']}"},
        )
        assert acl_me.status_code == 200
        assert acl_me.json()["roles"] == ["operator"]
