"""G2-C 组织 ACL API。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/acl", tags=["组织ACL"])


class InitBody(BaseModel):
    org_name: str = "方隅默认组织"
    enabled: bool = True
    require_principal: bool = True


class MemberBody(BaseModel):
    member_id: str
    name: str = ""
    roles: list[str] = ["viewer"]


class RolesBody(BaseModel):
    roles: list[str]


class CheckBody(BaseModel):
    principal_id: str
    agent: str = ""
    skill: str = ""
    tool: str = ""


class EnableBody(BaseModel):
    enabled: bool = True
    require_principal: bool | None = None


class BundleBindBody(BaseModel):
    bundle_dir: str


@router.get("")
def get_acl():
    from fangyu.core.org_acl import load_acl
    return load_acl()


@router.post("/init")
def acl_init(body: InitBody):
    from fangyu.core.org_acl import init_acl
    return init_acl(
        org_name=body.org_name,
        enabled=body.enabled,
        require_principal=body.require_principal,
    )


@router.post("/enable")
def acl_enable(body: EnableBody):
    from fangyu.core.org_acl import enable_acl
    return enable_acl(body.enabled, require_principal=body.require_principal)


@router.post("/members")
def acl_add_member(body: MemberBody):
    from fangyu.core.org_acl import add_member
    return add_member(body.member_id, name=body.name, roles=body.roles)


@router.put("/members/{member_id}/roles")
def acl_set_roles(member_id: str, body: RolesBody):
    from fangyu.core.org_acl import set_member_roles
    try:
        return set_member_roles(member_id, body.roles)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@router.delete("/members/{member_id}")
def acl_del_member(member_id: str):
    from fangyu.core.org_acl import remove_member
    try:
        return remove_member(member_id)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@router.post("/check")
def acl_check(body: CheckBody):
    from fangyu.core.org_acl import ACLError, assert_org_allowed
    try:
        assert_org_allowed(
            body.principal_id,
            agent=body.agent or None,
            skill=body.skill or None,
            tool=body.tool or None,
        )
        return {"allowed": True, "principal_id": body.principal_id}
    except ACLError as e:
        return {"allowed": False, "rule": e.rule, "message": str(e), "context": e.context}


class SyncSsoBody(BaseModel):
    roles: list[str] = ["operator"]
    name: str = ""
    update_existing: bool = False


@router.post("/sync-sso")
def acl_sync_sso(request: Request, body: SyncSsoBody | None = None):
    """把当前 Bearer / 旁路主体写入组织 ACL（ACL↔SSO 产品路径）。"""
    from fangyu.core.org_acl import ensure_sso_member, load_acl

    principal = getattr(request.state, "principal_id", None)
    payload = getattr(request.state, "auth_payload", None) or {}
    if not principal:
        raise HTTPException(401, "需要已认证主体（Bearer 或开发旁路）")
    roles = (body.roles if body else None) or ["operator"]
    name = (body.name if body else "") or ""
    if not name and isinstance(payload, dict):
        name = str(payload.get("name") or "").strip()
    update = bool(body.update_existing) if body else False
    try:
        out = ensure_sso_member(
            principal,
            name=name,
            roles=roles,
            update_existing=update,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    # 若 ACL 尚未启用，提示可一键启用（不强制改）
    acl = load_acl()
    out["hint"] = (
        None
        if acl.get("enabled")
        else "主体已入库，但组织 ACL 仍关闭；可在运维面板启用。"
    )
    return out


@router.get("/me")
def acl_me(request: Request):
    """当前认证主体的 ACL 成员状态。"""
    from fangyu.core.org_acl import principal_acl_status

    principal = getattr(request.state, "principal_id", None)
    if not principal:
        raise HTTPException(401, "需要已认证主体")
    return principal_acl_status(principal)


@router.post("/bundle-bind")
def acl_bundle_bind(body: BundleBindBody):
    from fangyu.core.org_acl import write_bundle_acl
    path = write_bundle_acl(body.bundle_dir)
    return {"ok": True, "acl": str(path)}
