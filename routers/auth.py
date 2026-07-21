"""认证 / SSO API。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from fangyu.core.sso import (
    complete_oidc_login,
    load_sso_config,
    mint_access_token,
    principal_from_payload,
    public_auth_config,
    save_sso_config,
    start_oidc_login,
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


class OidcStartBody(BaseModel):
    redirect_uri: str = ""


class OidcCallbackBody(BaseModel):
    code: str = Field(..., min_length=1)
    state: str = Field(..., min_length=1)


@router.get("/config")
def get_auth_config():
    return public_auth_config()


@router.put("/config")
def put_auth_config(body: SsoConfigBody):
    overlay = {k: v for k, v in body.model_dump().items() if v is not None}
    doc = save_sso_config(overlay)
    return {"ok": True, "config": public_auth_config(), "enabled": doc.get("enabled")}


@router.post("/token")
def issue_token(body: TokenBody, request: Request):
    """开发签发本地 JWT。生产关闭：FANGYU_ALLOW_DEV_TOKEN=0。

    生产可用：Header ``X-Fangyu-Bootstrap: <FANGYU_BOOTSTRAP_SECRET>`` 运维签发。
    """
    from fangyu.core.auth_gate import allow_dev_token, bootstrap_header_ok

    cfg = load_sso_config()
    bootstrap = bootstrap_header_ok(request.headers.get("x-fangyu-bootstrap"))
    if not allow_dev_token() and not bootstrap:
        principal = getattr(request.state, "principal_id", None)
        roles = []
        payload = getattr(request.state, "auth_payload", None)
        if isinstance(payload, dict):
            roles = list(payload.get("roles") or [])
        if not principal or "admin" not in roles:
            raise HTTPException(
                403,
                "开发签发已关闭（FANGYU_ALLOW_DEV_TOKEN=0）。请使用 OIDC、Bootstrap Secret 或 admin 代签。",
            )
    if cfg.get("enabled") and not allow_dev_token() and not bootstrap:
        principal = getattr(request.state, "principal_id", None)
        payload = getattr(request.state, "auth_payload", None)
        roles = list((payload or {}).get("roles") or []) if isinstance(payload, dict) else []
        if not principal or "admin" not in roles:
            raise HTTPException(403, "SSO 已启用：禁止匿名签发 token")

    out = mint_access_token(
        principal_id=body.principal_id.strip(),
        name=body.name,
        roles=body.roles,
        ttl_sec=body.ttl_sec,
        config=cfg,
    )
    return out


@router.get("/oidc/start")
def oidc_start_get(redirect_uri: str = ""):
    """开始企业 OIDC 授权码登录，返回 authorization_url。"""
    try:
        return start_oidc_login(redirect_uri=redirect_uri)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/oidc/start")
def oidc_start_post(body: OidcStartBody):
    try:
        return start_oidc_login(redirect_uri=body.redirect_uri)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/oidc/callback")
def oidc_callback(body: OidcCallbackBody):
    """授权码回调：换票并签发方隅 Bearer JWT。"""
    try:
        return complete_oidc_login(code=body.code, state=body.state)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


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
            from fangyu.core.auth_gate import allow_principal_header_bypass
            bypass = (request.headers.get("x-fangyu-principal") or "").strip()
            if bypass and allow_principal_header_bypass() and not load_sso_config().get("enabled"):
                principal = bypass
            else:
                raise HTTPException(401, "未认证：需要 Bearer token")
    return {
        "principal_id": principal,
        "name": (payload or {}).get("name") if isinstance(payload, dict) else principal,
        "roles": (payload or {}).get("roles") if isinstance(payload, dict) else [],
        "sso_enabled": load_sso_config().get("enabled"),
        "acl": _acl_status_for(principal),
    }


def _acl_status_for(principal: str | None) -> dict:
    try:
        from fangyu.core.org_acl import principal_acl_status
        return principal_acl_status(principal)
    except Exception:
        return {"enabled": False, "is_member": False}
