"""TrustRegistry — 身份注册 + 授权 + 吊销 + 防重放"""
from typing import Optional


class TrustRegistry:
    _identities: dict[str, str] = {}
    _policies: dict[str, list[str]] = {}
    _revoked: set[str] = set()
    _nonces: set[str] = set()

    @classmethod
    def register(cls, agent_id: str, public_key: str, allowed_skills: list[str] = None):
        cls._identities[agent_id] = public_key
        cls._policies[agent_id] = allowed_skills or ["*"]

    @classmethod
    def get_public_key(cls, agent_id: str) -> Optional[str]:
        return None if agent_id in cls._revoked else cls._identities.get(agent_id)

    @classmethod
    def revoke(cls, agent_id: str): cls._revoked.add(agent_id)

    @classmethod
    def check_nonce(cls, nonce: str) -> bool:
        if nonce in cls._nonces: return False
        cls._nonces.add(nonce)
        if len(cls._nonces) > 10000: cls._nonces.clear()
        return True

    @classmethod
    def authorize(cls, agent_id: str, skill_id: str) -> bool:
        if agent_id in cls._revoked: return False
        allowed = cls._policies.get(agent_id, [])
        return "*" in allowed or skill_id in allowed
