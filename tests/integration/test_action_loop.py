"""Action Loop + workspace 集成测试"""
import pytest
from fastapi.testclient import TestClient

from fangyu.core.action_loop import get_action_loop_flow
from fangyu.core.agent_bundle import create_agent_bundle
from fangyu.engine.bundle_runtime import create_bundle_app
from fangyu.engine.executor import register_executors
from fangyu.engine.scheduler import run_flow
from fangyu.engine.workspace import init_bundle_workspace
import asyncio


@pytest.fixture()
def worker_bundle(tmp_path):
    dest = tmp_path / "action-worker"
    create_agent_bundle(dest, name="ActionWorker", worker_only=True, require_envelope=False)
    return dest


def test_action_loop_flow_writes_workspace(tmp_path):
    register_executors()
    init_bundle_workspace(tmp_path)
    flow = get_action_loop_flow()
    result = asyncio.run(run_flow(
        nodes=flow["nodes"],
        edges=flow["edges"],
        external_inputs={"query": "build report"},
    ))
    assert result["success"] is True
    from fangyu.engine.workspace import get_active_workspace
    ws = get_active_workspace()
    assert ws is not None
    assert ws.read("result.txt") == "done: build report"
    state = ws.load_state()
    assert state.get("verified") is True


def test_bundle_action_loop_via_rpc(worker_bundle):
    register_executors()
    app, agent_name = create_bundle_app(str(worker_bundle))
    client = TestClient(app)

    rpc = client.post("/rpc", json={
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": agent_name,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "ship feature"}],
                "metadata": {"skill_id": "default"},
            },
        },
        "id": 1,
    })
    assert rpc.status_code == 200
    body = rpc.json()
    assert body["result"]["status"]["state"] == "completed"
    result_file = worker_bundle / "workspace" / "result.txt"
    assert result_file.exists()
    assert "ship feature" in result_file.read_text(encoding="utf-8")

    health = client.get("/health").json()
    assert "workspace" in health
