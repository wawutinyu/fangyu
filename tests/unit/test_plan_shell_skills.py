"""Plan 模式、shell ask、技能包、MCP 原料。"""
from __future__ import annotations

import pytest

from fangyu.core.materials import default_materials
from fangyu.core.skill_pack import append_skills_to_system, load_skill_pack
from fangyu.engine.agent_loop import PLAN_SYSTEM, run_agent_loop
from fangyu.engine.bundle_tools import resolve_toolbelt, tool_shell
from fangyu.engine.shell_policy import reset_shell_policy, set_shell_policy
from fangyu.engine.workspace import init_bundle_workspace


def test_implement_and_verify_skill_pack_exists():
    from fangyu.core.skill_pack import load_skill_pack, load_skill_parsed

    text = load_skill_pack("implement-and-verify")
    assert text and "验证" in text
    parsed = load_skill_parsed("implement-and-verify")
    assert parsed and parsed.get("id") == "implement-and-verify"
    mat = default_materials()
    assert any(
        s.get("id") == "implement-and-verify" and s.get("status") == "active"
        for s in mat["skills"]
    )
    sys = append_skills_to_system("base", mat)
    assert "implement-and-verify" in sys
    assert "工厂技能目录" in sys
    assert "反例" not in sys


def test_materials_has_plan_role_and_mcp():
    mat = default_materials()
    assert any(r.get("id") == "plan" for r in mat["roles"])
    assert mat.get("mcp")
    assert (mat.get("policies") or {}).get("shell") == "ask"


def test_shell_ask_needs_confirm(tmp_path):
    root = tmp_path / "b"
    (root / "workspace").mkdir(parents=True)
    init_bundle_workspace(root)
    tok = set_shell_policy("ask")
    try:
        blocked = tool_shell(command="echo hi > out.txt")
        assert blocked.get("status") == "needs_approval"
        ok = tool_shell(command="echo hi > out.txt", confirm=True)
        assert ok.get("exit_code") == 0
        assert (root / "workspace" / "out.txt").read_text(encoding="utf-8").startswith("hi")
        # 只读无需 confirm
        ro = tool_shell(command="pwd")
        assert "exit_code" in ro and ro.get("status") != "needs_approval"
    finally:
        reset_shell_policy(tok)


def test_resolve_includes_mcp_current_time():
    tools = resolve_toolbelt("coding", materials=default_materials())
    assert "mcp_current_time" in tools


@pytest.mark.asyncio
async def test_plan_mode_blocks_write(tmp_path):
    root = tmp_path / "bp"
    (root / "workspace").mkdir(parents=True)
    init_bundle_workspace(root)

    replies = [
        '{"action":"tool","name":"write","args":{"path":"x.md","content":"no"}}',
        '{"action":"done","result":"planned only"}',
    ]
    i = {"n": 0}

    async def llm(_m):
        r = replies[min(i["n"], len(replies) - 1)]
        i["n"] += 1
        return r

    from fangyu.engine.bundle_tools import coding_toolbelt

    out = await run_agent_loop(
        goal="plan a change",
        tools=coding_toolbelt(),
        llm=llm,
        max_turns=4,
        system=PLAN_SYSTEM,
        require_plan=False,
        enable_task=False,
        agent_mode="plan",
        shell_policy="ask",
    )
    assert out["success"] is True
    # write 不在 plan 工具表 → 工具不存在
    assert any("不存在" in str(t.get("error") or "") or t.get("tool") == "write" for t in out["trace"])
    assert not (root / "workspace" / "x.md").exists()
