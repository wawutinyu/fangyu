"""A2A discover 增强测试"""
import pytest
from fastapi.testclient import TestClient

from fangyu.core.agent_bundle import create_agent_bundle
from fangyu.engine.bundle_runtime import create_bundle_app
from fangyu.engine.executor import register_executors


@pytest.fixture()
def remote_bundle(tmp_path):
    dest = tmp_path / "remote"
    create_agent_bundle(dest, name="RemoteAgent", require_envelope=True)
    return dest


def test_identity_public_endpoint(remote_bundle):
    register_executors()
    app, _ = create_bundle_app(str(remote_bundle))
    client = TestClient(app)
    ident = client.get("/identity/public").json()
    health = client.get("/health").json()
    assert health["agent_id"] == ident["agent_id"]
    assert ident["public_key"]
    assert ident["require_envelope"] is True


def test_fetch_remote_identity_from_running_server(remote_bundle):
    from fangyu.engine.a2a_remote import fetch_remote_card, fetch_remote_identity
    import socket
    import threading
    import time
    import uvicorn

    register_executors()
    bundle_app, _ = create_bundle_app(str(remote_bundle))

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    config = uvicorn.Config(bundle_app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    rpc_url = f"http://127.0.0.1:{port}/rpc"
    ident = {}
    deadline = time.time() + 10
    while time.time() < deadline:
        ident = fetch_remote_identity(rpc_url)
        if ident.get("agent_id"):
            break
        time.sleep(0.2)

    server.should_exit = True
    assert ident.get("public_key")
    card = fetch_remote_card(rpc_url)
    assert card.get("name") == "RemoteAgent"
