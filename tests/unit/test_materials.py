"""工厂原料注册表与 P0 工具。"""
from __future__ import annotations

import json

from fangyu.core.materials import (
    default_materials,
    load_materials,
    merge_materials,
    role_tool_ids,
    tool_ids_for_belt,
    write_materials,
)
from fangyu.engine.bundle_tools import coding_toolbelt, resolve_toolbelt, tool_glob, tool_question
from fangyu.engine.workspace import init_bundle_workspace


def test_default_materials_has_web_and_scout():
    mat = default_materials()
    ids = {t["id"] for t in mat["tools"]}
    assert {"webfetch", "websearch", "glob", "grep", "question", "task"} <= ids
    assert "scout" in {r["id"] for r in mat["roles"]}
    assert "webfetch" in role_tool_ids("scout", mat)


def test_merge_materials_overlay():
    base = default_materials()
    overlay = {"tools": [{"id": "webfetch", "belts": ["coding", "scout", "custom"]}]}
    merged = merge_materials(base, overlay)
    wf = next(t for t in merged["tools"] if t["id"] == "webfetch")
    assert "custom" in wf["belts"]


def test_write_and_load_bundle_materials(tmp_path):
    root = tmp_path / "b"
    root.mkdir()
    write_materials(root)
    assert (root / "config" / "materials.json").is_file()
    doc = load_materials(root)
    assert doc["version"] == "1.0"
    assert "glob" in tool_ids_for_belt("coding", doc)


def test_coding_toolbelt_includes_p0_materials():
    tools = coding_toolbelt()
    for name in ("glob", "grep", "webfetch", "websearch", "question"):
        assert name in tools
    resolved = resolve_toolbelt("coding")
    assert "webfetch" in resolved and "task" not in resolved  # task runtime-only


def test_glob_and_question(tmp_path):
    root = tmp_path / "b"
    (root / "workspace" / "pkg").mkdir(parents=True)
    (root / "workspace" / "pkg" / "a.py").write_text("x=1\n", encoding="utf-8")
    (root / "workspace" / "readme.md").write_text("# hi\n", encoding="utf-8")
    init_bundle_workspace(root)
    files = tool_glob("**/*.py")
    assert any(p.endswith("a.py") for p in files)
    q = tool_question(prompt="继续吗？", options="是|否")
    assert q["status"] == "needs_user"
    log = root / "workspace" / ".fangyu" / "questions.jsonl"
    assert log.is_file()
    assert "继续吗" in log.read_text(encoding="utf-8")


def test_factory_writes_materials(tmp_path):
    from fangyu.core.agent_factory import build_from_profile

    root = build_from_profile("opencode", tmp_path / "oc", name="Mat")
    mat_path = root / "config" / "materials.json"
    assert mat_path.is_file()
    mat = json.loads(mat_path.read_text(encoding="utf-8"))
    tb = json.loads((root / "config" / "toolbelt.json").read_text(encoding="utf-8"))
    assert "webfetch" in tb["tools"] and "glob" in tb["tools"]
    assert "scout" in tb.get("subagents", [])
    assert mat.get("version")
