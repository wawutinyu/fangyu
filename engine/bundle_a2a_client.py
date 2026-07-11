"""Bundle A2A 客户端 — 带 MessageEnvelope 签名的 JSON-RPC 调用。"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from fangyu.a2a.trust.envelope import MessageEnvelope
from fangyu.a2a.trust.identity import AgentIdentity


def sign_rpc_body(body: dict, agent_id: str, identity: AgentIdentity) -> dict:
    """为 JSON-RPC body 生成签名信封。"""
    payload = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    env = MessageEnvelope.sign(payload, agent_id, identity)
    return env.to_dict()


def rpc_call(
    url: str,
    method: str,
    params: dict | None = None,
    *,
    agent_id: str,
    identity: AgentIdentity,
    req_id: str | int = "1",
) -> dict:
    """向 bundle / 平台 A2A RPC 端点发送带信封签名的请求。"""
    body = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": req_id}
    envelope = sign_rpc_body(body, agent_id, identity)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-A2A-Envelope": json.dumps(envelope, ensure_ascii=False),
    }
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        result = json.loads(e.read().decode("utf-8"))
    if "error" in result:
        raise RuntimeError(result["error"])
    return result.get("result", {})


def identity_from_bundle(bundle: dict[str, Any]) -> tuple[str, AgentIdentity]:
    """从已加载 bundle 还原 AgentIdentity。"""
    ident_doc = bundle["identity"]
    agent_id = ident_doc["agent_id"]
    raw = bytes.fromhex(ident_doc["private_key_hex"])
    return agent_id, AgentIdentity.from_private_bytes(raw)
