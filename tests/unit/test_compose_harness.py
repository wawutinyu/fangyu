"""平台能力：不靠 agent-loop，用 loop(until_done)+tool-round 拼出可写 workspace 的 harness。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from fangyu.core import config as config_mod
from fangyu.engine.executor import register_executors, run_flow
from fangyu.engine.harness_round import DONE_KEY, STATE_KEY
from fangyu.engine.workspace import get_active_workspace, init_bundle_workspace


@pytest.fixture()
def restore_data_dir():
    prev = Path(config_mod.DATA_DIR)
    yield
    config_mod.set_data_dir(prev)


@pytest.fixture(autouse=True)
def _executors():
    register_executors()


@pytest.mark.asyncio
async def test_compose_until_done_tool_round_writes_workspace(tmp_path, restore_data_dir):
    config_mod.set_data_dir(tmp_path / "data")
    ws = tmp_path / "project"
    ws.mkdir()
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    (bundle / "config").mkdir()
    init_bundle_workspace(bundle, workspace_override=ws)

    calls = {"n": 0}

    async def fake_llm(_messages):
        calls["n"] += 1
        if calls["n"] == 1:
            return json.dumps({"action": "plan", "steps": ["写 hello.md", "结束"]}, ensure_ascii=False)
        if calls["n"] == 2:
            return json.dumps({
                "action": "tool",
                "name": "write",
                "args": {"path": "hello.md", "content": "compose-harness-ok\n"},
            }, ensure_ascii=False)
        return json.dumps({"action": "done", "result": "写好了"}, ensure_ascii=False)

    nodes = [
        {
            "id": "n1",
            "data": {
                "originType": "input",
                "label": "任务",
                "config": {"default_value": "写 hello.md"},
            },
        },
        {
            "id": "until",
            "data": {
                "originType": "loop",
                "label": "直到完成",
                "config": {"mode": "until_done", "max_turns": 8},
                # 无 inner：默认每轮 tool-round（也可换成自拼子图）
            },
        },
        {
            "id": "o",
            "data": {"originType": "output", "label": "输出", "config": {}},
        },
    ]
    edges = [
        {"source": "n1", "target": "until", "data": {"linkType": "serial"}},
        {"source": "until", "target": "o", "data": {"linkType": "serial"}},
    ]

    out = await run_flow(
        nodes=nodes,
        edges=edges,
        external_inputs={},
        global_vars={
            "_harness_llm": fake_llm,
            "_bundle_root": str(bundle),
            "workspace_path": str(ws),
        },
    )
    assert out.get("success") is True
    assert (ws / "hello.md").is_file()
    assert "compose-harness-ok" in (ws / "hello.md").read_text(encoding="utf-8")
    # 证明路径未使用 agent-loop 节点
    types = [((n.get("data") or {}).get("originType")) for n in nodes]
    assert "agent-loop" not in types
    assert get_active_workspace() is not None


@pytest.mark.asyncio
async def test_compose_with_inner_tool_round(tmp_path, restore_data_dir):
    config_mod.set_data_dir(tmp_path / "data")
    ws = tmp_path / "project2"
    ws.mkdir()
    bundle = tmp_path / "bundle2"
    (bundle / "config").mkdir(parents=True)
    init_bundle_workspace(bundle, workspace_override=ws)

    calls = {"n": 0}

    async def fake_llm(_messages):
        calls["n"] += 1
        if calls["n"] == 1:
            return json.dumps({"action": "plan", "steps": ["写文件"]}, ensure_ascii=False)
        if calls["n"] == 2:
            return json.dumps({
                "action": "tool",
                "name": "write",
                "args": {"path": "inner.md", "content": "inner-ok\n"},
            }, ensure_ascii=False)
        return json.dumps({"action": "done", "result": "ok"}, ensure_ascii=False)

    nodes = [
        {
            "id": "n1",
            "data": {"originType": "input", "config": {"default_value": "写 inner.md"}},
        },
        {
            "id": "until",
            "data": {
                "originType": "loop",
                "config": {"mode": "until_done", "max_turns": 6},
                "inner_nodes": [
                    {
                        "id": "tr",
                        "originType": "tool-round",
                        "config": {"toolbelt": "coding", "require_plan": True},
                    },
                ],
                "inner_links": [],
            },
        },
        {"id": "o", "data": {"originType": "output", "config": {}}},
    ]
    edges = [
        {"source": "n1", "target": "until", "data": {}},
        {"source": "until", "target": "o", "data": {}},
    ]
    out = await run_flow(
        nodes=nodes,
        edges=edges,
        global_vars={
            "_harness_llm": fake_llm,
            "_bundle_root": str(bundle),
            "workspace_path": str(ws),
        },
    )
    assert out.get("success") is True
    assert (ws / "inner.md").read_text(encoding="utf-8").startswith("inner-ok")
