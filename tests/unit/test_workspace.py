"""Workspace 单元测试"""
import pytest

from fangyu.engine.workspace import AgentWorkspace, WorkspaceError, init_bundle_workspace, workspace_helpers


def test_workspace_read_write_list(tmp_path):
    ws = AgentWorkspace(tmp_path / "ws")
    ws.write("notes/hello.txt", "world")
    assert ws.read("notes/hello.txt") == "world"
    names = ws.list(".")
    assert "notes" in names


def test_workspace_path_traversal_blocked(tmp_path):
    ws = AgentWorkspace(tmp_path / "ws")
    with pytest.raises(WorkspaceError):
        ws.read("../secret.txt")


def test_workspace_state_persistence(tmp_path):
    ws = AgentWorkspace(tmp_path / "ws")
    ws.save_state({"step": 2, "goal": "test"})
    assert ws.load_state()["step"] == 2


def test_init_bundle_workspace_helpers(tmp_path):
    bundle = tmp_path / "agent"
    bundle.mkdir()
    init_bundle_workspace(bundle)
    helpers = workspace_helpers()
    assert "ws_write" in helpers
    helpers["ws_write"]("out.txt", "ok")
    assert helpers["ws_read"]("out.txt") == "ok"
