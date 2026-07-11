"""MessageEnvelope — 签名信封"""
import json, uuid, time
from .identity import AgentIdentity
from .registry import TrustRegistry


class MessageEnvelope:
    def __init__(self, payload: str, sender_id: str, timestamp: int, nonce: str, signature: str):
        self.payload = payload
        self.sender_id = sender_id
        self.timestamp = timestamp
        self.nonce = nonce
        self.signature = signature

    @staticmethod
    def sign(payload: str, sender_id: str, identity: AgentIdentity = None) -> "MessageEnvelope":
        from .anchor import TrustAnchor
        if identity is None: identity = TrustAnchor.get_instance()._identity
        nonce = uuid.uuid4().hex
        ts = int(time.time() * 1000)
        to_sign = json.dumps({"payload": payload, "sender_id": sender_id, "timestamp": ts, "nonce": nonce}, sort_keys=True)
        sig = identity.sign(to_sign)
        return MessageEnvelope(payload, sender_id, ts, nonce, sig)

    @staticmethod
    def verify(envelope: "MessageEnvelope") -> bool:
        if not TrustRegistry.check_nonce(envelope.nonce): return False
        if abs(int(time.time() * 1000) - envelope.timestamp) > 300_000: return False
        pubkey = TrustRegistry.get_public_key(envelope.sender_id)
        if not pubkey: return False
        to_verify = json.dumps({"payload": envelope.payload, "sender_id": envelope.sender_id,
                                "timestamp": envelope.timestamp, "nonce": envelope.nonce}, sort_keys=True)
        return AgentIdentity.verify(pubkey, to_verify, envelope.signature)

    def to_dict(self) -> dict:
        return {"payload": self.payload, "senderId": self.sender_id,
                "timestamp": self.timestamp, "nonce": self.nonce, "signature": self.signature}
