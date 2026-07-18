"""方隅·观 API — Presence、协作事件、SSE、回放存库。"""
from __future__ import annotations

import asyncio
import json
from queue import Empty

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from fangyu.core.collaboration import (
    emit_event,
    list_events,
    pack_to_snapshot,
    snapshot,
    subscribe_events,
    unsubscribe_events,
    run_presence_demo,
    validate_replay_pack,
)
from fangyu.core.collaboration_store import (
    delete_replay,
    get_replay,
    list_replays,
    save_replay,
)

router = APIRouter(prefix="/api/v1/presence", tags=["方隅·观"])


class EmitEventRequest(BaseModel):
    kind: str = Field(..., min_length=1)
    actor: str = ""
    target: str | None = None
    message: str = ""
    detail: dict = Field(default_factory=dict)
    severity: str = "info"


class SaveReplayRequest(BaseModel):
    title: str = ""
    pack: dict = Field(default_factory=dict)


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


@router.post("/demo")
def post_presence_demo(ttl_sec: float = Query(180, ge=30, le=600)):
    """一键演示剧本：注入同行者 + 协作事件（观门面演示用）。"""
    return run_presence_demo(ttl_sec=ttl_sec)


@router.get("/replays")
def get_replays(limit: int = Query(50, ge=1, le=200)):
    """列出已存库的观回放包（SQLite）。"""
    return {"replays": list_replays(limit=limit)}


@router.post("/replays")
def post_replay(body: SaveReplayRequest):
    """存库：导出包或导入包写入 collaboration.db。"""
    try:
        pack = validate_replay_pack(body.pack)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    meta = save_replay(title=body.title, pack=pack)
    return {"ok": True, "replay": meta}


@router.get("/replays/{replay_id}")
def get_replay_detail(replay_id: str):
    row = get_replay(replay_id)
    if not row:
        raise HTTPException(status_code=404, detail="回放不存在")
    return row


@router.delete("/replays/{replay_id}")
def remove_replay(replay_id: str):
    if not delete_replay(replay_id):
        raise HTTPException(status_code=404, detail="回放不存在")
    return {"ok": True}


@router.post("/replays/import")
def import_replay(body: SaveReplayRequest):
    """导入并存库：校验包 → 写 SQLite → 返回可加载的 snapshot。"""
    try:
        pack = validate_replay_pack(body.pack)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    meta = save_replay(title=body.title, pack=pack)
    return {
        "ok": True,
        "replay": meta,
        "snapshot": pack_to_snapshot(pack),
    }


@router.post("/replays/{replay_id}/load")
def load_replay(replay_id: str):
    """从库加载回放为 snapshot（不改动实时 Presence）。"""
    row = get_replay(replay_id)
    if not row:
        raise HTTPException(status_code=404, detail="回放不存在")
    return {
        "ok": True,
        "replay": {
            k: row[k]
            for k in ("id", "title", "created_at", "exported_at", "event_count", "department_count")
        },
        "snapshot": pack_to_snapshot(row.get("pack") or {}),
    }


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
