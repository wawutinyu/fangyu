"""人审 API — shell ask 排队 / 批准 / 拒绝 / 可选立即执行。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/approvals", tags=["人审"])


class ResolveBody(BaseModel):
    execute: bool = Field(False, description="批准后是否立即执行 shell")


@router.get("")
def list_approvals(status: str = "", limit: int = 50):
    from fangyu.engine.approval_queue import list_approvals as _list

    rows = _list(status=status or None, limit=limit)
    pending = sum(1 for r in rows if r.get("status") == "pending")
    return {"approvals": rows, "pending_count": pending if not status else None}


@router.get("/{approval_id}")
def get_one(approval_id: str):
    from fangyu.engine.approval_queue import get_approval

    item = get_approval(approval_id)
    if not item:
        raise HTTPException(404, f"approval 不存在: {approval_id}")
    return item


@router.post("/{approval_id}/approve")
def approve(approval_id: str, body: ResolveBody | None = None):
    from fangyu.engine.approval_queue import get_approval, resolve_approval
    from fangyu.engine.bundle_tools import tool_shell
    from fangyu.engine.shell_policy import reset_shell_policy, set_shell_policy

    body = body or ResolveBody()
    try:
        item = resolve_approval(approval_id, approve=True)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    execution = None
    if body.execute and item.get("kind") == "shell":
        # 执行时临时确保 ask 策略下可消费 approval
        tok = set_shell_policy("ask")
        try:
            execution = tool_shell(
                command=str(item.get("command") or ""),
                confirm=True,
                approval_id=approval_id,
            )
        finally:
            reset_shell_policy(tok)
        item = get_approval(approval_id) or item
    return {"ok": True, "approval": item, "execution": execution}


@router.post("/{approval_id}/deny")
def deny(approval_id: str):
    from fangyu.engine.approval_queue import resolve_approval

    try:
        item = resolve_approval(approval_id, approve=False)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "approval": item}
