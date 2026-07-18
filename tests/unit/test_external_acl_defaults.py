"""外部 Agent ACL 默认策略 + 跨厂 live 档断言。"""
from __future__ import annotations

from pathlib import Path

import pytest

from fangyu.core import config as config_mod
from fangyu.core.org_acl import (
    ACLError,
    apply_external_register_defaults,
    assert_external_org_allowed,
    default_external_allowed_skills,
    init_acl,
    load_acl,
)


@pytest.fixture()
def acl_env(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    prev = Path(config_mod.DATA_DIR)
    config_mod.set_data_dir(data)
    init_acl(org_name="ExtOrg", enabled=True, require_principal=True)
    yield data
    config_mod.set_data_dir(prev)


def test_default_skills_from_card_not_star():
    card = {"skills": [{"id": "echo"}, {"id": "summarize"}]}
    assert default_external_allowed_skills(card, requested=["*"]) == ["echo", "summarize"]
    assert default_external_allowed_skills(card, requested=None) == ["echo", "summarize"]
    d = apply_external_register_defaults(card, allowed_skills=["*"], authorized=True)
    assert d["authorized"] is True
    assert d["allowed_skills"] == ["echo", "summarize"]
    assert "*" not in d["allowed_skills"]


def test_operator_can_call_external_viewer_denied(acl_env):
    assert_external_org_allowed("operator", agent_name="ext_peer", skill="default")
    with pytest.raises(ACLError) as ei:
        assert_external_org_allowed("viewer", agent_name="ext_peer", skill="default")
    assert ei.value.rule == "agent_denied"


def test_admin_external_ok(acl_env):
    assert_external_org_allowed("admin", agent_name="any", skill="default")


def test_external_policy_in_acl_doc(acl_env):
    doc = load_acl()
    assert "external_agents" in doc
    assert doc["external_agents"]["default_authorized"] is False
    assert doc["external_agents"]["require_external_permission"] is True


def test_register_external_applies_card_skills(acl_env):
    from fastapi.testclient import TestClient
    from fangyu.server import app

    with TestClient(app) as client:
        r = client.post("/api/v1/a2a/agents/register_external", json={
            "name": "ext_acl_demo",
            "card": {"name": "Peer", "skills": [{"id": "default"}, {"id": "report"}]},
            "rpc_url": "http://127.0.0.1:9/rpc",
            "agent_id": "aid",
            "public_key": "pk",
            "allowed_skills": ["*"],
            "authorized": False,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["authorized"] is False
        assert body["allowed_skills"] == ["default", "report"]


def test_live_tier_includes_cross_factory():
    import importlib.util
    from pathlib import Path as P

    spec = importlib.util.spec_from_file_location(
        "factory_gate",
        P(__file__).resolve().parents[2] / "scripts" / "factory_gate.py",
    )
    assert spec and spec.loader
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)

    assert "scripts/cross_factory_harness_live.py" in gate.LIVE_TIER_SCRIPTS["smoke"]
    assert "scripts/cross_factory_harness_live.py" in gate.KEY_FREE_LIVE
