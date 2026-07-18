"""P2 编排边 ACL。"""
from __future__ import annotations

import pytest

from fangyu.core.constitution import read_audit_log, refresh_data_paths
from fangyu.core.topology_acl import (
    TopologyACLError,
    assert_stage_handoff_allowed,
    assert_topology_edge_allowed,
    edge_acl_enabled,
)
from fangyu.engine.a2a_runtime import AgentBus, AgentOrchestrator, AgentRegistry


def _clear_agents(*names: str) -> None:
    for name in names:
        AgentRegistry.unregister(name)


def _topo_deny_writer_from_hacker() -> dict:
    return {
        "version": "1.0",
        "agents": [
            {"id": "scout", "name": "Scout"},
            {"id": "writer", "name": "Writer"},
        ],
        "edges": [
            {
                "source": "scout",
                "target": "writer",
                "type": "depends",
                "acl": {"allowed_callers": ["scout"], "deny_callers": ["hacker"]},
            }
        ],
        "pipeline": ["scout", "writer"],
    }


def test_default_allow_without_acl():
    topo = {
        "agents": [{"id": "a"}, {"id": "b"}],
        "edges": [{"source": "a", "target": "b", "type": "depends"}],
        "pipeline": ["a", "b"],
    }
    assert edge_acl_enabled(topo) is False
    assert_topology_edge_allowed("a", "b", topology=topo)
    assert_topology_edge_allowed("hacker", "b", topology=topo)


def test_edge_acl_allows_listed_caller():
    topo = _topo_deny_writer_from_hacker()
    assert edge_acl_enabled(topo) is True
    assert_topology_edge_allowed("scout", "writer", topology=topo)


def test_edge_acl_denies_and_audits(tmp_path):
    from fangyu.core import config as config_mod

    config_mod.set_data_dir(tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    refresh_data_paths()

    topo = _topo_deny_writer_from_hacker()
    with pytest.raises(TopologyACLError) as ei:
        assert_topology_edge_allowed("hacker", "writer", topology=topo)
    assert "hacker" in str(ei.value)
    log = read_audit_log(limit=40)
    assert any(e.get("event") == "edge_acl_violation" for e in log)


def test_stage_handoff_blocks():
    topo = _topo_deny_writer_from_hacker()
    with pytest.raises(TopologyACLError):
        assert_stage_handoff_allowed(["hacker"], ["writer"], topology=topo)
    assert_stage_handoff_allowed(["scout"], ["writer"], topology=topo)


def test_top_level_rules_deny():
    topo = {
        "edge_acl": {
            "enabled": True,
            "rules": [{"caller": "x", "callee": "y", "effect": "deny"}],
        },
        "agents": [{"id": "x"}, {"id": "y"}],
        "edges": [],
    }
    with pytest.raises(TopologyACLError):
        assert_topology_edge_allowed("x", "y", topology=topo)


def test_bus_send_respects_topology_edge_acl():
    _clear_agents("writer", "scout", "hacker")
    AgentRegistry.register("writer", {"name": "writer", "skills": [{"id": "default"}]})
    bus = AgentBus(enable_trust=False)
    topo = _topo_deny_writer_from_hacker()
    task = bus.send_message(
        "writer",
        {
            "role": "user",
            "parts": [{"type": "text", "text": "hi"}],
            "metadata": {"skill_id": "default", "from_agent": "hacker", "topology": topo},
        },
        from_agent="hacker",
        topology=topo,
    )
    assert (task.get("status") or {}).get("state") == "failed"
    assert task.get("violation")
    assert "hacker" in (task.get("status") or {}).get("message", "")


def test_orchestrator_pipeline_edge_acl():
    _clear_agents("writer", "scout", "hacker")
    AgentRegistry.register("scout", {"name": "scout", "skills": [{"id": "default"}]})
    AgentRegistry.register("writer", {"name": "writer", "skills": [{"id": "default"}]})
    orch = AgentOrchestrator(AgentBus(enable_trust=False))
    topo = _topo_deny_writer_from_hacker()
    ok = orch.run_pipeline(
        "q",
        [{"agent": "scout"}, {"agent": "writer"}],
        topology=topo,
    )
    assert ok.get("success") is True

    AgentRegistry.register("hacker", {"name": "hacker", "skills": [{"id": "default"}]})
    bad = orch.run_pipeline(
        "q",
        [{"agent": "hacker"}, {"agent": "writer"}],
        topology=topo,
    )
    assert bad.get("success") is False
    assert bad.get("violation") or "不可调用" in str(bad.get("error") or "")
