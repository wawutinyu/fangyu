"""人审队列 — shell ask 等待 Studio 批准。"""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any

_lock = threading.Lock()
_ITEMS: dict[str, dict[str, Any]] = {}


def clear_approvals() -> None:
    with _lock:
        _ITEMS.clear()


def enqueue_shell_approval(command: str, *, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    aid = uuid.uuid4().hex[:12]
    item = {
        "id": aid,
        "kind": "shell",
        "command": (command or "").strip(),
        "status": "pending",  # pending | approved | denied | consumed
        "created_at": time.time(),
        "resolved_at": None,
        "meta": dict(meta or {}),
    }
    with _lock:
        _ITEMS[aid] = item
    return dict(item)


def get_approval(approval_id: str) -> dict[str, Any] | None:
    with _lock:
        item = _ITEMS.get(approval_id)
        return dict(item) if item else None


def list_approvals(*, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    with _lock:
        rows = list(_ITEMS.values())
    if status:
        st = status.strip().lower()
        rows = [r for r in rows if str(r.get("status")) == st]
    rows.sort(key=lambda r: float(r.get("created_at") or 0), reverse=True)
    return [dict(r) for r in rows[: max(1, limit)]]


def resolve_approval(approval_id: str, *, approve: bool) -> dict[str, Any]:
    with _lock:
        item = _ITEMS.get(approval_id)
        if not item:
            raise KeyError(f"approval 不存在: {approval_id}")
        if item["status"] not in ("pending", "approved"):
            raise ValueError(f"approval 状态不可变更: {item['status']}")
        if item["status"] == "pending":
            item["status"] = "approved" if approve else "denied"
            item["resolved_at"] = time.time()
        elif item["status"] == "approved" and not approve:
            raise ValueError("已批准的请求不能改为拒绝；可忽略")
        return dict(item)


def consume_shell_approval(approval_id: str, command: str) -> bool:
    """确认已批准且命令一致，并标记 consumed（一次性）。"""
    cmd = (command or "").strip()
    with _lock:
        item = _ITEMS.get(approval_id)
        if not item:
            return False
        if item.get("kind") != "shell":
            return False
        if item.get("status") != "approved":
            return False
        if str(item.get("command") or "").strip() != cmd:
            return False
        item["status"] = "consumed"
        item["resolved_at"] = item.get("resolved_at") or time.time()
        return True
