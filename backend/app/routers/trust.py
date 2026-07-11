"""ATP 信任协议 API 端点"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

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
    sender_id: str

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


@router.post("/sign")
def sign_payload(body: SignRequest):
    identity = AgentIdentity.generate()
    TrustRegistry.register(body.sender_id, identity.public_key, ["*"])
    envelope = MessageEnvelope.sign(body.payload, body.sender_id, identity)
    return {"envelope": envelope.to_dict()}


@router.post("/authorize")
def authorize_agent(body: AuthorizeRequest):
    allowed = TrustRegistry.authorize(body.agent_id, body.skill_id)
    return {"allowed": allowed, "reason": "" if allowed else "not authorized"}
