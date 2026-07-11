"""宪法层测试"""
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from fangyu.core import constitution as const


@pytest.fixture()
def temp_constitution(tmp_path, monkeypatch):
    cfile = tmp_path / "constitution.json"
    afile = tmp_path / "audit.log"
    cfile.write_text(json.dumps({
        "enabled": True,
        "forbidden_actions": ["shell_execution", "file_operations"],
        "forbidden_node_types": ["danger-node"],
        "require_audit": True,
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(const, "CONSTITUTION_FILE", cfile)
    monkeypatch.setattr(const, "AUDIT_FILE", afile)
    return cfile, afile


def test_scan_flow_detects_forbidden_tool(temp_constitution):
    nodes = [
        {
            "id": "t1",
            "data": {
                "originType": "tool-call",
                "label": "Shell",
                "config": {"tool_name": "shell_execution"},
            },
        }
    ]
    violations = const.scan_flow(nodes)
    assert len(violations) == 1
    assert violations[0]["rule"] == "forbidden_action"


def test_assert_flow_allowed_raises(temp_constitution):
    nodes = [{"id": "x", "data": {"originType": "danger-node", "config": {}}}]
    with pytest.raises(const.ConstitutionViolation):
        const.assert_flow_allowed(nodes)


def test_check_tool_allowed_blocks_forbidden(temp_constitution):
    with pytest.raises(const.ConstitutionViolation, match="shell_execution"):
        const.check_tool_allowed("shell_execution")


def test_audit_log_written(temp_constitution):
    _, afile = temp_constitution
    const.audit_event("test_event", {"foo": "bar"})
    lines = afile.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["event"] == "test_event"
    assert entry["details"]["foo"] == "bar"


def test_run_flow_blocked_by_constitution(temp_constitution):
    import asyncio
    from fangyu.engine.scheduler import run_flow

    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}, "label": "开始"}},
        {
            "id": "t",
            "data": {
                "originType": "tool-call",
                "config": {"tool_name": "file_operations"},
                "label": "文件",
            },
        },
    ]
    edges = [{"source": "s", "target": "t", "data": {}}]
    result = asyncio.run(run_flow(nodes, edges))
    assert result["success"] is False
    assert result.get("constitution_violation") is True
    assert "file_operations" in result["error"]
