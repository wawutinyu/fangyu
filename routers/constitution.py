"""宪法 API — 读取/更新规则与审计日志"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from fangyu.core.constitution import (
    apply_flow_governance,
    audit_event,
    load_constitution,
    read_audit_log,
    save_constitution,
)

router = APIRouter(prefix="/api/v1/constitution", tags=["宪法"])


class ConstitutionUpdate(BaseModel):
    version: str | None = None
    name: str | None = None
    enabled: bool | None = None
    values: list[str] | None = None
    forbidden_actions: list[str] | None = None
    forbidden_node_types: list[str] | None = None
    require_audit: bool | None = None
    policies: list[dict] | None = None


class ScanFlowRequest(BaseModel):
    nodes: list[dict]
    context: str = "flow"


@router.get("")
def get_constitution():
    return load_constitution()


@router.put("")
def update_constitution(body: ConstitutionUpdate):
    current = load_constitution()
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "无更新内容")
    updated = save_constitution({**current, **patch})
    return {"success": True, "constitution": updated}


@router.post("/scan")
def scan_flow(body: ScanFlowRequest):
    gov = apply_flow_governance(body.nodes, context=body.context)
    return {
        "deny": gov["deny"],
        "warn": gov["warn"],
        "all": gov["all"],
        "blocked": len(gov["deny"]) > 0,
    }


@router.get("/audit/verify")
def verify_audit(limit: int = 200):
    from ..core.constitution import verify_audit_chain
    limit = max(1, min(limit, 500))
    return verify_audit_chain(limit)


@router.get("/audit")
def get_audit_log(limit: int = 50):
    limit = max(1, min(limit, 200))
    return {"entries": read_audit_log(limit)}


@router.post("/audit/test")
def write_test_audit():
    audit_event("manual_test", {"source": "api"})
    return {"success": True}
