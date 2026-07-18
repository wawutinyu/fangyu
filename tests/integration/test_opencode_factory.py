"""P0-5: opencode profile 工厂 → Bundle → RPC harness 真写文件。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.agent_factory import build_from_profile, list_profiles
from fangyu.core.constitution import load_constitution
from fangyu.engine.bundle_runtime import create_bundle_app
from fangyu.engine.executor import register_executors


@pytest.fixture()
def restore_data_dir():
    prev = Path(config_mod.DATA_DIR)
    yield
    config_mod.set_data_dir(prev)


def test_list_profiles_includes_opencode():
    ids = {p["id"] for p in list_profiles()}
    assert "opencode" in ids
    assert "action" in ids


def test_factory_opencode_bundle_layout(tmp_path, restore_data_dir):
    dest = tmp_path / "oc"
    root = build_from_profile("opencode", dest, name="OC-Test")
    assert (root / "config" / "toolbelt.json").is_file()
    tb = json.loads((root / "config" / "toolbelt.json").read_text(encoding="utf-8"))
    assert "write" in tb["tools"] and "shell" in tb["tools"]
    assert "task" in tb["tools"]
    assert "explore" in (tb.get("subagents") or [])
    flow = json.loads((root / "skills" / "default" / "flow.json").read_text(encoding="utf-8"))
    types = [
        (n.get("data") or {}).get("originType") or n.get("originType")
        for n in flow["nodes"]
    ]
    assert "agent-loop" in types
    loop_cfg = next(
        (n.get("config") or (n.get("data") or {}).get("config") or {})
        for n in flow["nodes"]
        if ((n.get("data") or {}).get("originType") or n.get("originType")) == "agent-loop"
    )
    assert loop_cfg.get("require_plan") is True
    assert loop_cfg.get("enable_task") is True
    assert int(loop_cfg.get("max_turns") or 0) >= 24
    assert (root / "manifest.json").is_file()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert manifest.get("profile") == "opencode"


def test_opencode_bundle_rpc_writes_file(tmp_path, restore_data_dir, monkeypatch):
    """Mock LLM：write hello.md → done；经 A2A RPC 验证落盘。"""
    register_executors()
    dest = tmp_path / "oc-rpc"
    root = build_from_profile("opencode", dest, name="OC-RPC")

    replies = [
        '{"action":"plan","steps":["write hello.md","done"]}',
        '{"action":"tool","name":"write","args":{"path":"hello.md","content":"# hi from harness"}}',
        '{"action":"done","result":"wrote hello.md"}',
    ]
    idx = {"i": 0}

    async def fake_llm(messages):
        i = idx["i"]
        idx["i"] = min(i + 1, len(replies) - 1)
        return replies[i]

    # AgentBus.run_flow 不传 global_vars 自定义 llm；patch exec_agent 构建路径
    import fangyu.engine.exec_agent as exec_agent

    async def fake_default_llm(ctx, messages):
        return await fake_llm(messages)

    monkeypatch.setattr(exec_agent, "_default_llm_from_ctx", fake_default_llm)

    app, agent_name = create_bundle_app(str(root))
    # 激活后宪法应为 coding harness
    assert "coding" in load_constitution().get("name", "").lower() or str(
        load_constitution().get("version") or ""
    ).startswith("opencode-")

    client = TestClient(app)
    rpc = client.post("/rpc", json={
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": agent_name,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "write a hello markdown"}],
                "metadata": {"skill_id": "default"},
            },
        },
        "id": 1,
    })
    assert rpc.status_code == 200
    body = rpc.json()
    assert body["result"]["status"]["state"] == "completed"
    hello = root / "workspace" / "hello.md"
    assert hello.is_file()
    assert "hi from harness" in hello.read_text(encoding="utf-8")
