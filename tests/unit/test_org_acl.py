"""G2-C 组织 ACL 单元测试。"""
from __future__ import annotations

from pathlib import Path

import pytest

from fangyu.core import config as config_mod
from fangyu.core.org_acl import (
    ACLError,
    assert_org_allowed,
    enable_acl,
    init_acl,
    load_acl,
    reset_principal,
    set_principal,
    write_bundle_acl,
)
from fangyu.engine.agent_loop import run_agent_loop


@pytest.fixture()
def acl_env(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    prev = Path(config_mod.DATA_DIR)
    config_mod.set_data_dir(data)
    init_acl(org_name="TestOrg", enabled=True, require_principal=True)
    yield data
    config_mod.set_data_dir(prev)


def test_operator_can_write_not_shell(acl_env):
    assert_org_allowed("operator", agent="Any", skill="default", tool="write")
    with pytest.raises(ACLError) as ei:
        assert_org_allowed("operator", tool="shell")
    assert ei.value.rule == "tool_denied"


def test_viewer_denied_write(acl_env):
    with pytest.raises(ACLError):
        assert_org_allowed("viewer", tool="write")
    assert_org_allowed("viewer", tool="read")


def test_admin_star(acl_env):
    assert_org_allowed("admin", agent="X", skill="y", tool="shell")


def test_require_principal(acl_env):
    with pytest.raises(ACLError) as ei:
        assert_org_allowed(None, agent="A")
    assert ei.value.rule == "require_principal"


def test_disabled_allows_all(acl_env):
    enable_acl(False)
    assert_org_allowed(None, agent="A", tool="shell")


@pytest.mark.asyncio
async def test_agent_loop_blocks_denied_tool(acl_env):
    token = set_principal("operator")
    calls = {"n": 0}

    async def llm(messages):
        calls["n"] += 1
        if calls["n"] == 1:
            return '{"action":"tool","name":"shell","args":{"command":"echo x"}}'
        return '{"action":"done","result":"ok"}'

    def shell(**kwargs):
        raise AssertionError("shell should not run")

    out = await run_agent_loop(
        goal="try shell",
        tools={"shell": shell, "read": lambda path="": ""},
        llm=llm,
        max_turns=4,
    )
    reset_principal(token)
    assert out["success"] is True
    # 工具结果里应有 denied
    denied = any("无权" in str(t.get("observation") or t.get("error") or "") for t in out["trace"])
    assert denied


def test_bundle_acl_file(acl_env, tmp_path):
    bundle = tmp_path / "b"
    (bundle / "config").mkdir(parents=True)
    path = write_bundle_acl(bundle)
    assert path.is_file()
    doc = load_acl()
    assert doc["enabled"] is True


def test_acl_api(acl_env):
    from fastapi.testclient import TestClient
    from fangyu.server import app

    client = TestClient(app)
    r = client.get("/api/v1/acl")
    assert r.status_code == 200
    assert r.json()["enabled"] is True
    chk = client.post("/api/v1/acl/check", json={
        "principal_id": "operator",
        "tool": "shell",
    })
    assert chk.status_code == 200
    assert chk.json()["allowed"] is False
    ok = client.post("/api/v1/acl/check", json={
        "principal_id": "admin",
        "tool": "shell",
    })
    assert ok.json()["allowed"] is True
