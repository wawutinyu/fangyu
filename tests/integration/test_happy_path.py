"""Phase 5 Happy Path 集成测试"""
import json

import pytest
from fastapi.testclient import TestClient

from fangyu.core.agent_bundle import add_trusted_peer, create_agent_bundle, get_public_identity, load_agent_bundle
from fangyu.engine.bundle_a2a_client import identity_from_bundle, rpc_call, sign_rpc_body
from fangyu.engine.bundle_runtime import create_bundle_app
from fangyu.engine.executor import register_executors


@pytest.fixture()
def worker_bundle(tmp_path):
    dest = tmp_path / "worker"
    create_agent_bundle(dest, name="Worker", worker_only=True, require_envelope=True)
    return dest


@pytest.fixture()
def caller_bundle(tmp_path):
    dest = tmp_path / "caller"
    create_agent_bundle(dest, name="Caller", worker_only=True, require_envelope=True)
    return dest


def test_identity_public_endpoint(worker_bundle):
    register_executors()
    app, _ = create_bundle_app(str(worker_bundle))
    client = TestClient(app)
    resp = client.get("/identity/public")
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_id"].startswith("fyu:agent:")
    assert len(body["public_key"]) > 20
    assert body["require_envelope"] is True


def test_health_includes_daemon_fields(worker_bundle):
    register_executors()
    app, _ = create_bundle_app(str(worker_bundle))
    client = TestClient(app)
    health = client.get("/health").json()
    assert health["mode"] == "daemon"
    assert "uptime_sec" in health
    assert "public_key" in health


def test_add_trusted_peer_idempotent(worker_bundle, caller_bundle):
    caller_ident = get_public_identity(load_agent_bundle(caller_bundle))
    add_trusted_peer(worker_bundle, caller_ident["agent_id"], caller_ident["public_key"])
    add_trusted_peer(worker_bundle, caller_ident["agent_id"], caller_ident["public_key"])
    cfg = json.loads((worker_bundle / "config" / "interfaces.json").read_text(encoding="utf-8"))
    peers = cfg["trust_policy"]["trusted_peers"]
    assert len([p for p in peers if p["agent_id"] == caller_ident["agent_id"]]) == 1


def test_happy_path_cross_bundle_rpc(worker_bundle, caller_bundle):
    register_executors()
    caller_ident = get_public_identity(load_agent_bundle(caller_bundle))
    worker_ident = get_public_identity(load_agent_bundle(worker_bundle))
    add_trusted_peer(worker_bundle, caller_ident["agent_id"], caller_ident["public_key"])

    app_w, name_w = create_bundle_app(str(worker_bundle))
    client_w = TestClient(app_w)
    caller = load_agent_bundle(caller_bundle)
    agent_id, identity = identity_from_bundle(caller)

    body = {
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": name_w,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "happy path"}],
                "metadata": {"skill_id": "default"},
            },
        },
        "id": 1,
    }
    envelope = sign_rpc_body(body, agent_id, identity)
    resp = client_w.post("/rpc", json=body, headers={"X-A2A-Envelope": json.dumps(envelope)})
    assert resp.status_code == 200
    assert resp.json()["result"]["status"]["state"] == "completed"
    assert client_w.get("/health").json()["tasks_total"] >= 1

    # sanity: worker identity available for reverse trust setup
    assert worker_ident["agent_id"].startswith("fyu:agent:")
