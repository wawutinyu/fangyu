"""外部 Agent 注册与远程 RPC 测试"""
import pytest
from fastapi.testclient import TestClient

from fangyu.core.agent_bundle import create_agent_bundle, load_agent_bundle
from fangyu.engine.a2a_runtime import AgentBus, AgentRegistry, AgentOrchestrator
from fangyu.engine.bundle_runtime import create_bundle_app
from fangyu.engine.executor import register_executors


@pytest.fixture()
def remote_bundle(tmp_path):
    dest = tmp_path / "remote-worker"
    create_agent_bundle(dest, name="RemoteWorker", require_envelope=False)
    return dest


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    for item in AgentRegistry.list_agents():
        AgentRegistry.unregister(item["name"])


def test_register_external_and_call(remote_bundle):
    register_executors()
    app, remote_name = create_bundle_app(str(remote_bundle))
    client = TestClient(app)
    health = client.get("/health").json()
    bundle = load_agent_bundle(remote_bundle)

    AgentRegistry.register_external(
        "ext_remote",
        bundle["agent_card"],
        rpc_url="http://testserver/rpc",
        agent_id=bundle["identity"]["agent_id"],
        public_key=bundle["identity"]["public_key"],
        remote_name=remote_name,
        authorized=True,
    )

    # Patch remote URL to TestClient - use direct bus with mocked remote
    # Instead test via AgentBus calling _handle_task through in-process client
    from fangyu.engine import a2a_remote
    original = a2a_remote._rpc_post

    def _mock_rpc(url, body, headers=None):
        resp = client.post("/rpc", json=body, headers=headers or {})
        data = resp.json()
        if "error" in data:
            raise RuntimeError(data["error"])
        return data.get("result", {})

    a2a_remote._rpc_post = _mock_rpc
    try:
        bus = AgentBus(enable_trust=False)
        task = bus.send_message("ext_remote", {
            "role": "user",
            "parts": [{"type": "text", "text": "external call"}],
            "metadata": {"skill_id": "default"},
        })
        assert task["status"]["state"] == "completed"
    finally:
        a2a_remote._rpc_post = original


def test_external_unauthorized_rejected(remote_bundle):
    register_executors()
    bundle = load_agent_bundle(remote_bundle)
    AgentRegistry.register_external(
        "ext_blocked",
        bundle["agent_card"],
        rpc_url="http://127.0.0.1:9999/rpc",
        agent_id=bundle["identity"]["agent_id"],
        public_key=bundle["identity"]["public_key"],
        authorized=False,
    )
    bus = AgentBus(enable_trust=False)
    task = bus.send_message("ext_blocked", {
        "role": "user",
        "parts": [{"type": "text", "text": "hi"}],
        "metadata": {"skill_id": "default"},
    })
    assert task["status"]["state"] == "failed"
    assert "授权" in task["status"]["message"]


def test_orchestrator_mixed_local_and_external(remote_bundle):
    register_executors()
    app, remote_name = create_bundle_app(str(remote_bundle))
    client = TestClient(app)
    bundle = load_agent_bundle(remote_bundle)

    AgentRegistry.register(
        "local_a",
        {"name": "Local A", "skills": [{"id": "step_a"}]},
        {"step_a": {
            "nodes": [
                {"id": "s", "data": {"originType": "start", "config": {}, "label": "s"}},
                {"id": "c", "data": {"originType": "code", "config": {"code": "result = 'L:' + str(_input if not isinstance(_input, dict) else _input.get('query',''))"}, "label": "c"}},
            ],
            "edges": [{"source": "s", "target": "c", "data": {}}],
        }},
    )
    AgentRegistry.register_external(
        "ext_b",
        bundle["agent_card"],
        rpc_url="http://testserver/rpc",
        agent_id=bundle["identity"]["agent_id"],
        public_key=bundle["identity"]["public_key"],
        remote_name=remote_name,
        authorized=True,
    )

    from fangyu.engine import a2a_remote
    original = a2a_remote._rpc_post

    def _mock_rpc(url, body, headers=None):
        resp = client.post("/rpc", json=body, headers=headers or {})
        data = resp.json()
        if "error" in data:
            raise RuntimeError(data["error"])
        return data.get("result", {})

    a2a_remote._rpc_post = _mock_rpc
    try:
        orch = AgentOrchestrator(AgentBus(enable_trust=False))
        result = orch.run_pipeline("hello", [
            {"agent": "local_a", "skill_id": "step_a", "label": "本地"},
            {"agent": "ext_b", "skill_id": "default", "label": "外部"},
        ])
        assert result["success"] is True
        assert len(result["steps"]) == 2
        assert result["steps"][0]["output"] == "L:hello"
        assert result["steps"][1]["state"] == "completed"
    finally:
        a2a_remote._rpc_post = original
