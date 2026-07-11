"""TrustAnchor — 平台根密钥"""
import json
from .identity import AgentIdentity


class TrustAnchor:
    _instance = None

    def __init__(self):
        self._identity = AgentIdentity.generate()
        self._public_key = self._identity.public_key

    @classmethod
    def get_instance(cls) -> "TrustAnchor":
        if cls._instance is None: cls._instance = cls()
        return cls._instance

    @property
    def public_key(self) -> str: return self._public_key

    def sign_identity_cert(self, agent_id: str, public_key: str) -> str:
        from .registry import TrustRegistry
        payload = json.dumps({"agent_id": agent_id, "public_key": public_key}, sort_keys=True)
        return self._identity.sign(payload)
