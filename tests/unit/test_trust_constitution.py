"""ATP 信任层与宪法联动测试"""
import pytest

from fangyu.engine.a2a_runtime import AgentBus, AgentRegistry
from fangyu.engine.trust_runtime import (
    TrustRegistry,
    TrustViolation,
    assert_agent_authorized,
    sync_agent_trust,
)


@pytest.fixture(autouse=True)
def _clean():
    for name in list(AgentRegistry.list_agents()):
        AgentRegistry.unregister(name["name"])
    TrustRegistry._identities.clear()
    TrustRegistry._policies.clear()
    TrustRegistry._revoked.clear()
    yield


def test_sync_agent_trust_registers_skills():
    card = {"skills": [{"id": "web_search"}, {"id": "analyze"}]}
    trust = {"enabled": True, "revocationList": []}
    info = sync_agent_trust("agent_a", card, trust)
    assert info["allowed_skills"] == ["web_search", "analyze"]
    assert TrustRegistry.authorize("agent_a", "web_search")
    assert not TrustRegistry.authorize("agent_a", "unknown_skill")


def test_assert_agent_authorized_blocks_unknown_skill():
    card = {"skills": [{"id": "web_search"}]}
    sync_agent_trust("agent_b", card, {"enabled": True, "revocationList": []})
    assert_agent_authorized("agent_b", "web_search", {"enabled": True})
    with pytest.raises(TrustViolation, match="无权"):
        assert_agent_authorized("agent_b", "hack", {"enabled": True})


def test_assert_agent_authorized_skipped_when_trust_disabled():
    assert_agent_authorized("any", "any", {"enabled": False})


def test_a2a_send_blocks_unauthorized_skill():
    card = {"skills": [{"id": "allowed_only"}]}
    trust = {"enabled": True, "revocationList": []}
    sync_agent_trust("agent_c", card, trust)
    AgentRegistry.register("agent_c", card, {}, trust=trust)

    bus = AgentBus()
    task = bus.send_message(
        "agent_c",
        {"role": "user", "parts": [{"type": "text", "text": "hi"}], "metadata": {"skill_id": "forbidden_skill"}},
    )
    assert task["status"]["state"] == "failed"
    assert task.get("violation", {}).get("type") == "trust"


def test_violation_to_dict_on_constitution():
    from fangyu.core.constitution import ConstitutionViolation, violation_to_dict

    exc = ConstitutionViolation("forbidden_action", "blocked", context={"violations": [{"rule": "forbidden_action"}]})
    payload = violation_to_dict(exc)
    assert payload["type"] == "constitution"
    assert payload["violations"]
