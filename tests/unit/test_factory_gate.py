"""出厂门禁：Agent Card、技能渐进披露、MCP * 展开。"""
from __future__ import annotations

from fangyu.core.agent_card import validate_agent_card, write_well_known_agent_card
from fangyu.core.agent_factory import build_from_profile
from fangyu.core.materials import default_materials
from fangyu.core.skill_pack import append_skills_to_system, load_skill_parsed, tool_skill_load
from fangyu.engine.bundle_tools import _expand_mcp_tool_names, resolve_toolbelt


def test_validate_agent_card_ok_and_bad():
    good = {
        "name": "X",
        "version": "1.0.0",
        "skills": [{"id": "default"}],
        "interfaces": {"a2a": {"enabled": True, "url": "http://127.0.0.1:9001/rpc"}},
        "defaultInterface": {"type": "a2a", "url": "http://127.0.0.1:9001/rpc"},
    }
    assert validate_agent_card(good) == []
    assert validate_agent_card({"name": "X"}) != []


def test_export_writes_well_known(tmp_path):
    root = build_from_profile("opencode", tmp_path / "g", name="Gate")
    well = root / ".well-known" / "agent-card.json"
    assert well.is_file()
    assert "Gate" in well.read_text(encoding="utf-8")


def test_skill_frontmatter_and_progressive_disclosure():
    parsed = load_skill_parsed("implement-and-verify")
    assert parsed and parsed["id"] == "implement-and-verify"
    assert "验证" in parsed["body"]
    assert parsed["description"]
    sys = append_skills_to_system("BASE", default_materials())
    assert "工厂技能目录" in sys
    assert "skill_load" in sys
    assert "反例" not in sys  # 全文未灌入
    loaded = tool_skill_load("implement-and-verify")
    assert loaded["ok"] is True
    assert "反例" in loaded["body"]
    split = load_skill_parsed("multi-agent-split")
    assert split and ("拓扑" in split["body"] or "topology" in split["body"].lower())


def test_depends_stages_in_exported_multi(tmp_path):
    from fangyu.core.topology_export import load_topology, normalize_pipeline_stages

    root = build_from_profile("multi", tmp_path / "m", intent="搜索分析汇总本周竞品")
    topo = load_topology(root)
    assert any(
        (e.get("type") or e.get("label")) == "depends"
        for e in (topo.get("edges") or [])
    )
    stages = normalize_pipeline_stages(topo)
    assert len(stages) >= 2


def test_mcp_star_expand():
    names = _expand_mcp_tool_names("__internal__")
    assert "current_time" in names
    assert len(names) >= 3
    mat = default_materials()
    mat = {
        **mat,
        "mcp": [{"id": "__internal__", "tools": "*"}],
    }
    tools = resolve_toolbelt("coding", materials=mat)
    assert "mcp_current_time" in tools
    # * 展开后应多于仅 current_time 的默认配置
    mcp_keys = [k for k in tools if k.startswith("mcp_")]
    assert len(mcp_keys) >= 3
