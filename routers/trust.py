"""ATP 信任协议 API 端点"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from fangyu.core.platform_identity import PLATFORM_AGENT_ID, ensure_platform_identity, get_platform_public
from fangyu.engine.trust_runtime import TrustRegistry, AgentIdentity, MessageEnvelope

router = APIRouter(prefix="/api/v1/trust", tags=["trust"])


class RegisterRequest(BaseModel):
    agent_id: str
    public_key: str
    allowed_skills: list[str] = []

class VerifyRequest(BaseModel):
    envelope: dict

class SignRequest(BaseModel):
    payload: str
    sender_id: str = PLATFORM_AGENT_ID

class PlatformSignRequest(BaseModel):
    payload: str

class AuthorizeRequest(BaseModel):
    agent_id: str
    skill_id: str


@router.post("/register")
def register_identity(body: RegisterRequest):
    TrustRegistry.register(body.agent_id, body.public_key, body.allowed_skills)
    return {"success": True, "agent_id": body.agent_id}


@router.post("/revoke/{agent_id}")
def revoke_identity(agent_id: str):
    TrustRegistry.revoke(agent_id)
    return {"ok": True}


@router.get("/identities/{agent_id}")
def get_identity(agent_id: str):
    pubkey = TrustRegistry.get_public_key(agent_id)
    if not pubkey:
        raise HTTPException(404, "Identity not found")
    return {"agent_id": agent_id, "public_key": pubkey}


@router.post("/verify")
def verify_envelope(body: VerifyRequest):
    envelope = MessageEnvelope.from_dict(body.envelope)
    valid = MessageEnvelope.verify(envelope)
    return {"valid": valid, "reason": "" if valid else "verification failed"}


@router.get("/platform")
def platform_identity():
    """序平台公钥（稳定，落盘 data/platform-identity.json）。"""
    return get_platform_public()


@router.post("/platform/sign")
def platform_sign(body: PlatformSignRequest):
    """用平台身份签署任意 JSON 字符串（供序前端附 X-A2A-Envelope）。"""
    from fangyu.a2a.trust.envelope import MessageEnvelope as A2AEnvelope

    identity = ensure_platform_identity()
    env = A2AEnvelope.sign(body.payload, PLATFORM_AGENT_ID, identity)
    return {"envelope": env.to_dict(), "agent_id": PLATFORM_AGENT_ID}


@router.post("/sign")
def sign_payload(body: SignRequest):
    """兼容旧接口：默认用平台身份签名（不再每次生成临时密钥）。"""
    from fangyu.a2a.trust.envelope import MessageEnvelope as A2AEnvelope

    identity = ensure_platform_identity()
    sender = body.sender_id or PLATFORM_AGENT_ID
    if sender == PLATFORM_AGENT_ID:
        env = A2AEnvelope.sign(body.payload, PLATFORM_AGENT_ID, identity)
    else:
        # 非平台 sender：仍生成临时身份（仅调试）
        tmp = AgentIdentity.generate()
        TrustRegistry.register(sender, tmp.public_key, ["*"])
        env = A2AEnvelope.sign(body.payload, sender, tmp)
    return {"envelope": env.to_dict()}


@router.post("/authorize")
def authorize_agent(body: AuthorizeRequest):
    allowed = TrustRegistry.authorize(body.agent_id, body.skill_id)
    return {"allowed": allowed, "reason": "" if allowed else "not authorized"}
