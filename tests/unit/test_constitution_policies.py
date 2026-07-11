"""宪法可组合策略测试"""
import json

import pytest

from fangyu.core import constitution as const


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
                "id": "limit-loop",
                "enabled": True,
                "when": {"node_type": "loop"},
                "assert": {"field": "config.max_iterations", "op": "lte", "value": 100},
                "on_fail": {"rule": "policy_loop_limit", "message": "循环超限 {actual}"},
            },
            {
                "id": "block-localhost",
                "enabled": True,
                "when": {"node_type": "http"},
                "assert": {"field": "config.url", "op": "not_contains", "value": "localhost"},
                "on_fail": {"rule": "policy_ssrf", "message": "禁止 localhost"},
            },
        ],
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(const, "CONSTITUTION_FILE", cfile)
    monkeypatch.setattr(const, "AUDIT_FILE", afile)
    return cfile


def test_policy_blocks_high_loop_iterations(temp_constitution):
    nodes = [{"id": "l1", "data": {"originType": "loop", "config": {"max_iterations": 500}}}]
    violations = const.scan_flow(nodes)
    assert any(v["rule"] == "policy_loop_limit" for v in violations)


def test_policy_allows_low_loop_iterations(temp_constitution):
    nodes = [{"id": "l1", "data": {"originType": "loop", "config": {"max_iterations": 50}}}]
    violations = const.scan_flow(nodes)
    assert not any(v.get("policy_id") == "limit-loop" for v in violations)


def test_policy_blocks_localhost_http(temp_constitution):
    nodes = [{"id": "h1", "data": {"originType": "http", "config": {"url": "http://localhost:8000"}}}]
    violations = const.scan_flow(nodes)
    assert any(v["rule"] == "policy_ssrf" for v in violations)


def test_policy_and_legacy_both_apply(temp_constitution, monkeypatch):
    cfile = temp_constitution
    data = json.loads(cfile.read_text(encoding="utf-8"))
    data["forbidden_actions"] = ["shell_execution"]
    cfile.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    nodes = [
        {"id": "t", "data": {"originType": "tool-call", "config": {"tool_name": "shell_execution"}}},
        {"id": "h", "data": {"originType": "http", "config": {"url": "http://localhost/x"}}},
    ]
    violations = const.scan_flow(nodes)
    rules = {v["rule"] for v in violations}
    assert "forbidden_action" in rules
    assert "policy_ssrf" in rules
