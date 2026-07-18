"""平台（序）稳定身份 — 用于平台内 A2A 信封签名。"""
from __future__ import annotations

import json
from pathlib import Path

from fangyu.a2a.trust.identity import AgentIdentity
from fangyu.a2a.trust.registry import TrustRegistry
from fangyu.core.config import DATA_DIR

PLATFORM_AGENT_ID = "fangyu-platform"
IDENTITY_FILE: Path = DATA_DIR / "platform-identity.json"

_identity: AgentIdentity | None = None


def ensure_platform_identity() -> AgentIdentity:
    """加载或生成平台密钥，并注册到 TrustRegistry。"""
    global _identity
    if _identity is not None:
        TrustRegistry.register(PLATFORM_AGENT_ID, _identity.public_key, ["*"])
        return _identity

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if IDENTITY_FILE.exists():
        try:
            raw = json.loads(IDENTITY_FILE.read_text(encoding="utf-8"))
            pk = bytes.fromhex(raw["private_key_hex"])
            _identity = AgentIdentity.from_private_bytes(pk)
        except Exception:
            _identity = None

    if _identity is None:
        _identity = AgentIdentity.generate()
        IDENTITY_FILE.write_text(
            json.dumps(
                {
                    "agent_id": PLATFORM_AGENT_ID,
                    "public_key": _identity.public_key,
                    "private_key_hex": _identity.private_key_bytes.hex(),
                    "algorithm": "Ed25519",
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    TrustRegistry.register(PLATFORM_AGENT_ID, _identity.public_key, ["*"])
    return _identity


def get_platform_public() -> dict:
    identity = ensure_platform_identity()
    return {
        "agent_id": PLATFORM_AGENT_ID,
        "public_key": identity.public_key,
        "algorithm": "Ed25519",
    }


def reset_platform_identity_for_tests() -> None:
    global _identity
    _identity = None
