"""宪法 warn/deny 分级测试"""
import asyncio
import json

import pytest

from fangyu.core import constitution as const
from fangyu.engine.scheduler import run_flow


@pytest.fixture()
def temp_constitution(tmp_path, monkeypatch):
    cfile = tmp_path / "constitution.json"
    afile = tmp_path / "audit.log"
    cfile.write_text(json.dumps({
        "enabled": True,
        "forbidden_actions": [],
        "forbidden_node_types": [],
        "require_audit": False,
        "policies": [
            {
                "id": "warn-llm",
                "enabled": True,
                "when": {"node_type": "llm"},
                "assert": {"field": "config.model", "op": "nonempty"},
                "on_fail": {"rule": "policy_llm_model", "action": "warn", "message": "no model"},
            },
            {
                "id": "deny-localhost",
                "enabled": True,
                "when": {"node_type": "http"},
                "assert": {"field": "config.url", "op": "not_contains", "value": "localhost"},
                "on_fail": {"rule": "policy_ssrf", "action": "deny", "message": "blocked"},
            },
        ],
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(const, "CONSTITUTION_FILE", cfile)
    monkeypatch.setattr(const, "AUDIT_FILE", afile)
    return cfile


def test_warn_only_allows_flow(temp_constitution):
    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}, "label": "s"}},
        {"id": "l", "data": {"originType": "llm", "config": {}, "label": "llm"}},
    ]
    edges = [{"source": "s", "target": "l", "data": {}}]
    warns = const.assert_flow_allowed(nodes)
    assert len(warns) == 1
    assert warns[0]["severity"] == "warn"


def test_warn_flow_runs_with_warnings(temp_constitution):
    import asyncio
    from unittest.mock import AsyncMock, patch

    from fangyu.engine.executor import register_executors
    register_executors()

    nodes = [
        {"id": "s", "data": {"originType": "start", "config": {}, "label": "s"}},
        {"id": "l", "data": {"originType": "llm", "config": {"prompt": "hi"}, "label": "llm"}},
    ]
    edges = [{"source": "s", "target": "l", "data": {}}]
    with patch("fangyu.engine.exec_ai.chat_completion", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = {"result": "ok", "usage": {}}
        result = asyncio.run(run_flow(nodes, edges))
    assert result["success"] is True
    assert len(result.get("constitution_warnings", [])) == 1


def test_deny_blocks_flow(temp_constitution):
    nodes = [
        {"id": "h", "data": {"originType": "http", "config": {"url": "http://localhost/x"}, "label": "h"}},
    ]
    with pytest.raises(const.ConstitutionViolation):
        const.assert_flow_allowed(nodes)


def test_scan_endpoint_classifies(monkeypatch, temp_constitution):
    nodes = [
        {"id": "l", "data": {"originType": "llm", "config": {}, "label": "l"}},
        {"id": "h", "data": {"originType": "http", "config": {"url": "http://localhost"}, "label": "h"}},
    ]
    gov = const.apply_flow_governance(nodes)
    assert len(gov["warn"]) == 1
    assert len(gov["deny"]) == 1
