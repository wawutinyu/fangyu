"""人审队列与 API。"""
from __future__ import annotations

from fastapi.testclient import TestClient

from fangyu.engine.approval_queue import clear_approvals
from fangyu.engine.bundle_tools import tool_shell
from fangyu.engine.shell_policy import reset_shell_policy, set_shell_policy
from fangyu.engine.workspace import init_bundle_workspace
from fangyu.server import app


def setup_function():
    clear_approvals()


def teardown_function():
    clear_approvals()


def test_approval_api_approve_and_execute(tmp_path):
    root = tmp_path / "b"
    (root / "workspace").mkdir(parents=True)
    init_bundle_workspace(root)
    tok = set_shell_policy("ask")
    client = TestClient(app)
    try:
        blocked = tool_shell(command="touch approved.txt")
        assert blocked["status"] == "needs_approval"
        aid = blocked["approval_id"]

        listed = client.get("/api/v1/approvals?status=pending")
        assert listed.status_code == 200
        assert any(a["id"] == aid for a in listed.json()["approvals"])

        res = client.post(f"/api/v1/approvals/{aid}/approve", json={"execute": True})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["approval"]["status"] == "consumed"
        assert body["execution"]["exit_code"] == 0
        assert (root / "workspace" / "approved.txt").exists()

        denied_block = tool_shell(command="touch denied.txt")
        did = denied_block["approval_id"]
        d = client.post(f"/api/v1/approvals/{did}/deny")
        assert d.status_code == 200
        assert d.json()["approval"]["status"] == "denied"
        again = tool_shell(command="touch denied.txt", confirm=True, approval_id=did)
        assert again.get("status") == "needs_approval"
    finally:
        reset_shell_policy(tok)


def test_domain_skills_registered():
    from fangyu.core.materials import default_materials
    from fangyu.core.skill_pack import load_skill_parsed

    for sid in ("customer-support", "data-brief"):
        assert load_skill_parsed(sid)
    active = {s["id"] for s in default_materials()["skills"] if s.get("status") == "active"}
    assert "customer-support" in active
    assert "data-brief" in active
