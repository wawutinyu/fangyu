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


def test_office_write_xlsx(tmp_path, restore_data_dir):
    import zipfile

    dest = tmp_path / "wb-xlsx"
    root = build_from_profile("workbuddy", dest)
    init_bundle_workspace(root)
    tools = office_toolbelt()
    msg = tools["write_deliverable"](
        path="stats/week",
        content="项目,状态\n竖切,完成\ndocx,完成\n",
        kind="xlsx",
    )
    assert "xlsx" in msg
    from fangyu.engine.workspace import get_active_workspace
    ws = get_active_workspace()
    assert ws is not None
    path = ws.resolve("deliverables/stats/week.xlsx")
    assert path.is_file()
    with zipfile.ZipFile(path, "r") as zf:
        assert "xl/worksheets/sheet1.xml" in zf.namelist()
        xml = zf.read("xl/worksheets/sheet1.xml").decode("utf-8")
        assert "竖切" in xml
        assert "完成" in xml
    listed = tools["list_deliverables"]()
    assert any(p.endswith("week.xlsx") for p in listed)


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


def test_office_intent_picks_office_report_template(tmp_path, restore_data_dir):
    from fangyu.core.intent_agents import classify_agent_intent, intent_to_agent_graph

    assert classify_agent_intent("协作写本周产品周报并落盘") == "office_report"
    g = intent_to_agent_graph("写会议纪要并导出")
    assert g["template"] == "office_report"
    assert g["graph"]["pipeline"] == ["agent_draft", "agent_review", "agent_publish"]

    root = build_from_profile("multi", tmp_path / "office-multi", intent="写周报并落盘")
    topo = load_topology(root)
    ids = [a["id"] for a in topo.get("agents") or []]
    assert "agent_draft" in ids
    assert "agent_publish" in ids


def test_im_orchestrate_office_multi_mock(tmp_path, restore_data_dir):
    """P4：一句办公任务 → multi 拓扑 → IM mode=orchestrate → deliverables。"""
    from fangyu.engine.im_inbound import handle_inbound_text, write_im_config

    root = build_from_profile(
        "multi",
        tmp_path / "im-orch",
        intent="协作写周报并落盘纪要",
        name="OfficeNet",
    )
    write_im_config(root, {"channel": "generic", "mode": "orchestrate", "enabled": True})
    calls = {"n": 0}

    async def fake_llm(_messages):
        calls["n"] += 1
        if calls["n"] % 2 == 1:
            return json.dumps({
                "action": "tool",
                "name": "write_deliverable",
                "args": {
                    "path": f"im_step{calls['n']}.md",
                    "content": f"# IM step {calls['n']}\n周报内容\n",
                    "kind": "md",
                },
            }, ensure_ascii=False)
        return json.dumps({"action": "done", "result": f"im-done-{calls['n']}"}, ensure_ascii=False)

    out = handle_inbound_text(
        root,
        "请写本周产品周报",
        mode="orchestrate",
        llm=fake_llm,
        max_turns=4,
    )
    assert out.get("mode") == "orchestrate"
    assert out.get("success") is True
    assert out.get("steps") and len(out["steps"]) >= 2
    init_bundle_workspace(root)
    files = office_toolbelt()["list_deliverables"]()
    assert files, "IM orchestrate 应落盘 deliverables"


def test_im_orchestrate_requires_topology(tmp_path, restore_data_dir):
    from fangyu.engine.im_inbound import handle_inbound_text

    root = build_from_profile("workbuddy", tmp_path / "wb-only")
    out = handle_inbound_text(root, "写周报", mode="orchestrate")
    assert out.get("success") is False
    assert "topology" in str(out.get("error") or "")
