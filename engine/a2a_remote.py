"""A2A 远程 Agent RPC — 调用外部 bundle / 第三方 Agent。"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


def _rpc_post(url: str, body: dict, headers: dict | None = None) -> dict:
    data = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    hdrs = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        payload = json.loads(e.read().decode("utf-8"))
    if "error" in payload:
        err = payload["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        raise RuntimeError(msg or str(err))
    return payload.get("result", payload)


def remote_send_message(
    ext: dict[str, Any],
    message: dict,
    *,
    task_id: str = "",
    sign_identity: tuple[str, Any] | None = None,
) -> dict:
    """向外部 Agent RPC 端点发送 a2a.send_message。"""
    rpc_url = ext["rpc_url"]
    remote_name = ext.get("remote_name") or ext.get("remoteName") or ext.get("card_name") or ""
    body = {
        "jsonrpc": "2.0",
        "method": "a2a.send_message",
        "params": {
            "targetAgent": remote_name,
            "message": message,
            "taskId": task_id,
        },
        "id": task_id or "remote",
    }
    headers: dict[str, str] = {}
    if sign_identity:
        from fangyu.engine.bundle_a2a_client import sign_rpc_body

        agent_id, identity = sign_identity
        envelope = sign_rpc_body(body, agent_id, identity)
        headers["X-A2A-Envelope"] = json.dumps(envelope, ensure_ascii=False)

    return _rpc_post(rpc_url, body, headers)


def fetch_remote_identity(rpc_url: str) -> dict:
    """从 bundle /identity/public 或 /health 获取公钥身份。"""
    base = rpc_url.rsplit("/rpc", 1)[0]
    for path in ("/identity/public", "/health"):
        try:
            with urllib.request.urlopen(f"{base}{path}", timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            agent_id = data.get("agent_id")
            public_key = data.get("public_key")
            if agent_id and public_key:
                return {
                    "agent_id": agent_id,
                    "public_key": public_key,
                    "require_envelope": bool(data.get("require_envelope", False)),
                }
        except Exception:
            continue
    return {}


def fetch_remote_card(rpc_url: str) -> dict:
    """从 well-known / card / RPC 拉取 AgentCard（跨厂发现）。"""
    from fangyu.core.a2a_discovery import fetch_remote_card as _discover_card

    return _discover_card(rpc_url)
