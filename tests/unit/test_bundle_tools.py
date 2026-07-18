"""P0-4: Bundle workspace coding tools."""
from __future__ import annotations

import pytest

from fangyu.engine.bundle_tools import coding_toolbelt, tool_apply_patch, tool_search, tool_shell
from fangyu.engine.workspace import init_bundle_workspace


@pytest.fixture()
def ws(tmp_path):
    bundle = tmp_path / "b"
    (bundle / "workspace").mkdir(parents=True)
    init_bundle_workspace(bundle)
    return bundle


def test_search_and_patch(ws):
    tools = coding_toolbelt()
    tools["write"](path="a.py", content="x = 1\n# TODO\ny = 2\n")
    hits = tool_search(pattern="TODO", path=".")
    assert hits and hits[0]["path"] == "a.py"
    tool_apply_patch(path="a.py", old="# TODO", new="# done")
    assert "done" in tools["read"](path="a.py")
    assert "TODO" not in tools["read"](path="a.py")


def test_shell_in_workspace(ws):
    tools = coding_toolbelt()
    tools["write"](path="hi.txt", content="hello")
    out = tool_shell(command="cat hi.txt")
    assert out["exit_code"] == 0
    assert "hello" in out["stdout"]


def test_shell_deny_dangerous(ws):
    with pytest.raises(PermissionError):
        tool_shell(command="sudo rm -rf /")
