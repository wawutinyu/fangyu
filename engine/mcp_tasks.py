"""MCP Tasks 扩展（SEP-2663 最小实现）— io.modelcontextprotocol/tasks

支持：
  - tools/call → CreateTaskResult（resultType=task）
  - tasks/get / tasks/update / tasks/cancel
  - 无 sessions；taskId 为不透明句柄
"""
from __future__ import annotations

import asyncio
import threading
import time
import uuid
from typing import Any, Awaitable, Callable

EXTENSION_ID = "io.modelcontextprotocol/tasks"

_lock = threading.Lock()
_TASKS: dict[str, dict[str, Any]] = {}


def clear_mcp_tasks() -> None:
    with _lock:
        _TASKS.clear()


def tasks_extension_capability() -> dict[str, Any]:
    return {EXTENSION_ID: {}}


def client_supports_tasks(meta: dict[str, Any] | None) -> bool:
    """从请求 _meta / capabilities 判断客户端是否声明 Tasks 扩展。"""
    if not meta:
        return False
    caps = (
        meta.get("io.modelcontextprotocol/clientCapabilities")
        or meta.get("clientCapabilities")
        or meta.get("capabilities")
        or {}
    )
    if not isinstance(caps, dict):
        return False
    exts = caps.get("extensions") or {}
    return isinstance(exts, dict) and EXTENSION_ID in exts


def _now_ms() -> int:
    return int(time.time() * 1000)


def create_working_task(
    *,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    server: str = "__internal__",
    ttl_ms: int = 600_000,
    poll_interval_ms: int = 500,
) -> dict[str, Any]:
    tid = str(uuid.uuid4())
    created = _now_ms()
    task = {
        "taskId": tid,
        "status": "working",
        "createdAt": created,
        "lastUpdatedAt": created,
        "ttlMs": ttl_ms,
        "pollIntervalMs": poll_interval_ms,
        "toolName": tool_name,
        "server": server,
        "arguments": dict(arguments or {}),
        "result": None,
        "error": None,
        "inputRequests": None,
        "cancelRequested": False,
    }
    with _lock:
        _TASKS[tid] = task
    return dict(task)


def get_task(task_id: str) -> dict[str, Any] | None:
    with _lock:
        item = _TASKS.get(task_id)
        if not item:
            return None
        # TTL 过期
        ttl = int(item.get("ttlMs") or 0)
        if ttl > 0 and _now_ms() - int(item.get("createdAt") or 0) > ttl:
            if item.get("status") == "working":
                item["status"] = "failed"
                item["error"] = {"code": -32001, "message": "task expired (ttl)"}
                item["lastUpdatedAt"] = _now_ms()
        return dict(item)


def list_task_ids_for_tests() -> list[str]:
    with _lock:
        return list(_TASKS.keys())


def update_task(
    task_id: str,
    *,
    input_responses: dict[str, Any] | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """tasks/update — 最小实现：记录 inputResponses，不阻塞。"""
    with _lock:
        item = _TASKS.get(task_id)
        if not item:
            raise KeyError(f"unknown taskId: {task_id}")
        if input_responses:
            item.setdefault("inputResponses", {}).update(dict(input_responses))
            # 若曾 input_required，收到响应后回到 working
            if item.get("status") == "input_required":
                item["status"] = "working"
        if meta:
            item.setdefault("meta", {}).update(dict(meta))
        item["lastUpdatedAt"] = _now_ms()
        return {"resultType": "complete"}


def cancel_task(task_id: str) -> dict[str, Any]:
    with _lock:
        item = _TASKS.get(task_id)
        if not item:
            raise KeyError(f"unknown taskId: {task_id}")
        item["cancelRequested"] = True
        if item.get("status") == "working":
            item["status"] = "cancelled"
            item["lastUpdatedAt"] = _now_ms()
        return {"resultType": "complete"}


def mark_completed(task_id: str, result: Any) -> None:
    with _lock:
        item = _TASKS.get(task_id)
        if not item:
            return
        if item.get("status") in ("cancelled", "failed", "completed"):
            return
        if item.get("cancelRequested"):
            item["status"] = "cancelled"
            item["lastUpdatedAt"] = _now_ms()
            return
        item["status"] = "completed"
        item["result"] = result
        item["lastUpdatedAt"] = _now_ms()


def mark_failed(task_id: str, message: str, *, code: int = -32000) -> None:
    with _lock:
        item = _TASKS.get(task_id)
        if not item:
            return
        if item.get("status") in ("cancelled", "completed"):
            return
        item["status"] = "failed"
        item["error"] = {"code": code, "message": message}
        item["lastUpdatedAt"] = _now_ms()


def to_create_task_result(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "resultType": "task",
        "taskId": task["taskId"],
        "status": task.get("status") or "working",
        "createdAt": task.get("createdAt"),
        "lastUpdatedAt": task.get("lastUpdatedAt"),
        "ttlMs": task.get("ttlMs"),
        "pollIntervalMs": task.get("pollIntervalMs"),
        "task": {
            "taskId": task["taskId"],
            "status": task.get("status") or "working",
            "ttlMs": task.get("ttlMs"),
            "pollIntervalMs": task.get("pollIntervalMs"),
        },
    }


def to_get_task_result(task: dict[str, Any]) -> dict[str, Any]:
    status = task.get("status") or "working"
    out: dict[str, Any] = {
        "resultType": "complete",
        "taskId": task["taskId"],
        "status": status,
        "createdAt": task.get("createdAt"),
        "lastUpdatedAt": task.get("lastUpdatedAt"),
        "ttlMs": task.get("ttlMs"),
        "pollIntervalMs": task.get("pollIntervalMs"),
    }
    if status == "completed":
        out["result"] = task.get("result")
    elif status == "failed":
        out["error"] = task.get("error")
    elif status == "input_required":
        out["inputRequests"] = task.get("inputRequests") or {}
    return out


async def run_tool_as_task(
    *,
    tool_name: str,
    arguments: dict[str, Any],
    server: str,
    runner: Callable[[], Awaitable[Any]],
    ttl_ms: int = 600_000,
    poll_interval_ms: int = 500,
) -> dict[str, Any]:
    """创建 task 并后台执行 runner；立即返回 CreateTaskResult。"""
    task = create_working_task(
        tool_name=tool_name,
        arguments=arguments,
        server=server,
        ttl_ms=ttl_ms,
        poll_interval_ms=poll_interval_ms,
    )
    tid = task["taskId"]

    async def _job() -> None:
        try:
            cur = get_task(tid)
            if cur and cur.get("cancelRequested"):
                return
            result = await runner()
            cur = get_task(tid)
            if cur and (cur.get("cancelRequested") or cur.get("status") == "cancelled"):
                return
            mark_completed(tid, result)
        except Exception as exc:  # noqa: BLE001
            mark_failed(tid, str(exc))

    asyncio.create_task(_job())
    return to_create_task_result(task)
