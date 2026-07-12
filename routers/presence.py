"""方隅·观 API — Presence 与协作事件。"""
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from fangyu.core.collaboration import emit_event, list_events, snapshot

router = APIRouter(prefix="/api/v1/presence", tags=["方隅·观"])


class EmitEventRequest(BaseModel):
    kind: str = Field(..., min_length=1)
    actor: str = ""
    target: str | None = None
    message: str = ""
    detail: dict = Field(default_factory=dict)
    severity: str = "info"


@router.get("")
def get_presence_snapshot(event_limit: int = Query(80, ge=1, le=500)):
    """观：Presence + 时间线快照。"""
    return snapshot(event_limit=event_limit)


@router.get("/events")
def get_events(
    limit: int = Query(100, ge=1, le=500),
    kind: str | None = Query(None, description="逗号分隔 kind 过滤"),
):
    kinds = [k.strip() for k in kind.split(",")] if kind else None
    return {"events": list_events(limit=limit, kinds=kinds)}


@router.post("/events")
def post_event(body: EmitEventRequest):
    """测试 / 外部上报协作事件。"""
    entry = emit_event(
        body.kind,
        actor=body.actor,
        target=body.target,
        message=body.message,
        detail=body.detail,
        severity=body.severity,
    )
    return {"event": entry}
