"""飞书凭证配置向导 — status / bind 掩码与检查清单。"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.agent_factory import build_from_profile
from fangyu.engine.im_feishu import bind_feishu_channel, feishu_channel_status


@pytest.fixture()
def restore_data_dir():
    prev = Path(config_mod.DATA_DIR)
    yield
    config_mod.set_data_dir(prev)


def test_feishu_channel_status_checklist(tmp_path, restore_data_dir):
    root = build_from_profile("workbuddy", tmp_path / "wiz", name="Wiz")
    empty = feishu_channel_status(root)
    assert empty["exists"] is True
    assert empty["channel"] != "feishu" or empty["ready_for_challenge"] is False
    step_ids = {s["id"] for s in empty["steps"]}
    assert "bundle" in step_ids
    assert "app_credentials" in step_ids
    assert "topology" in step_ids
    assert empty["has_topology"] is False

    bind_feishu_channel(
        root,
        verification_token="tokensecret",
        app_id="cli_ab",
        app_secret="sec_xyzw",
    )
    st = feishu_channel_status(root, default_bundle=str(root))
    assert st["channel"] == "feishu"
    assert st["ready_for_challenge"] is True
    assert st["ready_for_reply"] is True
    assert st["verification_token_set"] is True
    assert st["app_secret_set"] is True
    assert "sec_xyzw" not in str(st)
    assert "***" in st["verification_token"]
    assert all(s["ok"] for s in st["steps"])
    assert st["steps"][0]["ok"] is True


def test_feishu_status_orchestrate_needs_topology(tmp_path, restore_data_dir):
    root = build_from_profile("workbuddy", tmp_path / "orch-warn", name="OrchWarn")
    bind_feishu_channel(root, mode="orchestrate", verification_token="t", app_id="a", app_secret="b")
    st = feishu_channel_status(root)
    assert st["mode"] == "orchestrate"
    assert st["has_topology"] is False
    topo_step = next(s for s in st["steps"] if s["id"] == "topology")
    assert topo_step["ok"] is False
    assert "orchestrate" in (st.get("note") or "")

    multi = build_from_profile(
        "multi",
        tmp_path / "orch-ok",
        intent="协作写周报并落盘纪要",
        name="OrchOk",
    )
    bind_feishu_channel(multi, mode="orchestrate", verification_token="t", app_id="a", app_secret="b")
    st2 = feishu_channel_status(multi)
    assert st2["has_topology"] is True
    assert st2["topology_ready_for_orchestrate"] is True
    assert next(s for s in st2["steps"] if s["id"] == "topology")["ok"] is True


def test_im_status_and_bind_routes(tmp_path, restore_data_dir):
    from fangyu.server import app
    from fangyu.routers import im as im_mod

    root = build_from_profile("workbuddy", tmp_path / "wiz2", name="Wiz2")
    im_mod._default_bundle = None
    client = TestClient(app)

    bare = client.get("/api/v1/im/status")
    assert bare.status_code == 200
    assert bare.json()["exists"] is False

    bound = client.post("/api/v1/im/feishu/bind", json={
        "bundle_dir": str(root),
        "mode": "chat",
        "verification_token": "vt-123456",
        "app_id": "cli_xx",
        "app_secret": "secretvalue",
    })
    assert bound.status_code == 200
    body = bound.json()
    assert body["ok"] is True
    assert body["status"]["ready_for_challenge"] is True
    assert "secretvalue" not in str(body)

    st = client.get(f"/api/v1/im/status?bundle_dir={root}")
    assert st.status_code == 200
    data = st.json()
    assert data["channel"] == "feishu"
    assert data["default_bundle"] == str(root)
    assert data["events_url_hint"].startswith("/api/v1/im/feishu")
