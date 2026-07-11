"""Scheduling + Webhook trigger endpoints"""
import asyncio, json, threading, time
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/trigger", tags=["trigger"])

# In-memory store (replace with DB in production)
schedules: dict[str, dict] = {}
webhooks: dict[str, dict] = {}
_scheduler_task: Optional[asyncio.Task] = None

class ScheduleCreate(BaseModel):
    name: str
    cron_expr: str  # "*/5 * * * *" = every 5 minutes
    flow_config: dict
    enabled: bool = True

class WebhookCreate(BaseModel):
    name: str
    flow_config: dict
    enabled: bool = True

# ===== Schedules =====

@router.post("/schedules")
def create_schedule(body: ScheduleCreate):
    sid = f"sched_{int(time.time())}_{len(schedules)}"
    schedules[sid] = {**body.model_dump(), "id": sid, "created_at": time.time()}
    return {"id": sid, **schedules[sid]}

@router.get("/schedules")
def list_schedules():
    return list(schedules.values())

@router.delete("/schedules/{sid}")
def delete_schedule(sid: str):
    if sid not in schedules:
        raise HTTPException(404, "Schedule not found")
    del schedules[sid]
    return {"ok": True}

# ===== Webhooks =====

@router.post("/webhooks")
def create_webhook(body: WebhookCreate):
    wid = f"wh_{int(time.time())}_{len(webhooks)}"
    webhooks[wid] = {**body.model_dump(), "id": wid, "created_at": time.time(), "secret": f"whsec_{wid}"}
    return webhooks[wid]

@router.get("/webhooks")
def list_webhooks():
    return list(webhooks.values())

@router.delete("/webhooks/{wid}")
def delete_webhook(wid: str):
    if wid not in webhooks:
        raise HTTPException(404, "Webhook not found")
    del webhooks[wid]
    return {"ok": True}

# Public webhook receiver
@router.post("/hook/{wid}")
async def receive_webhook(wid: str, body: dict):
    if wid not in webhooks:
        raise HTTPException(404, "Webhook not found")
    wh = webhooks[wid]
    if not wh["enabled"]:
        raise HTTPException(400, "Webhook disabled")
    # Queue execution (simplified)
    threading.Thread(target=_run_flow, args=(wh["flow_config"],), daemon=True).start()
    return {"ok": True, "message": f"Webhook {wid} triggered"}

def _run_flow(flow_config: dict):
    """Run a flow in background thread (simplified)"""
    try:
        from fangyu.engine.scheduler import run_flow
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        nodes = flow_config.get("nodes", [])
        edges = flow_config.get("edges", [])
        loop.run_until_complete(run_flow(nodes, edges))
        print(f"[trigger] Flow completed: {len(nodes)} nodes")
    except Exception as e:
        print(f"[trigger] Flow run error: {e}")
