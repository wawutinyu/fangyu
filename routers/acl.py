"""G2-C 组织 ACL API。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
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


@router.post("/bundle-bind")
def acl_bundle_bind(body: BundleBindBody):
    from fangyu.core.org_acl import write_bundle_acl
    path = write_bundle_acl(body.bundle_dir)
    return {"ok": True, "acl": str(path)}
