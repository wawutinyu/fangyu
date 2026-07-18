"""ATP 信任运行时 — 复用 a2a.trust 身份/注册表 + 签名信封 + 授权断言"""
from __future__ import annotations

import json
import time
import uuid
from typing import Optional

from fangyu.a2a.trust.identity import AgentIdentity
from fangyu.a2a.trust.registry import TrustRegistry
from fangyu.core.exceptions import TrustError

__all__ = [
    "AgentIdentity",
    "TrustRegistry",
    "TrustViolation",
    "MessageEnvelope",
    "assert_agent_authorized",
    "sync_agent_trust",
]


class TrustViolation(TrustError):
    """ATP 信任层拒绝（保留原名以兼容现有 import / isinstance）。"""


def assert_agent_authorized(agent_id: str, skill_id: str, trust: dict | None = None) -> None:
    """启用 ATP 时校验 Agent 是否已注册且有权执行 skill。"""
    if not trust or not trust.get("enabled", False):
        return
    from ..core.constitution import audit_event

    lookup_id = trust.get("agent_id") or agent_id

    if lookup_id in (trust.get("revocationList") or []):
        audit_event("trust_violation", {"agent": lookup_id, "skill_id": skill_id, "rule": "revoked"})
        raise TrustViolation(
            "revoked",
            f"Agent '{lookup_id}' 已被吊销，无法执行技能 '{skill_id}'",
            context={"agent": lookup_id, "skill_id": skill_id},
        )
    pubkey = TrustRegistry.get_public_key(lookup_id)
    if not pubkey:
        audit_event("trust_violation", {"agent": lookup_id, "skill_id": skill_id, "rule": "not_registered"})
        raise TrustViolation(
            "not_registered",
            f"Agent '{lookup_id}' 未注册到 ATP 信任层",
            context={"agent": lookup_id, "skill_id": skill_id},
        )
    if not TrustRegistry.authorize(lookup_id, skill_id):
        audit_event("trust_violation", {"agent": lookup_id, "skill_id": skill_id, "rule": "not_authorized"})
        raise TrustViolation(
            "not_authorized",
            f"Agent '{lookup_id}' 无权执行技能 '{skill_id}'",
            context={"agent": lookup_id, "skill_id": skill_id},
        )
    audit_event("trust_authorized", {"agent": lookup_id, "skill_id": skill_id})


def sync_agent_trust(agent_id: str, card: dict, trust: dict | None = None) -> dict:
    """部署时将 Agent 注册到 TrustRegistry。"""
    skills = [s.get("id") for s in card.get("skills", []) if isinstance(s, dict) and s.get("id")]
    allowed = skills if skills else ["*"]

    if trust and trust.get("enabled") and agent_id in (trust.get("revocationList") or []):
        TrustRegistry.revoke(agent_id)
        return {"agent_id": agent_id, "revoked": True}

    existing = TrustRegistry.get_public_key(agent_id)
    if existing:
        TrustRegistry.register(agent_id, existing, allowed)
        return {"agent_id": agent_id, "public_key": existing, "allowed_skills": allowed}

    identity = AgentIdentity.generate()
    TrustRegistry.register(agent_id, identity.public_key, allowed)
    return {"agent_id": agent_id, "public_key": identity.public_key, "allowed_skills": allowed}


class MessageEnvelope:
    def __init__(self, payload: str, sender_id: str, timestamp: int, nonce: str, signature: str):
        self.payload = payload
        self.sender_id = sender_id
        self.timestamp = timestamp
        self.nonce = nonce
        self.signature = signature

    @staticmethod
    def sign(payload: str, sender_id: str, identity: Optional[AgentIdentity] = None) -> "MessageEnvelope":
        if identity is None:
            identity = AgentIdentity.generate()
        nonce = uuid.uuid4().hex
        ts = int(time.time() * 1000)
        to_sign = json.dumps(
            {"payload": payload, "sender_id": sender_id, "timestamp": ts, "nonce": nonce},
            sort_keys=True,
        )
        sig = identity.sign(to_sign)
        return MessageEnvelope(payload, sender_id, ts, nonce, sig)

    @staticmethod
    def verify(envelope: "MessageEnvelope") -> bool:
        if not TrustRegistry.check_nonce(envelope.nonce):
            return False
        if abs(int(time.time() * 1000) - envelope.timestamp) > 300_000:
            return False
        pubkey = TrustRegistry.get_public_key(envelope.sender_id)
        if not pubkey:
            return False
        to_verify = json.dumps(
            {
                "payload": envelope.payload,
                "sender_id": envelope.sender_id,
                "timestamp": envelope.timestamp,
                "nonce": envelope.nonce,
            },
            sort_keys=True,
        )
        return AgentIdentity.verify(pubkey, to_verify, envelope.signature)

    def to_dict(self) -> dict:
        return {
            "payload": self.payload,
            "senderId": self.sender_id,
            "timestamp": self.timestamp,
            "nonce": self.nonce,
            "signature": self.signature,
        }

    @staticmethod
    def from_dict(d: dict) -> "MessageEnvelope":
        return MessageEnvelope(
            payload=d.get("payload", ""),
            sender_id=d.get("senderId", ""),
            timestamp=d.get("timestamp", 0),
            nonce=d.get("nonce", ""),
            signature=d.get("signature", ""),
        )
