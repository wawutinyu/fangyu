"""Agent Bundle 运行时集成测试"""
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core.agent_bundle import create_agent_bundle, load_agent_bundle
from fangyu.engine.bundle_a2a_client import identity_from_bundle, rpc_call, sign_rpc_body
from fangyu.engine.bundle_runtime import create_bundle_app
from fangyu.engine.executor import register_executors


def _rpc(url: str, method: str, params: dict | None = None) -> dict:
    payload = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": "t1"}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "error" in data:
        raise RuntimeError(data["error"])
    return data.get("result", {})


def _wait_health(url: str, timeout: float = 15.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.3)
    raise TimeoutError(f"bundle server not ready: {url}")


@pytest.fixture()
def worker_bundle(tmp_path):
    dest = tmp_path / "demo-worker"
    create_agent_bundle(dest, name="DemoWorker", worker_only=True, a2a_port=0, require_envelope=False)
    return dest


@pytest.fixture()
def secured_bundle(tmp_path):
    dest = tmp_path / "secured-worker"
    create_agent_bundle(dest, name="SecuredWorker", worker_only=True, a2a_port=0, require_envelope=True)
    return dest


def test_bundle_runtime_inprocess(worker_bundle):
    """进程内启动 bundle app 并调用 skill（无信封模式）。"""
    register_executors()
    app, agent_name = create_bundle_app(str(worker_bundle))
    client = TestClient(app)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["agent"] == "DemoWorker"

    rpc = client.post("/rpc", json={
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": agent_name,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "hello bundle"}],
                "metadata": {"skill_id": "default"},
            },
        },
        "id": 1,
    })
    assert rpc.status_code == 200
    body = rpc.json()
    assert "result" in body
    assert body["result"]["status"]["state"] == "completed"


def test_bundle_envelope_required(secured_bundle):
    """require_envelope=true 时无信封应拒绝。"""
    register_executors()
    app, agent_name = create_bundle_app(str(secured_bundle))
    client = TestClient(app)

    rpc = client.post("/rpc", json={
        "jsonrpc": "2.0",
        "method": "a2a.list_agents",
        "params": {},
        "id": 1,
    })
    assert rpc.status_code == 200
    assert "error" in rpc.json()
    assert rpc.json()["error"]["code"] == 403


def test_bundle_signed_rpc(secured_bundle):
    """require_envelope=true 时带签名信封可调用。"""
    register_executors()
    bundle = load_agent_bundle(secured_bundle)
    agent_id, identity = identity_from_bundle(bundle)
    app, agent_name = create_bundle_app(str(secured_bundle))
    client = TestClient(app)

    body = {
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": agent_name,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "signed hello"}],
                "metadata": {"skill_id": "default"},
            },
        },
        "id": 1,
    }
    envelope = sign_rpc_body(body, agent_id, identity)
    rpc = client.post("/rpc", json=body, headers={"X-A2A-Envelope": json.dumps(envelope)})
    assert rpc.status_code == 200
    assert rpc.json()["result"]["status"]["state"] == "completed"


def test_cross_bundle_encrypted_rpc(tmp_path):
    """两个 bundle 互设 trusted_peers 后加密 RPC。"""
    register_executors()
    bundle_a = tmp_path / "agent-a"
    bundle_b = tmp_path / "agent-b"
    create_agent_bundle(bundle_a, name="AgentA", require_envelope=True)
    create_agent_bundle(bundle_b, name="AgentB", require_envelope=True)

    loaded_a = load_agent_bundle(bundle_a)
    loaded_b = load_agent_bundle(bundle_b)
    id_a, ident_a = identity_from_bundle(loaded_a)
    id_b, ident_b = identity_from_bundle(loaded_b)

    # 互加 trusted_peers
    for path, peer_id, peer_pk in [
        (bundle_a / "config" / "interfaces.json", id_b, loaded_b["identity"]["public_key"]),
        (bundle_b / "config" / "interfaces.json", id_a, loaded_a["identity"]["public_key"]),
    ]:
        cfg = json.loads(path.read_text(encoding="utf-8"))
        cfg["trust_policy"]["trusted_peers"] = [{"agent_id": peer_id, "public_key": peer_pk}]
        path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

    app_b, name_b = create_bundle_app(str(bundle_b))
    client_b = TestClient(app_b)

    body = {
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": name_b,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "cross bundle"}],
                "metadata": {"skill_id": "default"},
            },
        },
        "id": "x1",
    }
    envelope = sign_rpc_body(body, id_a, ident_a)
    resp = client_b.post("/rpc", json=body, headers={"X-A2A-Envelope": json.dumps(envelope)})
    assert resp.status_code == 200
    assert resp.json()["result"]["status"]["state"] == "completed"


@pytest.mark.skipif(sys.platform == "win32", reason="subprocess port binding flaky on CI Windows")
def test_bundle_cli_subprocess(worker_bundle):
    """子进程 run-bundle + RPC（非 Windows CI）。"""
    import socket
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    proc = subprocess.Popen(
        [sys.executable, "-m", "fangyu", "--run-bundle", str(worker_bundle), "--port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        _wait_health(f"http://127.0.0.1:{port}/health")
        task = _rpc(f"http://127.0.0.1:{port}/rpc", "a2a.send_message", {
            "targetAgent": "DemoWorker",
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "subprocess test"}],
                "metadata": {"skill_id": "default"},
            },
        })
        assert task["status"]["state"] == "completed"
    finally:
        proc.terminate()
        proc.wait(timeout=10)
