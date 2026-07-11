"""AgentIdentity — Ed25519 身份 (cryptography)"""
import uuid
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
