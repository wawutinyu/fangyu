"""端到端测试：Flow / Agent exe 编译（需 PyInstaller，较慢）。"""
from __future__ import annotations

import json
import zipfile
from io import BytesIO
from pathlib import Path

import pytest

from fangyu.core.pyinstaller_util import compile_python_to_exe
from fangyu.core.bundle_exe import build_agent_exe_zip


MINIMAL_FLOW = '''
import sys
print("flow_ok")
input("press enter")
'''

MINIMAL_SKILLS = {
    "default": {
        "nodes": [
            {"id": "s", "data": {"originType": "start", "label": "s", "config": {}}},
            {"id": "o", "data": {"originType": "output", "label": "o", "config": {}}},
        ],
        "edges": [{"id": "e1", "source": "s", "target": "o", "data": {}}],
    }
}


@pytest.mark.slow
def test_minimal_flow_exe_compile():
    exe, log = compile_python_to_exe(
        MINIMAL_FLOW,
        filename="mini_flow.py",
        exe_name="mini_flow",
        console=True,
        timeout=600,
    )
    assert exe is not None, f"compile failed:\n{log[-3000:]}"
    assert exe.is_file()
    assert exe.stat().st_size > 100_000


@pytest.mark.slow
def test_agent_exe_zip_build():
    buf, meta = build_agent_exe_zip(
        name="TestAgent",
        skills=MINIMAL_SKILLS,
        agent_card={
            "name": "TestAgent",
            "version": "1.0.0",
            "capabilities": {"streaming": False, "pushNotifications": False},
            "skills": [{"id": "default", "name": "default"}],
            "defaultInterface": {"type": "a2a"},
        },
        worker_only=True,
        agent_kind="worker",
        a2a_port=9011,
        require_envelope=False,
        trusted_peers=None,
        compile_timeout=900,
    )
    assert meta["name"] == "TestAgent"
    zf = zipfile.ZipFile(BytesIO(buf.getvalue()))
    names = zf.namelist()
    assert "README.txt" in names
    assert "compile.log" in names
    assert "TestAgent.bundle/manifest.json" in names
    if meta.get("exe_built"):
        assert any(n.endswith(".exe") or n == "TestAgent" for n in names)
    else:
        log = zf.read("compile.log").decode("utf-8", errors="replace")
        pytest.fail(f"agent exe not built:\n{log[-4000:]}")
