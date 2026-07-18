"""IM 通道 HTTP API — 通用入站 + 飞书事件。"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/im", tags=["im"])

# 平台级默认 Bundle（也可请求体指定）
_default_bundle: Optional[str] = None


class InboundBody(BaseModel):
    text: str
    bundle_dir: str = ""
    workspace: str = ""
    mode: str = ""  # chat | orchestrate | ""


class FeishuBindBody(BaseModel):
    bundle_dir: str
    mode: str = "chat"
    verification_token: str = ""
    app_id: str = ""
    app_secret: str = ""


class SetDefaultBody(BaseModel):
    bundle_dir: str


@router.post("/default-bundle")
def set_default_bundle(body: SetDefaultBody):
    global _default_bundle
    _default_bundle = body.bundle_dir
    return {"ok": True, "bundle_dir": _default_bundle}


@router.get("/default-bundle")
def get_default_bundle():
    return {"bundle_dir": _default_bundle}


@router.post("/inbound")
def inbound(body: InboundBody):
    from fangyu.engine.im_inbound import handle_inbound_text

    bundle = body.bundle_dir or _default_bundle
    if not bundle:
        raise HTTPException(400, "bundle_dir 未指定且无默认 Bundle")
    result = handle_inbound_text(
        bundle,
        body.text,
        workspace=body.workspace or None,
        mode=body.mode or None,  # type: ignore[arg-type]
    )
    return result


@router.post("/feishu")
@router.post("/feishu/events")
async def feishu_events(body: dict[str, Any], bundle_dir: str = ""):
    """飞书事件订阅回调。query ?bundle_dir= 或平台默认 Bundle。"""
    from fangyu.engine.im_feishu import handle_feishu_event

    bundle = bundle_dir or _default_bundle
    if not bundle:
        # challenge 仍需应答，否则飞书配不通
        if body.get("challenge"):
            return {"challenge": body.get("challenge")}
        raise HTTPException(400, "未绑定 Bundle：先 POST /api/v1/im/default-bundle 或 ?bundle_dir=")

    result = handle_feishu_event(bundle, body)
    if result.get("challenge") is not None:
        return JSONResponse({"challenge": result["challenge"]}, status_code=200)
    if result.get("status") == 403:
        raise HTTPException(403, result.get("error") or "forbidden")
    return result


@router.post("/feishu/bind")
def feishu_bind(body: FeishuBindBody):
    from fangyu.engine.im_feishu import bind_feishu_channel, feishu_channel_status

    path = bind_feishu_channel(
        body.bundle_dir,
        mode=body.mode,
        verification_token=body.verification_token,
        app_id=body.app_id,
        app_secret=body.app_secret,
    )
    global _default_bundle
    _default_bundle = body.bundle_dir
    status = feishu_channel_status(body.bundle_dir, default_bundle=_default_bundle)
    return {
        "ok": True,
        "im_config": str(path),
        "default_bundle": _default_bundle,
        "events_url_hint": status.get("events_url_hint"),
        "status": status,
    }


@router.get("/status")
def im_status(bundle_dir: str = ""):
    """飞书/IM 凭证向导状态（密钥掩码）。"""
    from fangyu.engine.im_feishu import feishu_channel_status

    return feishu_channel_status(bundle_dir or None, default_bundle=_default_bundle)
