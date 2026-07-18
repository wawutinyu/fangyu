"""毕业路径 A：workspace 绑定 + bundle chat。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from fangyu.core import config as config_mod
from fangyu.core.agent_factory import build_from_profile
from fangyu.engine.bundle_chat import chat_once, prepare_bundle_chat
from fangyu.engine.bundle_session import load_chat
from fangyu.engine.workspace import bind_external_workspace, init_bundle_workspace, resolve_workspace_root


@pytest.fixture()
def restore_data_dir():
    prev = Path(config_mod.DATA_DIR)
    yield
    config_mod.set_data_dir(prev)


def test_bind_external_workspace(tmp_path, restore_data_dir):
    project = tmp_path / "myproj"
    project.mkdir()
    (project / "README.md").write_text("hello", encoding="utf-8")
    dest = tmp_path / "bundle"
    root = build_from_profile("opencode", dest, name="WS", workspace=project)
    cfg = json.loads((root / "config" / "workspace.json").read_text(encoding="utf-8"))
    assert Path(cfg["path"]) == project.resolve()
    assert resolve_workspace_root(root) == project.resolve()
    ws = init_bundle_workspace(root)
    assert ws.root == project.resolve()
    assert ws.read("README.md") == "hello"


def test_bundle_chat_writes_file_and_session(tmp_path, restore_data_dir):
    project = tmp_path / "repo"
    project.mkdir()
    dest = tmp_path / "oc"
    build_from_profile("opencode", dest, name="ChatBot", workspace=project)

    replies = [
        '{"action":"tool","name":"write","args":{"path":"note.txt","content":"from chat"}}',
        '{"action":"done","result":"ok wrote note.txt"}',
    ]
    idx = {"i": 0}

    async def fake_llm(_messages):
        i = idx["i"]
        idx["i"] = min(i + 1, len(replies) - 1)
        return replies[i]

    out = chat_once(dest, "write note.txt", workspace=project, llm=fake_llm)
    assert out["success"] is True
    assert (project / "note.txt").read_text(encoding="utf-8") == "from chat"
    hist = load_chat()
    assert len(hist) >= 2
    assert hist[-2]["role"] == "user"
    assert hist[-1]["role"] == "assistant"
