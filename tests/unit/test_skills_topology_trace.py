"""技能包扩容、task_child trace、拓扑 depends / 并行。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from fangyu.core.materials import default_materials
from fangyu.core.skill_pack import list_factory_skill_ids, load_skill_parsed
from fangyu.core.topology_export import (
    normalize_pipeline_stages,
    stages_from_depends_edges,
    write_topology,
)
from fangyu.engine.bundle_orchestrate import run_topology
from fangyu.engine.harness_trace import read_traces


def test_factory_skill_packs_registered():
    ids = set(list_factory_skill_ids())
    for sid in (
        "explore-codebase",
        "research-web",
        "office-decompose",
        "code-review",
        "implement-and-verify",
        "multi-agent-split",
    ):
        assert sid in ids
        parsed = load_skill_parsed(sid)
        assert parsed and parsed["id"] == sid
        assert parsed["body"]

    mat = default_materials()
    active = {
        s["id"] for s in mat["skills"]
        if s.get("status") == "active"
    }
    assert "explore-codebase" in active
    assert "research-web" in active
    assert "office-decompose" in active
    assert "multi-agent-split" in active


def test_normalize_pipeline_stages_parallel():
    stages = normalize_pipeline_stages({
        "schedule": "pipeline",
        "pipeline": [
            "a",
            {"parallel": ["b", "c"]},
            "d",
        ],
    })
    assert stages == [["a"], ["b", "c"], ["d"]]

    stages2 = normalize_pipeline_stages({
        "stages": [["scout"], ["w", "x"], ["pub"]],
        "pipeline": ["ignored"],
    })
    assert stages2 == [["scout"], ["w", "x"], ["pub"]]


def test_stages_from_depends_diamond():
    stages = stages_from_depends_edges(
        [
            {"source": "scout", "target": "writer", "type": "depends"},
            {"source": "scout", "target": "analyst", "type": "depends"},
            {"source": "writer", "target": "publisher", "type": "depends"},
            {"source": "analyst", "target": "publisher", "type": "depends"},
        ],
        ["scout", "writer", "analyst", "publisher"],
    )
    assert stages == [["scout"], ["analyst", "writer"], ["publisher"]]

    stages2 = normalize_pipeline_stages({
        "agents": [
            {"id": "scout"},
            {"id": "writer", "depends_on": ["scout"]},
            {"id": "analyst", "depends_on": ["scout"]},
            {"id": "publisher", "depends_on": ["writer", "analyst"]},
        ],
        "pipeline": ["scout", "writer", "analyst", "publisher"],
        "edges": [],
    })
    assert stages2 == [["scout"], ["analyst", "writer"], ["publisher"]]


@pytest.mark.asyncio
async def test_task_child_trace(tmp_path, monkeypatch):
    from fangyu.engine.agent_loop import run_agent_loop
    from fangyu.engine.subagent_task import clear_task_sessions

    clear_task_sessions()

    class FakeWs:
        root = tmp_path / "ws"

    FakeWs.root.mkdir(parents=True)
    monkeypatch.setattr(
        "fangyu.engine.workspace.get_active_workspace",
        lambda: FakeWs(),
    )

    async def llm2(messages):
        sys = (messages[0].get("content") or "") if messages else ""
        if "只读探索子 Agent" in sys:
            return json.dumps({"action": "done", "result": "child-found"}, ensure_ascii=False)
        user_blobs = " ".join(m.get("content") or "" for m in messages)
        if "工具结果" in user_blobs or ("child-found" in user_blobs):
            return json.dumps({"action": "done", "result": "parent-done"}, ensure_ascii=False)
        return json.dumps({
            "action": "tool",
            "name": "task",
            "args": {"subagent_type": "explore", "prompt": "找入口"},
        }, ensure_ascii=False)

    out = await run_agent_loop(
        goal="parent explores",
        tools={},
        llm=llm2,
        max_turns=6,
        enable_task=True,
    )
    assert out["success"] is True
    path = FakeWs.root / ".fangyu" / "harness_trace.jsonl"
    assert path.is_file()
    rows = read_traces(path, limit=20)
    kinds = {r.get("kind") for r in rows}
    assert "task_child" in kinds
    child = next(r for r in rows if r.get("kind") == "task_child")
    assert child.get("subagent_type") == "explore"
    assert child.get("task_depth") == 1


def test_orchestrate_parallel_via_depends(tmp_path):
    from fangyu.core import config as config_mod
    from fangyu.core.agent_factory import build_from_profile

    prev = Path(config_mod.DATA_DIR)
    try:
        dest = tmp_path / "orch-par"
        # 三角模板保证 ≥3 角色，可造 scout∥ 扇出
        root = build_from_profile("multi", dest, intent="搜索分析汇总竞品报告")
        topo = json.loads((root / "config" / "topology.json").read_text(encoding="utf-8"))
        agents = topo["agents"]
        if len(agents) < 3:
            pytest.skip("需要至少 3 个拓扑角色")
        scout, a, b = agents[0]["id"], agents[1]["id"], agents[2]["id"]
        # scout 先；a∥b 并行（均 depends on scout）
        topo["edges"] = [
            {"source": scout, "target": a, "type": "depends"},
            {"source": scout, "target": b, "type": "depends"},
        ]
        topo["pipeline"] = [scout, a, b]
        topo.pop("stages", None)
        write_topology(root, topo)

        calls = {"n": 0}

        async def fake_llm(_messages):
            calls["n"] += 1
            if calls["n"] % 2 == 1:
                return json.dumps({
                    "action": "tool",
                    "name": "write_deliverable",
                    "args": {
                        "path": f"p{calls['n']}.md",
                        "content": f"# p{calls['n']}\n",
                        "kind": "md",
                    },
                }, ensure_ascii=False)
            return json.dumps({"action": "done", "result": f"done-{calls['n']}"}, ensure_ascii=False)

        out = run_topology(root, "并行起草", llm=fake_llm, max_turns=4)
        assert out["success"] is True
        assert out["topology"]["stages"] == [[scout], sorted([a, b])]
        parallel_steps = [s for s in out["steps"] if s.get("parallel_group")]
        assert len(parallel_steps) == 2
    finally:
        config_mod.set_data_dir(prev)
