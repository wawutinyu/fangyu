"""方隅·行 Worker 注册与任务队列（SQLite 持久化）"""
from __future__ import annotations

import uuid
from typing import Any

from .worker_store import (
    WORKER_STALE_SECONDS,
    complete_task_db,
    get_task_db,
    get_worker_by_name_db,
    get_worker_db,
    insert_task,
    list_task_events_db,
    list_tasks_db,
    list_workers_db,
    log_event,
    poll_task_db,
    reset_store,
    touch_worker,
    upsert_worker,
)

__all__ = [
    "WORKER_STALE_SECONDS",
    "register_worker",
    "heartbeat",
    "list_workers",
    "get_worker",
    "enqueue_task",
    "poll_task",
    "complete_task",
    "get_task",
    "list_tasks",
    "list_task_events",
    "append_task_event",
    "reset_registry",
]


def register_worker(
    *,
    name: str,
    hostname: str,
    os_name: str,
    capabilities: list[str] | None = None,
    worker_id: str | None = None,
) -> dict[str, Any]:
    return upsert_worker(
        name=name,
        hostname=hostname,
        os_name=os_name,
        capabilities=capabilities or ["shell", "run_flow", "read_file", "write_file"],
        worker_id=worker_id,
    )


def heartbeat(worker_id: str) -> dict[str, Any] | None:
    return touch_worker(worker_id)


def list_workers() -> list[dict[str, Any]]:
    return list_workers_db()


def get_worker(worker_id: str) -> dict[str, Any] | None:
    return get_worker_db(worker_id)


def get_worker_by_name(name: str, *, online_only: bool = False) -> dict[str, Any] | None:
    return get_worker_by_name_db(name, online_only=online_only)


def enqueue_task(
    *,
    task_type: str,
    payload: dict[str, Any],
    worker_id: str | None = None,
    worker_name: str | None = None,
) -> dict[str, Any]:
    if worker_name and not worker_id:
        worker = get_worker_by_name_db(worker_name, online_only=True)
        if not worker:
            raise KeyError(f"unknown or offline worker: {worker_name}")
        worker_id = worker["id"]

    if worker_id and not get_worker_db(worker_id):
        raise KeyError(f"unknown worker: {worker_id}")

    task_id = str(uuid.uuid4())
    task = insert_task(
        task_id=task_id,
        task_type=task_type,
        payload=payload,
        worker_id=worker_id,
    )
    return task


def poll_task(worker_id: str) -> dict[str, Any] | None:
    if not get_worker_db(worker_id):
        return None
    return poll_task_db(worker_id)


def complete_task(
    task_id: str,
    *,
    worker_id: str,
    status: str,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> dict[str, Any] | None:
    return complete_task_db(
        task_id,
        worker_id=worker_id,
        status=status,
        result=result,
        error=error,
    )


def get_task(task_id: str) -> dict[str, Any] | None:
    return get_task_db(task_id)


def list_tasks(*, limit: int = 50) -> list[dict[str, Any]]:
    return list_tasks_db(limit=limit)


def list_task_events(task_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
    return list_task_events_db(task_id, limit=limit)


def append_task_event(
    task_id: str,
    *,
    worker_id: str,
    event_type: str,
    message: str = "",
    detail: dict[str, Any] | None = None,
) -> bool:
    task = get_task_db(task_id)
    if not task:
        return False
    if task.get("worker_id") and task["worker_id"] != worker_id:
        return False
    if task["status"] not in ("pending", "running"):
        return False

    log_event(task_id, event_type, message, detail)

    if event_type in ("shell_blocked", "shell_denied"):
        try:
            from .constitution import audit_event

            audit_event(
                "worker_shell_blocked",
                {
                    "task_id": task_id,
                    "worker_id": worker_id,
                    "message": message,
                    "detail": detail or {},
                },
            )
        except Exception:
            pass

    return True


def reset_registry() -> None:
    reset_store()
