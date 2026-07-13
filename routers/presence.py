"""方隅·观 API — Presence、协作事件、SSE。"""
from __future__ import annotations

import asyncio
import json
from queue import Empty

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from fangyu.core.collaboration import (
    emit_event,
    list_events,
    snapshot,
    subscribe_events,
    unsubscribe_events,
)

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


@router.get("/stream")
async def presence_stream():
    """SSE：先推送一次 snapshot，再推送实时 CollaborationEvent。"""

    async def gen():
        q = subscribe_events()
        try:
            snap = snapshot(event_limit=40)
            yield f"event: snapshot\ndata: {json.dumps(snap, ensure_ascii=False)}\n\n"
            while True:
                try:
                    entry = await asyncio.to_thread(q.get, True, 15.0)
                    yield f"event: collab\ndata: {json.dumps(entry, ensure_ascii=False)}\n\n"
                except Empty:
                    yield ": keepalive\n\n"
        finally:
            unsubscribe_events(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
