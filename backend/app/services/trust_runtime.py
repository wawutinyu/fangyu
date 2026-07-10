"""ATP 信任运行时 — TrustRegistry + 身份 + 签名验证"""
import json, uuid, time
from typing import Optional
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption


class AgentIdentity:
    def __init__(self, private_key: Ed25519PrivateKey):
        self._private_key = private_key
        self._public_key = private_key.public_key()

    @classmethod
    def generate(cls) -> "AgentIdentity":
        return cls(Ed25519PrivateKey.generate())

    @classmethod
    def from_private_bytes(cls, raw: bytes) -> "AgentIdentity":
        return cls(Ed25519PrivateKey.from_private_bytes(raw))

    @property
    def public_key(self) -> str:
        return self._public_key.public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

    @property
    def private_key_bytes(self) -> bytes:
        return self._private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())

    def sign(self, payload: str) -> str:
        return self._private_key.sign(payload.encode()).hex()

    @staticmethod
    def verify(public_key_hex: str, payload: str, signature_hex: str) -> bool:
        try:
            pub_bytes = bytes.fromhex(public_key_hex)
            sig_bytes = bytes.fromhex(signature_hex)
            pub_key = Ed25519PublicKey.from_public_bytes(pub_bytes)
            pub_key.verify(sig_bytes, payload.encode())
            return True
        except Exception:
            return False

    def to_dict(self) -> dict:
        return {"publicKey": self.public_key, "algorithm": "Ed25519"}


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
    def revoke(cls, agent_id: str):
        cls._revoked.add(agent_id)

    @classmethod
    def check_nonce(cls, nonce: str) -> bool:
        if nonce in cls._nonces:
            return False
        cls._nonces.add(nonce)
        if len(cls._nonces) > 10000:
            cls._nonces.clear()
        return True

    @classmethod
    def authorize(cls, agent_id: str, skill_id: str) -> bool:
        if agent_id in cls._revoked:
            return False
        allowed = cls._policies.get(agent_id, [])
        return "*" in allowed or skill_id in allowed


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
        to_sign = json.dumps({"payload": payload, "sender_id": sender_id, "timestamp": ts, "nonce": nonce}, sort_keys=True)
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
        to_verify = json.dumps({"payload": envelope.payload, "sender_id": envelope.sender_id,
                                "timestamp": envelope.timestamp, "nonce": envelope.nonce}, sort_keys=True)
        return AgentIdentity.verify(pubkey, to_verify, envelope.signature)

    def to_dict(self) -> dict:
        return {"payload": self.payload, "senderId": self.sender_id,
                "timestamp": self.timestamp, "nonce": self.nonce, "signature": self.signature}

    @staticmethod
    def from_dict(d: dict) -> "MessageEnvelope":
        return MessageEnvelope(
            payload=d.get("payload", ""),
            sender_id=d.get("senderId", ""),
            timestamp=d.get("timestamp", 0),
            nonce=d.get("nonce", ""),
            signature=d.get("signature", ""),
        )
