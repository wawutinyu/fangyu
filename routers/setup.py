"""Setup Copilot API — 外部 Agent 信任确认 + 本机 Worker 启动预览。"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from fangyu.core.setup_copilot import preview_from_discover_payload
from fangyu.core.setup_worker import build_worker_preview

router = APIRouter(prefix="/api/v1/setup", tags=["Setup Copilot"])


class CopilotPreviewRequest(BaseModel):
    rpc_url: str = Field(..., min_length=3)


class WorkerPreviewRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)


@router.post("/copilot/preview")
def copilot_preview(body: CopilotPreviewRequest):
    from fangyu.engine.a2a_remote import fetch_remote_card, fetch_remote_identity

    rpc_url = body.rpc_url.strip().rstrip("/")
    if not rpc_url.endswith("/rpc"):
        rpc_url = f"{rpc_url}/rpc"
    try:
        card = fetch_remote_card(rpc_url)
    except Exception as exc:
        raise HTTPException(400, f"发现失败: {exc}") from exc
    if not card:
        raise HTTPException(400, "无法从远程端点获取 AgentCard")
    try:
        identity = fetch_remote_identity(rpc_url) or {}
    except Exception:
        identity = {}
    discover = {"success": True, "rpc_url": rpc_url, "card": card, "identity": identity or None}
    preview = preview_from_discover_payload(discover)
    return {"discover": discover, "preview": preview}


@router.post("/worker/preview")
def worker_preview(body: WorkerPreviewRequest):
    return {"preview": build_worker_preview(body.description)}
