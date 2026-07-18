"""G2: workbuddy profile + multi topology 导出与编排。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from fangyu.core import config as config_mod
from fangyu.core.agent_factory import build_from_profile, list_profiles
from fangyu.core.topology_export import load_topology
from fangyu.engine.bundle_orchestrate import run_topology
from fangyu.engine.bundle_tools import office_toolbelt
from fangyu.engine.workspace import init_bundle_workspace


@pytest.fixture()
def restore_data_dir():
    prev = Path(config_mod.DATA_DIR)
    yield
    config_mod.set_data_dir(prev)


def test_list_profiles_g2():
    ids = {p["id"] for p in list_profiles()}
    assert "workbuddy" in ids
    assert "multi" in ids


def test_workbuddy_bundle_layout(tmp_path, restore_data_dir):
    dest = tmp_path / "wb"
    root = build_from_profile("workbuddy", dest, name="WB")
    tb = json.loads((root / "config" / "toolbelt.json").read_text(encoding="utf-8"))
    assert tb["id"] == "office"
    assert "write_deliverable" in tb["tools"]
    assert "shell" not in tb["tools"]
    flow = json.loads((root / "skills" / "default" / "flow.json").read_text(encoding="utf-8"))
    types = [
        (n.get("data") or {}).get("originType") or n.get("originType")
        for n in flow["nodes"]
    ]
    assert "agent-loop" in types
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert manifest.get("profile") == "workbuddy"


def test_office_write_deliverable(tmp_path, restore_data_dir):
    dest = tmp_path / "wb2"
    root = build_from_profile("workbuddy", dest)
    init_bundle_workspace(root)
    tools = office_toolbelt()
    msg = tools["write_deliverable"](path="notes/hello", content="# 你好\n", kind="md")
    assert "deliverables/" in msg
    listed = tools["list_deliverables"]()
    assert any(p.endswith("hello.md") for p in listed)


def test_office_write_docx(tmp_path, restore_data_dir):
    import zipfile

    dest = tmp_path / "wb-docx"
    root = build_from_profile("workbuddy", dest)
    init_bundle_workspace(root)
    tools = office_toolbelt()
    msg = tools["write_deliverable"](
        path="report/week",
        content="# 周报\n\n本周完成竖切。\n\n- 项A\n- 项B\n",
        kind="docx",
    )
    assert "docx" in msg
    from fangyu.engine.workspace import get_active_workspace
    ws = get_active_workspace()
    assert ws is not None
    docx_path = ws.resolve("deliverables/report/week.docx")
    assert docx_path.is_file()
    assert docx_path.stat().st_size > 500
    # 合法 zip/OOXML
    with zipfile.ZipFile(docx_path, "r") as zf:
        names = zf.namelist()
        assert "word/document.xml" in names
        xml = zf.read("word/document.xml").decode("utf-8")
        assert "周报" in xml
    listed = tools["list_deliverables"]()
    assert any(p.endswith("week.docx") for p in listed)


def test_multi_topology_export(tmp_path, restore_data_dir):
    dest = tmp_path / "multi"
    root = build_from_profile(
        "multi", dest, intent="搜索分析汇总本周竞品报告", name="Multi-Test",
    )
    topo = load_topology(root)
    assert topo["pipeline"]
    assert len(topo["agents"]) >= 2
    assert (root / "config" / "topology.json").is_file()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert manifest.get("capabilities", {}).get("multi_agent") is True


def test_orchestrate_mock_llm(tmp_path, restore_data_dir):
    dest = tmp_path / "orch"
    root = build_from_profile("multi", dest, intent="双人协作写周报")
    calls = {"n": 0}

    async def fake_llm(messages):
        calls["n"] += 1
        # 每个角色：写成品 → done
        if calls["n"] % 2 == 1:
            return json.dumps({
                "action": "tool",
                "name": "write_deliverable",
                "args": {
                    "path": f"step{calls['n']}.md",
                    "content": f"# step {calls['n']}\n",
                    "kind": "md",
                },
            }, ensure_ascii=False)
        return json.dumps({
            "action": "done",
            "result": f"done-{calls['n']}",
        }, ensure_ascii=False)

    out = run_topology(root, "写一份周报提纲", llm=fake_llm, max_turns=4)
    assert out["success"] is True
    assert len(out["steps"]) >= 2
    init_bundle_workspace(root)
    tools = office_toolbelt()
    files = tools["list_deliverables"]()
    assert files, "应有 deliverables 落盘"
