"""认证 / SSO API。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from fangyu.core.sso import (
    load_sso_config,
    mint_access_token,
    principal_from_payload,
    public_auth_config,
    save_sso_config,
    verify_access_token,
)

router = APIRouter(prefix="/api/v1/auth", tags=["认证 SSO"])


class TokenBody(BaseModel):
    principal_id: str = Field(..., min_length=1)
    name: str = ""
    roles: list[str] = Field(default_factory=lambda: ["operator"])
    ttl_sec: int = 3600


class SsoConfigBody(BaseModel):
    enabled: bool | None = None
    issuer: str | None = None
    audience: str | None = None
    shared_secret: str | None = None
    oidc: dict | None = None


@router.get("/config")
def get_auth_config():
    return public_auth_config()


@router.put("/config")
def put_auth_config(body: SsoConfigBody):
    overlay = {k: v for k, v in body.model_dump().items() if v is not None}
    doc = save_sso_config(overlay)
    return {"ok": True, "config": public_auth_config(), "enabled": doc.get("enabled")}


@router.post("/token")
def issue_token(body: TokenBody):
    """开发/内网：签发本地 JWT（对接 ACL principal）。"""
    cfg = load_sso_config()
    # 始终允许签发；enabled 控制是否强制校验
    out = mint_access_token(
        principal_id=body.principal_id.strip(),
        name=body.name,
        roles=body.roles,
        ttl_sec=body.ttl_sec,
        config=cfg,
    )
    return out


@router.get("/me")
def auth_me(request: Request):
    principal = getattr(request.state, "principal_id", None)
    payload = getattr(request.state, "auth_payload", None)
    if not principal:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            try:
                payload = verify_access_token(auth.split(" ", 1)[1].strip())
                principal = principal_from_payload(payload)
            except ValueError as exc:
                raise HTTPException(401, str(exc)) from exc
        else:
            bypass = (request.headers.get("x-fangyu-principal") or "").strip()
            if bypass and not load_sso_config().get("enabled"):
                principal = bypass
            else:
                raise HTTPException(401, "未认证：需要 Bearer token")
    return {
        "principal_id": principal,
        "name": (payload or {}).get("name") if isinstance(payload, dict) else principal,
        "roles": (payload or {}).get("roles") if isinstance(payload, dict) else [],
        "sso_enabled": load_sso_config().get("enabled"),
    }
